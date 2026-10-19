# ECommerce Demo

A React and Express application backed by PostgreSQL, with customer registration, session authentication, product management, ordering, and Ask Your Data.

## Run locally

Requires Node.js with npm and a PostgreSQL database.

1. Run `npm install`.
2. Copy `src/.env.example` to `src/.env` and set your database credentials. Create the database specified by `DB_NAME` before starting the app.
3. Start the backend with `npm start`. Tables are initialized automatically.
4. In another terminal, start the frontend with `npm run dev:client`.
5. Open `http://localhost:5173`.

The frontend proxies `/api` to the backend port configured in `src/.env`. Keep this file private; it is excluded from Git.

## Checks

- `npm test` runs the Ask Your Data backend tests.
- `npm run build:client` creates the frontend production build in `dist`.

See [Ask Your Data](ASK_YOUR_DATA.md) for supported questions and access rules. Customers query their own orders; admins may query all users. No AI API key is required.
