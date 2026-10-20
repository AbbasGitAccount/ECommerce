import { sessionQueries } from "../testing/sessionQueries.js";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pool from "../config/db.js";
import router, { addressSchema } from "../routes/addressRoutes.js";
import { startSession } from "../middleware/auth.js";
import { saveAddress, listAddresses, deleteAddress } from "./addressModel.js";
import { insertOrder } from "./orderModel.js";
import { createOrder } from "../controller/orderController.js";

const address = { recipient: "Test Customer", phone: "+91 9876543210", line1: "10 Test Street", line2: "", city: "Test City", state: "Test State", postal_code: "123456", country: "India" };

test("address validation requires delivery fields and rejects ownership overrides", () => {
  assert.equal(addressSchema.validate(address).error, undefined);
  for (const body of [{ ...address, user_id: 99 }, { ...address, recipient: " " }, { ...address, phone: "......." }, { ...address, postal_code: "" }, { ...address, line1: "x".repeat(201) }]) {
    assert.ok(addressSchema.validate(body).error);
  }
});

test("address CRUD always scopes SQL to the authenticated user", async () => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; };
  try {
    await listAddresses(7);
    await saveAddress(7, address);
    assert.equal(await saveAddress(7, address, 42), undefined);
    assert.equal(await deleteAddress(7, 42), undefined);
    assert.deepEqual(calls[0].values, [7]);
    assert.equal(calls[1].values[0], 7);
    assert.match(calls[2].sql, /WHERE user_id=\$1 AND id=\$10/);
    assert.equal(calls[2].values.at(-1), 42);
    assert.match(calls[3].sql, /WHERE user_id=\$1 AND id=\$2/);
    assert.deepEqual(calls[3].values, [7, 42]);
  } finally { pool.query = original; }
});

test("HTTP address routes require login and reject arbitrary owner fields and missing foreign addresses", async () => {
  const original = pool.query;
  pool.query = sessionQueries();
  let cookie;
  await startSession({ headers: {} }, { cookie(_name, token) { cookie = `session=${token}`; } }, { id: 7 });
  const app = express(); app.use(express.json()); app.use("/api", router);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ message: "Invalid request" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (method, path, body, loggedIn = true) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method, headers: { "Content-Type": "application/json", ...(loggedIn ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    assert.equal((await request("GET", "/addresses", null, false)).status, 401);
    assert.equal((await request("GET", "/addresses")).status, 200);
    assert.equal((await request("POST", "/addresses", { ...address, user_id: 1 })).status, 400);
    assert.equal((await request("PUT", "/addresses/42", address)).status, 404);
    assert.equal((await request("DELETE", "/addresses/42")).status, 404);
    assert.equal((await request("DELETE", "/addresses/not-a-number")).status, 400);
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); pool.query = original;
  }
});

test("booking rejects missing delivery address before starting an order", async () => {
  let status;
  await createOrder({ user: { id: 7 }, body: { items: [{ productId: 1, quantity: 1 }] } }, {
    status(code) { status = code; return this; }, json(body) { assert.match(body.message, /delivery address/); },
  }, () => assert.fail("Invalid booking must not reach next"));
  assert.equal(status, 400);
});

test("booking refuses another user's address and rolls back", async () => {
  const original = pool.connect;
  const calls = []; let released = false;
  pool.connect = async () => ({
    async query(sql, values) { calls.push({ sql, values }); return { rows: sql.startsWith("SELECT id FROM users") ? [{ id: 7 }] : [] }; },
    release() { released = true; },
  });
  try {
    await assert.rejects(insertOrder(7, [{ productId: 1, quantity: 1 }], 42), { status: 404 });
    assert.deepEqual(calls.find((call) => call.sql.includes("FROM user_addresses")).values, [7, 42]);
    assert.equal(calls.at(-1).sql, "ROLLBACK"); assert.equal(released, true);
    assert.ok(!calls.some((call) => call.sql.startsWith("INSERT")));
  } finally { pool.connect = original; }
});

test("booking stores an independent address snapshot alongside the order", async () => {
  const original = pool.connect;
  const calls = [];
  pool.connect = async () => ({
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: 7 }] };
      if (sql.includes("FROM user_addresses")) return { rows: [address] };
      if (sql.includes("FROM products")) return { rows: [{ id: 1, name: "Product", price: "10.00", quantity: 2, isApproved: true }] };
      if (sql.startsWith("UPDATE products")) return { rows: [{ id: 1 }] };
      if (sql.startsWith("INSERT INTO orders")) return { rows: [{ id: 9, delivery_address: JSON.parse(values[3]) }] };
      return { rows: [] };
    }, release() {},
  });
  try {
    const result = await insertOrder(7, [{ productId: 1, quantity: 2 }], 42);
    assert.deepEqual(result.delivery_address, address);
    const saved = calls.find((call) => call.sql.startsWith("INSERT INTO orders"));
    assert.equal(saved.values[1], "20.00");
    assert.deepEqual(JSON.parse(saved.values[3]), address);
    const locked = calls.find((call) => call.sql.includes("FROM products"));
    assert.match(locked.sql, /ORDER BY id FOR UPDATE/);
    const stock = calls.find((call) => call.sql.startsWith("UPDATE products"));
    assert.deepEqual(stock.values, [1, 2]);
    assert.match(stock.sql, /quantity >= \$2/);
    assert.equal(calls.at(-1).sql, "COMMIT");
  } finally { pool.connect = original; }
});

test("insufficient stock prevents order creation and rolls back", async () => {
  const original = pool.connect;
  const calls = [];
  pool.connect = async () => ({
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: 7 }] };
      if (sql.includes("FROM user_addresses")) return { rows: [address] };
      if (sql.includes("FROM products")) return { rows: [{ id: 1, name: "Product", price: "10.00", quantity: 1, isApproved: true }] };
      return { rows: [] };
    }, release() {},
  });
  try {
    await assert.rejects(insertOrder(7, [{ productId: 1, quantity: 2 }], 42), { status: 409 });
    assert.ok(!calls.some((sql) => sql.startsWith("INSERT")));
    assert.equal(calls.at(-1), "ROLLBACK");
  } finally { pool.connect = original; }
});
