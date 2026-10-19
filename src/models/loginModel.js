import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import pool from "../config/db.js";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

const hashPassword = async (password) => {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
};

const verifyPassword = async (password, storedHash) => {
  const [salt, hash] = (storedHash ?? "").split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const registerLoginUser = async (username, password, { name = username, email = "", role = 2 } = {}) => {
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    `INSERT INTO users (name, email, username, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, username, email, role`,
    [name, email, username, passwordHash, role],
  );
  return result.rows[0];
};

export const findLoginUser = async (username, password) => {
  const result = await pool.query(
    `SELECT id, name, username, email, password_hash, role
     FROM users
     WHERE LOWER(username) = LOWER($1)
     LIMIT 1`,
    [username],
  );
  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) return null;

  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
};
