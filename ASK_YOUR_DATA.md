# Ask Your Data

After logging in, open **Ask Your Data** in the main navigation. Supported questions:

- What is my total order amount?
- How many orders do I have?
- What is my average order amount?
- Show my recent orders

Answers use all-time order data, in USD. Recent orders are limited to five. Each question is independent; date, status, amount, and product filters are not supported. Unsupported questions return guidance rather than executing generated SQL.

Admins can choose **My orders** or **All users**. Customers can query only their own orders. The server derives identity and role from the existing session cookie, never from client-supplied user IDs or roles.

`POST /api/ask-data` accepts only `{ "question": "What is my total order amount?", "scope": "mine" }`. Scope defaults to `mine`; `all` requires an admin. Questions must contain 3–500 characters. The response contains `data.answer`, `data.scope`, `data.intent`, and either `data.orderCount` or `data.orders`.

The backend maps recognized questions to fixed parameterized SELECT statements inside a read-only transaction with a five-second statement timeout. No question text enters SQL. This implementation uses a bounded question interpreter and requires no AI provider or API key. PostgreSQL configuration remains on the backend in `src/.env`.

Run the app with `npm run dev` and `npm run dev:client` in separate terminals. Restart an already-running backend to register the new endpoint. Run `npm test` for the intent, authorization, request validation, and transaction tests; run `npm run build:client` to check the frontend build.
