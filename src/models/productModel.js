import pool from "../config/db.js";

export async function ensureProductStockSchema(database = pool) {
  await database.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0)");
  await database.query(`CREATE OR REPLACE FUNCTION enforce_product_stock_approval() RETURNS trigger AS $$
    BEGIN
      IF NEW.quantity = 0 THEN NEW."isApproved" := FALSE; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`);
  await database.query(`CREATE OR REPLACE TRIGGER product_stock_approval
    BEFORE INSERT OR UPDATE OF quantity, "isApproved" ON products
    FOR EACH ROW EXECUTE FUNCTION enforce_product_stock_approval()`);
  await database.query('UPDATE products SET "isApproved" = FALSE WHERE quantity = 0 AND "isApproved" = TRUE');
}

export async function ensureProductMediaSchema(database = pool) {
  await database.query(`ALTER TABLE products
    ADD COLUMN IF NOT EXISTS size VARCHAR(50) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS image_data BYTEA,
    ADD COLUMN IF NOT EXISTS image_mime VARCHAR(20),
    ADD COLUMN IF NOT EXISTS image_version INTEGER NOT NULL DEFAULT 0`);
  await database.query("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_size VARCHAR(50) NOT NULL DEFAULT ''");
}

const columns = `id, name, category, price::float8 AS price, "isApproved", size, quantity,
  CASE WHEN image_data IS NOT NULL THEN '/api/product-images/' || id || '?v=' || image_version ELSE NULL END AS image_url`;

export async function getAllProducts() {
  const result = await pool.query(
    `SELECT ${columns} FROM products ORDER BY id DESC`,
  );
  return result.rows;
}

export async function getApprovedProducts() {
  const result = await pool.query(
    `SELECT ${columns} FROM products WHERE "isApproved" = TRUE AND quantity > 0 ORDER BY id DESC`,
  );
  return result.rows;
}

export async function insertProduct({ name, category, price, isApproved, size = "", image, quantity = 0 }) {
  const result = await pool.query(
    `INSERT INTO products (name, category, price, "isApproved", size, image_data, image_mime, quantity)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${columns}`,
    [name, category, price, isApproved && quantity > 0, size, image?.data ?? null, image?.mime ?? null, quantity],
  );
  return result.rows[0];
}

export async function updateProductById(id, { name, category, price, isApproved, size, image, replaceImage = false, quantity }) {
  const result = await pool.query(
    `UPDATE products SET name = $1, category = $2, price = $3, "isApproved" = $4 AND COALESCE($10::integer, quantity) > 0,
      quantity = COALESCE($10::integer, quantity),
      size = COALESCE($6, size),
      image_data = CASE WHEN $7 THEN $8::bytea ELSE image_data END,
      image_mime = CASE WHEN $7 THEN $9::varchar ELSE image_mime END,
      image_version = image_version + CASE WHEN $7 THEN 1 ELSE 0 END
      WHERE id = $5 RETURNING ${columns}`,
    [name, category, price, isApproved, id, size ?? null, replaceImage, image?.data ?? null, image?.mime ?? null, quantity ?? null],
  );
  return result.rows[0] ?? null;
}
