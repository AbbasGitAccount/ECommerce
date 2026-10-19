import { randomBytes } from "node:crypto";
import pool from "../config/db.js";

const sessions = new Map();
const sessionAge = 8 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" };
const sessionToken = (req) => (req.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith("session="))?.slice(8);

export function startSession(req, res, user) {
  sessions.delete(sessionToken(req));
  for (const [token, session] of sessions) if (session.expires <= Date.now()) sessions.delete(token);
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expires: Date.now() + sessionAge });
  res.cookie("session", token, { ...cookieOptions, maxAge: sessionAge });
}

export function logout(req, res) {
  sessions.delete(sessionToken(req));
  res.clearCookie("session", cookieOptions);
  res.json({ status: 200, message: "Logged out" });
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    const token = sessionToken(req);
    const session = sessions.get(token);
    if (!session || session.expires <= Date.now()) {
      sessions.delete(token);
      return res.status(401).json({ status: 401, message: "Please log in again" });
    }
    try {
      const result = await pool.query("SELECT id, role FROM users WHERE id = $1", [session.userId]);
      const user = result.rows[0];
      if (!user) return res.status(401).json({ status: 401, message: "Please log in again" });
      if (!roles.includes(user.role)) return res.status(403).json({ status: 403, message: "You do not have access to this action" });
      req.user = user;
      next();
    } catch (error) { next(error); }
  };
}
