import dotenv from "dotenv";
import pkg from "pg";
import { fileURLToPath } from "node:url";
import { databaseOptions } from "./databaseOptions.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const { Pool } = pkg;
const pool = new Pool(databaseOptions(process.env));

pool.on("connect", () => {
  console.log("DB connected");
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export default pool;
