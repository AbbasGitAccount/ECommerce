import pool from "./db.js";
import { ensureAddressSchema } from "../models/addressModel.js";
import { ensureProductMediaSchema, ensureProductStockSchema } from "../models/productModel.js";
import { databaseConfigurationIssue } from "./databaseOptions.js";

let readiness;
export function initializeDatabase() {
  if (!readiness) readiness = migrate().catch((error) => { readiness = undefined; throw error; });
  return readiness;
}

async function migrate() {
  const issue = databaseConfigurationIssue(process.env);
  if (issue) throw Object.assign(new Error("Database configuration is missing or invalid"), { code: issue });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(76415902)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(80) NOT NULL,
        price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
        "isApproved" BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        username TEXT,
        password_hash TEXT
      )
    `);
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT");
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'role'
        ) THEN
          ALTER TABLE users ADD COLUMN role SMALLINT NOT NULL DEFAULT 2 CHECK (role IN (1, 2));
          UPDATE users SET role = 1 WHERE id = (SELECT MIN(id) FROM users);
        END IF;
      END $$
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
      ON users (LOWER(username))
      WHERE username IS NOT NULL
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        total_amount NUMERIC(16, 2) NOT NULL CHECK (total_amount >= 0),
        item_count INTEGER NOT NULL CHECK (item_count > 0),
        status TEXT NOT NULL DEFAULT 'booked',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 999),
        unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
        subtotal NUMERIC(16, 2) NOT NULL CHECK (subtotal >= 0),
        UNIQUE (order_id, product_id)
      )
    `);
    await ensureAddressSchema(client);
    await ensureProductMediaSchema(client);
    await ensureProductStockSchema(client);
    await client.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at)");
    await client.query("DELETE FROM auth_sessions WHERE expires_at <= NOW()");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
