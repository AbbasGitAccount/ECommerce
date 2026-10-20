# Ask Your Data

After logging in, open **Ask Your Data** in the main navigation. Supported questions:

- What is my total order amount?
- How many orders do I have?
- What is my average order amount?
- Show my recent orders

Answers use all-time order data, in USD. Recent orders are limited to five. Each question is independent; date, status, amount, and product filters are not supported. Unsupported questions return guidance rather than executing generated SQL.

Admins start in **All users** and can switch to **My orders**. Customers can query only their own orders. The server derives identity and role from the existing session cookie, never from client-supplied user IDs or roles.

In **All users**, admins can also ask:

- What is the total order amount for all customers?
- How many customers are there?
- Show all customers
- Show order totals by customer
- Show all orders

Customer reports include accounts with role 2, including customers with zero orders, and exclude admin accounts. Global order queries include every order. Customer reports show names, usernames, order counts, and total spending; order lists show the owner and order details. Lists contain at most 50 results per page; use **Show next 50** to continue. Passwords and credentials are never queried. Customers can use **Show my orders** to page through their own orders.

`POST /api/ask-data` accepts `{ "question": "What is my total order amount?", "scope": "mine", "offset": 0 }`. Scope defaults to `mine`; `all` requires an admin. Offset defaults to zero and must be an integer from 0 to 1,000,000. Questions must contain 3–500 characters. Other fields are rejected. The response contains `data.answer`, `data.scope`, `data.intent`, and report data (`data.orderCount`, `data.orders`, or `data.customers`). Paginated lists include `data.nextOffset`, which is null on the final page.

The backend maps recognized questions to fixed parameterized SELECT statements inside a read-only transaction with a five-second statement timeout. No question text enters SQL. This implementation uses a bounded question interpreter and requires no AI provider or API key. PostgreSQL configuration remains on the backend in `src/.env`.

Run the app with `npm run dev` and `npm run dev:client` in separate terminals. Restart an already-running backend to register the new endpoint. Run `npm test` for the intent, authorization, request validation, and transaction tests; run `npm run build:client` to check the frontend build.
