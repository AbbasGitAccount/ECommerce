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
  assert.match(db.calls.find((call) => call.values).sql, /LIMIT 5/);
  assert.deepEqual(db.calls.find((call) => call.values).values, [7]);
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
  pool.query = async (_sql, values) => ({ rows: [{ id: values[0], role: values[0] === 1 ? 1 : 2 }] });
  pool.connect = () => db.connect();
  const cookie = (id) => {
    let value;
    startSession({ headers: {} }, { cookie(_name, token) { value = `session=${token}`; } }, { id });
    return value;
  };
  const customer = cookie(7);
  const admin = cookie(1);
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (body, session) => fetch(`http://127.0.0.1:${server.address().port}/api/ask-data`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(session ? { Cookie: session } : {}) }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await request({ question: "My total order amount" })).status, 401);
    assert.equal((await request({ question: "My total order amount", scope: "all" }, customer)).status, 403);
    for (const body of [null, {}, { question: "x" }, { question: "x".repeat(501) }, { question: "My total amount", userId: 1 }, { question: "My total amount", scope: "invalid" }]) {
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
