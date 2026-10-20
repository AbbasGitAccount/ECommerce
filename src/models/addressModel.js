import pool from "../config/db.js";

export async function ensureAddressSchema(database = pool) {
  await database.query(`CREATE TABLE IF NOT EXISTS user_addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    line1 VARCHAR(200) NOT NULL,
    line2 VARCHAR(200) NOT NULL DEFAULT '',
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await database.query("CREATE INDEX IF NOT EXISTS user_addresses_user_id_idx ON user_addresses(user_id)");
  await database.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address JSONB");
}

export async function listAddresses(userId) {
  return (await pool.query("SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY id", [userId])).rows;
}

export async function saveAddress(userId, address, id = null) {
  const values = [userId, address.recipient, address.phone, address.line1, address.line2,
    address.city, address.state, address.postal_code, address.country];
  const result = id === null
    ? await pool.query(`INSERT INTO user_addresses (user_id, recipient, phone, line1, line2, city, state, postal_code, country)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, values)
    : await pool.query(`UPDATE user_addresses SET recipient=$2, phone=$3, line1=$4, line2=$5,
        city=$6, state=$7, postal_code=$8, country=$9, updated_at=NOW()
        WHERE user_id=$1 AND id=$10 RETURNING *`, [...values, id]);
  return result.rows[0];
}

export async function deleteAddress(userId, id) {
  return (await pool.query("DELETE FROM user_addresses WHERE user_id=$1 AND id=$2 RETURNING id", [userId, id])).rows[0];
}
