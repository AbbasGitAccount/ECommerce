import dotenv from "dotenv";
import pkg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const { Pool } = pkg;
const useSsl = process.env.DB_SSL === "true" || process.env.DB_HOST?.endsWith(".neon.tech");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
  ssl: useSsl ? true : undefined,
});

pool.on("connect", () => {
  console.log("DB connected");
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export default pool;
