import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pool from "../config/db.js";
import router from "../routes/orderRoutes.js";
import { startSession } from "../middleware/auth.js";
import { sessionQueries } from "../testing/sessionQueries.js";
import errorHandler from "../middleware/errorHandler.js";

test("only admins can advance orders through booked, out for delivery and delivered", async () => {
  const original = pool.query;
  const orders = new Map([[9, "booked"]]);
  const updates = [];
  pool.query = sessionQueries(async (sql, values) => {
    if (sql.startsWith("UPDATE orders")) {
      updates.push({ sql, values });
      const [id, status, previous] = values;
      if ([status, previous].includes(orders.get(id))) {
        orders.set(id, status); return { rows: [{ id, status }] };
      }
      return { rows: [] };
    }
    if (sql.startsWith("SELECT id FROM orders")) return { rows: orders.has(values[0]) ? [{ id: values[0] }] : [] };
    return { rows: [] };
  });
  const cookie = async (id) => {
    let value;
    await startSession({ headers: {} }, { cookie(_name, token) { value = `session=${token}`; } }, { id });
    return value;
  };
  const admin = await cookie(1), customer = await cookie(7);
  const app = express(); app.use(express.json()); app.use("/api", router); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (body, session = admin, id = "9") => fetch(`http://127.0.0.1:${server.address().port}/api/orders/${id}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json", ...(session ? { Cookie: session } : {}) }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await request({ status: "out_for_delivery" }, null)).status, 401);
    assert.equal((await request({ status: "out_for_delivery" }, customer)).status, 403);
    assert.equal(updates.length, 0);
    for (const body of [{}, { status: "cancelled" }, { status: "booked" }, { status: "delivered", userId: 1 }]) {
      assert.equal((await request(body)).status, 400);
    }
    assert.equal((await request({ status: "delivered" }, admin, "no-id")).status, 400);
    assert.equal((await request({ status: "delivered" }, admin, "2147483648")).status, 400);
    assert.equal(updates.length, 0);
    assert.equal((await request({ status: "delivered" })).status, 409);
    assert.equal(orders.get(9), "booked");
    const delivery = await request({ status: "out_for_delivery" });
    assert.equal(delivery.status, 200);
    assert.deepEqual((await delivery.json()).data, { id: 9, status: "out_for_delivery" });
    // Retrying the same update is safe, including two admins submitting it.
    assert.equal((await request({ status: "out_for_delivery" })).status, 200);
    const delivered = await request({ status: "delivered" });
    assert.equal(delivered.status, 200);
    assert.equal((await delivered.json()).data.status, "delivered");
    assert.equal((await request({ status: "out_for_delivery" })).status, 409);
    assert.equal((await request({ status: "delivered" }, admin, "999")).status, 404);
    assert.equal(orders.get(9), "delivered");
    assert.match(updates[0].sql, /WHERE id=\$1 AND status IN \(\$2, \$3\)/);
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); pool.query = original;
  }
});
