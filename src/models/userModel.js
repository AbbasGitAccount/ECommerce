import pool from "../config/db.js";

export const getAllUsersService = async () => {
  const result = await pool.query("SELECT id, name, email, username, role FROM users ORDER BY id");
  return result.rows;
};

export const getUserByIdService = async (id) => {
  const result = await pool.query("SELECT id, name, email, username FROM users WHERE id = $1", [id]);
  return result.rows[0] ?? null;
};

export const createUserService = async (name, email,username,password_hash) => {
  const result = await pool.query(
    "INSERT INTO users (name, email,username,password_hash) VALUES ($1, $2,$3,$4) RETURNING id, name, email, username",
    [username, email],
  );
  return result.rows[0];
};

export const updateUserService = async (id, username, email) => {
  const result = await pool.query(
    "UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, username",
    [username, email, id],
  );
  return result.rows[0] ?? null;
};

export const deleteUserService = async (id) => {
  const result = await pool.query(
    "DELETE FROM users WHERE id = $1 RETURNING id, name, email, username",
    [id],
  );
  return result.rows[0] ?? null;
};


