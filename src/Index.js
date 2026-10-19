import express from "express";
import cors from "cors";
import pool from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import loginRoutes from "./routes/loginRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import askDataRoutes from "./routes/askDataRoutes.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

//middleware 

app.use(express.json());
app.use(cors());

//routing
app.use("/api",userRoutes);
app.use("/api/auth", loginRoutes);
app.use("/api", productRoutes);
app.use("/api", orderRoutes);
app.use("/api", askDataRoutes);

//error handling//
app.use(errorHandler);

///testing postgre

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT current_database()");
    res.send(`The database name is: ${result.rows[0].current_database}`);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Database connection error");
  }
});

async function startServer() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(80) NOT NULL,
        price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
        "isApproved" BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        username TEXT,
        password_hash TEXT
      )
    `);
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT");
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'role'
        ) THEN
          ALTER TABLE users ADD COLUMN role SMALLINT NOT NULL DEFAULT 2 CHECK (role IN (1, 2));
          UPDATE users SET role = 1 WHERE id = (SELECT MIN(id) FROM users);
        END IF;
      END $$
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
      ON users (LOWER(username))
      WHERE username IS NOT NULL
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        total_amount NUMERIC(16, 2) NOT NULL CHECK (total_amount >= 0),
        item_count INTEGER NOT NULL CHECK (item_count > 0),
        status TEXT NOT NULL DEFAULT 'booked',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 999),
        unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
        subtotal NUMERIC(16, 2) NOT NULL CHECK (subtotal >= 0),
        UNIQUE (order_id, product_id)
      )
    `);
    console.log("Users, products, and order tables are ready");
    app.listen(port, () => console.log(`Server is running on port: ${port}`));
  } catch (error) {
    console.error("Could not initialize the database tables:", error.message);
    await pool.end();
    process.exitCode = 1;
  }
}

startServer();
