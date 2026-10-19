import pool from "../config/db.js";

export async function getAllProducts() {
  const result = await pool.query(
    'SELECT id, name, category, price::float8 AS price, "isApproved" FROM products ORDER BY id DESC',
  );
  return result.rows;
}

export async function getApprovedProducts() {
  const result = await pool.query(
    'SELECT id, name, category, price::float8 AS price, "isApproved" FROM products WHERE "isApproved" = TRUE ORDER BY id DESC',
  );
  return result.rows;
}

export async function insertProduct({ name, category, price, isApproved }) {
  const result = await pool.query(
    'INSERT INTO products (name, category, price, "isApproved") VALUES ($1, $2, $3, $4) RETURNING id, name, category, price::float8 AS price, "isApproved"',
    [name, category, price, isApproved],
  );
  return result.rows[0];
}

export async function updateProductById(id, { name, category, price, isApproved }) {
  const result = await pool.query(
    'UPDATE products SET name = $1, category = $2, price = $3, "isApproved" = $4 WHERE id = $5 RETURNING id, name, category, price::float8 AS price, "isApproved"',
    [name, category, price, isApproved, id],
  );
  return result.rows[0] ?? null;
}
