import { createHash, randomBytes } from "node:crypto";
import pool from "../config/db.js";

const sessionAge = 8 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" };
const sessionToken = (req) => (req.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith("session="))?.slice(8);

const hash = (token) => createHash("sha256").update(token).digest("hex");
const validToken = (token) => typeof token === "string" && /^[a-f0-9]{64}$/.test(token);

export async function startSession(req, res, user) {
  const oldToken = sessionToken(req);
  if (validToken(oldToken)) await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [hash(oldToken)]);
  const token = randomBytes(32).toString("hex");
  await pool.query("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)", [hash(token), user.id, new Date(Date.now() + sessionAge)]);
  res.cookie("session", token, { ...cookieOptions, maxAge: sessionAge });
}

export async function logout(req, res, next) {
  try {
    const token = sessionToken(req);
    if (validToken(token)) await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [hash(token)]);
    res.clearCookie("session", cookieOptions);
    res.json({ status: 200, message: "Logged out" });
  } catch (error) { next(error); }
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    const token = sessionToken(req);
    if (!validToken(token)) {
      return res.status(401).json({ status: 401, message: "Please log in again" });
    }
    try {
      const result = await pool.query(`SELECT u.id, u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at > NOW()`, [hash(token)]);
      const user = result.rows[0];
      if (!user) return res.status(401).json({ status: 401, message: "Please log in again" });
      if (!roles.includes(user.role)) return res.status(403).json({ status: 403, message: "You do not have access to this action" });
      req.user = user;
      next();
    } catch (error) { next(error); }
  };
}
