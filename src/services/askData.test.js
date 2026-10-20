import { sessionQueries } from "../testing/sessionQueries.js";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pool from "../config/db.js";
import { startSession } from "../middleware/auth.js";
import router from "../routes/askDataRoutes.js";
import { answerOrderQuestion, interpretQuestion } from "./askData.js";

test("recognizes supported questions and refuses SQL instructions", () => {
  assert.equal(interpretQuestion("What is my total order amount?"), "total");
  assert.equal(interpretQuestion("How many orders do I have?"), "count");
  assert.equal(interpretQuestion("What is my average order amount?"), "average");
  assert.equal(interpretQuestion("Show my recent orders"), "recent");
  assert.equal(interpretQuestion("How many customers are there?"), "customerCount");
  assert.equal(interpretQuestion("Show all customers"), "customers");
  assert.equal(interpretQuestion("Show order totals by customer"), "customers");
  assert.equal(interpretQuestion("Show all orders"), "orders");
  assert.equal(interpretQuestion("DROP TABLE orders; total amount"), null);
});

function fakeDatabase(rows, queryError) {
  const calls = [];
  let released = false;
  return {
    calls, get released() { return released; },
    async connect() {
      return {
        async query(sql, values) {
          calls.push({ sql, values });
          if (sql.startsWith("SELECT")) {
            if (queryError) throw queryError;
            return { rows };
          }
          return { rows: [] };
        },
        release() { released = true; },
      };
    },
  };
}
const totals = [{ order_count: "4", total_amount: "230.00", average_amount: "57.50" }];

test("customer totals use the authenticated user id in a read-only transaction", async () => {
  const db = fakeDatabase(totals);
  const result = await answerOrderQuestion({ id: 7, role: 2 }, { question: "What is my total order amount?", scope: "mine" }, db);
  assert.match(result.answer, /\$230\.00 across 4 orders/);
  assert.equal(db.calls[0].sql, "BEGIN READ ONLY");
  assert.deepEqual(db.calls.find((call) => call.values).values, [7]);
  assert.match(db.calls.find((call) => call.values).sql, /user_id = \$1/);
  assert.equal(db.calls.at(-1).sql, "COMMIT");
  assert.equal(db.released, true);
});

test("only explicit admin all scope removes the ownership filter", async () => {
  for (const scope of ["mine", "all"]) {
    const db = fakeDatabase(totals);
    await answerOrderQuestion({ id: 1, role: 1 }, { question: "What is the total order amount?", scope }, db);
    assert.deepEqual(db.calls.find((call) => call.values).values, [scope === "all" ? null : 1]);
  }
});

test("cross-user requests, unsupported filters, and injections never reach the database", async () => {
  const db = fakeDatabase(totals);
  for (const payload of [
    { question: "What is the total order amount?", scope: "all" },
    { question: "What is the total amount across all users?", scope: "mine" },
    { question: "What is user 8 total amount?", scope: "mine" },
    { question: "What is my total amount this month?", scope: "mine" },
    { question: "DROP TABLE orders; total amount", scope: "mine" },
  ]) {
    await assert.rejects(answerOrderQuestion({ id: 7, role: 2 }, payload, db), (error) => [400, 403].includes(error.status));
  }
  assert.deepEqual(db.calls, []);
});

test("empty orders produce zero and recent orders are bounded and scoped", async () => {
  const empty = fakeDatabase([{ order_count: "0", total_amount: "0", average_amount: "0" }]);
  const answer = await answerOrderQuestion({ id: 7, role: 2 }, { question: "My total order amount", scope: "mine" }, empty);
  assert.match(answer.answer, /\$0\.00 across 0 orders/);
  const db = fakeDatabase([]);
  const recent = await answerOrderQuestion({ id: 7, role: 2 }, { question: "Show my recent orders", scope: "mine" }, db);
  assert.deepEqual(recent.orders, []);
  assert.match(recent.answer, /no orders/);
  assert.match(db.calls.find((call) => call.values).sql, /LIMIT \$2/);
  assert.deepEqual(db.calls.find((call) => call.values).values, [7, 5, 0]);
});

test("admin customer count excludes admins and customer totals include customers with no orders", async () => {
  const countDb = fakeDatabase([{ customer_count: "3" }]);
  const count = await answerOrderQuestion({ id: 1, role: 1 }, { question: "How many customers are there?", scope: "all" }, countDb);
  assert.match(count.answer, /3 customer accounts/);
  assert.deepEqual(countDb.calls.find((call) => call.values).values, [2]);
  const db = fakeDatabase([{ id: 7, name: "No orders", username: "customer", order_count: "0", total_amount: "0" }]);
  const result = await answerOrderQuestion({ id: 1, role: 1 }, { question: "Show order totals by customer", scope: "all" }, db);
  assert.equal(result.customers[0].total_amount, "0");
  const query = db.calls.find((call) => call.values);
  assert.match(query.sql, /LEFT JOIN orders/);
  assert.match(query.sql, /COUNT\(o.id\)/);
  assert.deepEqual(query.values, [2, 0]);
  assert.equal(result.nextOffset, null);
});

test("customer reports require admin all scope even when called directly", async () => {
  const db = fakeDatabase([]);
  for (const user of [{ id: 7, role: 2 }, { id: 1, role: 1 }]) {
    await assert.rejects(answerOrderQuestion(user, { question: "Show customers", scope: "mine" }, db), (error) => [400, 403].includes(error.status));
  }
  await assert.rejects(answerOrderQuestion({ id: 7, role: 2 }, { question: "How many customers are there?", scope: "all" }, db), { status: 403 });
  assert.equal(db.calls.length, 0);
});

test("customer and order lists paginate with parameterized offsets and keep own orders scoped", async () => {
  const rows = Array.from({ length: 51 }, (_, id) => ({ id }));
  for (const question of ["Show all customers", "Show all orders"]) {
    const db = fakeDatabase(rows);
    const result = await answerOrderQuestion({ id: 1, role: 1 }, { question, scope: "all", offset: 50 }, db);
    assert.equal((result.customers || result.orders).length, 50);
    assert.equal(result.nextOffset, 100);
    const query = db.calls.find((call) => call.values);
    assert.equal(query.values.at(-1), 50);
    assert.match(query.sql, /OFFSET \$/);
  }
  const ownDb = fakeDatabase([]);
  await answerOrderQuestion({ id: 7, role: 2 }, { question: "Show my orders", scope: "mine", offset: 50 }, ownDb);
  assert.deepEqual(ownDb.calls.find((call) => call.values).values, [7, 51, 50]);
});

test("admin natural question for all customers can calculate total spending", async () => {
  const db = fakeDatabase(totals);
  const result = await answerOrderQuestion({ id: 1, role: 1 }, { question: "What is the total order amount for all customers?", scope: "all" }, db);
  assert.match(result.answer, /\$230\.00/);
  assert.deepEqual(db.calls.find((call) => call.values).values, [null]);
});

test("database failure rolls back and releases the connection", async () => {
  const db = fakeDatabase([], new Error("query failed"));
  await assert.rejects(answerOrderQuestion({ id: 7, role: 2 }, { question: "My total order amount", scope: "mine" }, db), /query failed/);
  assert.equal(db.calls.at(-1).sql, "ROLLBACK");
  assert.equal(db.released, true);
});

test("HTTP endpoint enforces sessions, role restrictions, and strict request validation", async () => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const db = fakeDatabase(totals);
  pool.query = sessionQueries();
  pool.connect = () => db.connect();
  const cookie = async (id) => {
    let value;
    await startSession({ headers: {} }, { cookie(_name, token) { value = `session=${token}`; } }, { id });
    return value;
  };
  const customer = await cookie(7);
  const admin = await cookie(1);
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: "Invalid request" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (body, session) => fetch(`http://127.0.0.1:${server.address().port}/api/ask-data`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(session ? { Cookie: session } : {}) }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await request({ question: "My total order amount" })).status, 401);
    assert.equal((await request({ question: "My total order amount", scope: "all" }, customer)).status, 403);
    for (const body of [null, {}, { question: "x" }, { question: "x".repeat(501) }, { question: "My total amount", userId: 1 }, { question: "My total amount", scope: "invalid" }, { question: "Show my orders", offset: -1 }, { question: "Show my orders", offset: 1.5 }, { question: "Show my orders", offset: 1000001 }]) {
      assert.equal((await request(body, customer)).status, 400);
    }
    const own = await request({ question: "My total order amount" }, customer);
    assert.equal(own.status, 200);
    assert.equal((await own.json()).data.scope, "mine");
    const all = await request({ question: "Total amount across all users", scope: "all" }, admin);
    assert.equal(all.status, 200);
    assert.match((await all.json()).data.answer, /Across all users/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }
});
