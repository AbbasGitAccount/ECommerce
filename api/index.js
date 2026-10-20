import app from "../src/app.js";
import { initializeDatabase } from "../src/config/schema.js";

export default async function handler(req, res) {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error("Database initialization failed:", error.code || "database_error");
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ message: "Service temporarily unavailable. Please try again later." });
  }
  return app(req, res);
}
