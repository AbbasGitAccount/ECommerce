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

## Delivery addresses

Use **Delivery addresses** after logging in to add, edit, or remove your addresses. Each user manages only their own addresses through `/api/addresses` (GET/POST) and `/api/addresses/:id` (PUT/DELETE). Recipient, phone, street, city, state/region, postal code, and country are required; address line 2 is optional.

Startup creates `user_addresses`, its user foreign key and index, and adds a nullable `orders.delivery_address` JSONB column for historical compatibility. Existing orders remain unchanged. New bookings require an `addressId` belonging to the logged-in customer. The order stores a delivery-address snapshot so changing or deleting the saved address cannot alter existing orders. The **Orders** page displays these delivery details; admins can view them on all orders.

## Product sizes and images

Admins can enter an optional size (up to 50 characters, such as M, 42, or 500 ml) and upload one JPEG, PNG, or WebP image up to 2 MB when adding or editing a product. Size is a single product attribute; separate size variants can be created as separate products. Uploaded images are stored in PostgreSQL and served through an authenticated image endpoint. Customers can access only images of approved products.

Editing without choosing another image preserves the current image; **Remove image** restores the original package placeholder. Products with no upload, or an image that fails to load, use the original placeholder. Sizes appear on product cards and in the cart, and are copied into order items for history. Startup adds the required product media and order-item size columns while preserving existing products.

## Product stock

Products have a nonnegative integer `quantity` (stock). Admins enter stock when adding or editing a product. Zero stock forces `isApproved` to false in the API and through a PostgreSQL trigger. Increasing stock does not automatically approve the product; the admin must approve it. Purchasing shows only approved products with positive stock.

New and migrated products default to zero stock. Existing products with no recorded stock become unapproved until an admin enters actual stock and approves them. Existing order history is unchanged.

Checkout locks product rows in ID order, checks stock, and deducts ordered quantities in the same transaction as the order. Insufficient stock rejects the booking without creating an order or changing stock. Selling the last unit sets approval to false automatically. Cart controls cap quantities at available stock, while the backend checks again at booking time.

## Vercel deployment

Deploy the repository root, not just `client` or `dist`. `vercel.json` builds the Vite frontend into `dist` and routes `/api/*` to `api/index.js`, which runs Express. Vite's development proxy is not used in production.

In the Vercel project, set these backend environment variables for both **Production** and **Preview** using the same values as your working local database:

You can instead set **`DATABASE_URL`** (or **`POSTGRES_URL`**) to your PostgreSQL provider's full connection URL. A connection URL takes precedence over separate fields; its TLS parameters are handled by the PostgreSQL driver. Never include quote characters around values pasted into the Vercel environment variable editor. Use your provider's recommended TLS configuration; certificate verification is not disabled by the application.

- `DB_HOST`
- `DB_PORT` (usually 5432)
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_SSL` (`true` for hosted PostgreSQL requiring TLS)

Keep database credentials out of `VITE_*` variables: those are exposed to the browser. The database must be reachable from Vercel. Node.js 22 or 24 is suitable. The framework is Vite, build command `npm run build:client`, output directory `dist`, and root directory is the repository root. Redeploy after changing environment variables.

The API initializes schema once per server instance, serialized with a PostgreSQL advisory lock. Its database user needs permission to create/update this application's tables and trigger functions. Sessions are stored as hashed tokens in `auth_sessions` so authentication works across serverless instances. Old in-memory login sessions are invalidated by this upgrade: log in again. Cookies are secure in production; use HTTPS.

After deployment, open `/api/health`: it must return JSON `{"status":"ok"}`. A JSON 503 indicates a database connection or schema initialization problem; inspect Vercel function logs. A text/HTML 404 means the API function or routing has not been deployed. Frontend API errors now display a readable message instead of a JSON parser exception.

For 503 errors, look for **Database initialization failed:** in the Vercel runtime logs. The log includes a safe error code and troubleshooting hint (no connection URL or password). For example, `DATABASE_CONFIG_MISSING` means the deployed API has no database host or connection URL, `28P01` means the database rejected its credentials, and `42501` means the user lacks schema permissions. After correcting environment variables, redeploy: changing values does not update existing deployments.
