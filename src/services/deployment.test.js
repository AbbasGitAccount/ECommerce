import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createHash } from "node:crypto";
import pool from "../config/db.js";
import handler from "../../api/index.js";
import { startSession, logout } from "../middleware/auth.js";
import { sessionQueries } from "../testing/sessionQueries.js";
import { readApiResponse } from "../../client/src/api.js";

test("frontend response reader handles error pages and malformed JSON without showing parser errors", async () => {
  await assert.rejects(readApiResponse(new Response("The page could not be found", { status: 404 })), /HTTP 404/);
  await assert.rejects(readApiResponse(new Response("not json", { headers: { "Content-Type": "application/json" } })), /invalid response/);
  assert.deepEqual(await readApiResponse(new Response('{"message":"Invalid credentials"}', { status: 401, headers: { "Content-Type": "application/json" } })), { message: "Invalid credentials" });
});

test("sessions survive separate module instances and are revoked on logout or expiry", async () => {
  const originalQuery = pool.query;
  const database = sessionQueries();
  pool.query = database;
  const app = express();
  const otherInstance = await import("../middleware/auth.js?deployment-test-instance");
  app.get("/protected", otherInstance.requireRole(2), (req, res) => res.json({ id: req.user.id }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let cookie;
  const response = { cookie(_name, value) { cookie = `session=${value}`; }, clearCookie() {}, json() {} };
  const request = () => fetch(`http://127.0.0.1:${server.address().port}/protected`, { headers: { Cookie: cookie } });
  try {
    await startSession({ headers: {} }, response, { id: 7 });
    const rawToken = cookie.slice(8);
    assert.ok(!database.sessions.has(rawToken));
    assert.ok(database.sessions.has(createHash("sha256").update(rawToken).digest("hex")));
    assert.equal((await request()).status, 200);
    await logout({ headers: { cookie } }, response, (err) => { throw err; });
    assert.equal((await request()).status, 401);
    await startSession({ headers: {} }, response, { id: 7 });
    for (const session of database.sessions.values()) session.expires = new Date(0);
    assert.equal((await request()).status, 401);
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); pool.query = originalQuery;
  }
});

test("deployed handler returns JSON for database failures, login validation, health and unknown routes", async () => {
  const originalConnect = pool.connect;
  const app = express(); app.use(handler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const calls = [];
  let connections = 0;
  pool.connect = async () => { throw Object.assign(new Error("private database error"), { code: "TEST_UNAVAILABLE" }); };
  try {
    const failure = await fetch(`${url}/api/health`);
    assert.equal(failure.status, 503);
    assert.ok(!(JSON.stringify(await failure.json())).includes("private database error"));
    pool.connect = async () => {
      connections++;
      return { async query(sql) { calls.push(sql); return { rows: [] }; }, release() {} };
    };
    const health = await fetch(`${url}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    const login = await fetch(`${url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(login.status, 400);
    assert.match((await login.json()).message, /Username and password/);
    const unknown = await fetch(`${url}/api/missing`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { message: "API endpoint not found" });
    assert.equal(connections, 1);
    assert.ok(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS auth_sessions")));
    assert.equal(calls.at(-1), "COMMIT");
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); pool.connect = originalConnect;
  }
});
