import app from "./app.js";
import pool from "./config/db.js";
import { initializeDatabase } from "./config/schema.js";

const port = Number(process.env.PORT) || 3001;
try {
  await initializeDatabase();
  app.listen(port, () => console.log(`Server is running on port: ${port}`));
} catch (error) {
  console.error("Could not initialize database:", error.message);
  await pool.end();
  process.exitCode = 1;
}
