import { sessionQueries } from "../testing/sessionQueries.js";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pool from "../config/db.js";
import { parseProductImage } from "./productImage.js";
import { insertProduct, updateProductById } from "../models/productModel.js";
import router from "../routes/productRoutes.js";
import { startSession } from "../middleware/auth.js";
import errorHandler from "../middleware/errorHandler.js";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const product = { name: "Test product", category: "Test", price: 10, isApproved: true, size: "M", quantity: 10 };

test("zero stock cannot be approved on create and omitted stock is preserved on update", async () => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql, values) => { calls.push({ sql, values }); return { rows: [{ id: 9 }] }; };
  try {
    await insertProduct({ ...product, quantity: 0 });
    assert.equal(calls[0].values[3], false);
    assert.equal(calls[0].values[7], 0);
    const { quantity: _quantity, ...withoutStock } = product;
    await updateProductById(9, withoutStock);
    assert.equal(calls[1].values[9], null);
    assert.match(calls[1].sql, /COALESCE\(\$10::integer, quantity\) > 0/);
  } finally { pool.query = original; }
});

test("image validation accepts raster images and rejects wrong signatures, SVG, invalid base64, and oversized uploads", () => {
  assert.equal(parseProductImage(png).mime, "image/png");
  assert.ok(Buffer.isBuffer(parseProductImage(png).data));
  assert.equal(parseProductImage(undefined), null);
  assert.equal(parseProductImage(null), null);
  for (const value of ["https://example.com/image.png", "data:image/svg+xml;base64,PHN2Zy8+", png.replace("image/png", "image/jpeg"), "data:image/png;base64,aaaa=", 123, `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64")}`]) {
    assert.throws(() => parseProductImage(value), { status: 400 });
  }
});

test("editing without an image preserves it, while explicit null removes it", async () => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql, values) => { calls.push({ sql, values }); return { rows: [{ id: 9 }] }; };
  try {
    await updateProductById(9, product);
    assert.equal(calls[0].values[6], false);
    assert.match(calls[0].sql, /ELSE image_data END/);
    await updateProductById(9, { ...product, replaceImage: true, image: null });
    assert.equal(calls[1].values[6], true);
    assert.equal(calls[1].values[7], null);
    assert.equal(calls[1].values[8], null);
    const image = parseProductImage(png);
    await updateProductById(9, { ...product, replaceImage: true, image });
    assert.deepEqual(calls[2].values[7], image.data);
    assert.equal(calls[2].values[8], "image/png");
    assert.match(calls[2].sql, /image_version = image_version/);
  } finally { pool.query = original; }
});

test("product HTTP routes enforce admin uploads, validate sizes, preserve images, and serve images with access filters", async () => {
  const original = pool.query;
  const calls = [];
  pool.query = sessionQueries(async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT id, role")) return { rows: [{ id: values[0], role: values[0] === 1 ? 1 : 2 }] };
    if (sql.startsWith("SELECT image_data")) return { rows: values[0] === 9 ? [{ image_data: parseProductImage(png).data, image_mime: "image/png" }] : [] };
    return { rows: [{ id: 9, ...product, image_url: "/api/product-images/9?v=1" }] };
  });
  const cookie = async (id) => {
    let result;
    await startSession({ headers: {} }, { cookie(_name, token) { result = `session=${token}`; } }, { id });
    return result;
  };
  const admin = await cookie(1), customer = await cookie(7);
  const app = express(); app.use(express.json({ limit: "3mb" })); app.use("/api", router); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (method, path, body, session = admin) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method, headers: { "Content-Type": "application/json", ...(session ? { Cookie: session } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    assert.equal((await request("POST", "/products", { ...product, image: png }, customer)).status, 403);
    assert.equal((await request("POST", "/products", { ...product, size: "x".repeat(51) })).status, 400);
    for (const quantity of [-1, 1.5, "10", null, 2147483648]) {
      assert.equal((await request("POST", "/products", { ...product, quantity })).status, 400);
      assert.equal((await request("PUT", "/products/9", { ...product, quantity })).status, 400);
    }
    assert.equal((await request("POST", "/products", { ...product, image: "bad image" })).status, 400);
    assert.equal((await request("POST", "/products", { ...product, image: png })).status, 201);
    const insert = calls.find((call) => call.sql.startsWith("INSERT INTO products"));
    assert.equal(insert.values[4], "M"); assert.ok(Buffer.isBuffer(insert.values[5]));
    assert.equal((await request("PUT", "/products/9", product)).status, 200);
    assert.equal(calls.find((call) => call.sql.startsWith("UPDATE products")).values[6], false);
    assert.equal((await request("GET", "/product-images/9", null, null)).status, 401);
    const response = await request("GET", "/product-images/9", null, customer);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), parseProductImage(png).data);
    const imageQuery = calls.find((call) => call.sql.startsWith("SELECT image_data"));
    assert.deepEqual(imageQuery.values, [9, 2]); assert.match(imageQuery.sql, /"isApproved"=TRUE/);
    assert.equal((await request("GET", "/product-images/999")).status, 404);
    assert.equal((await request("POST", "/products", { ...product, image: "x".repeat(3 * 1024 * 1024) })).status, 413);
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); pool.query = original;
  }
});
