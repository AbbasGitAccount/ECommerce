import pool from "../config/db.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));

// Questions select an allowlisted intent, never SQL fragments or identifiers.
export function interpretQuestion(question) {
  const text = question.toLowerCase().replace(/[’']/g, "");
  if (/\b(delete|drop|insert|update|alter|truncate|password|email|sql)\b/.test(text)) return null;
  if (/\b(customer|customers|users|people)\b/.test(text) && !/\borders?\b/.test(text) && /\b(how many|count|number of|total)\b/.test(text) && !/\b(amount|spend|spent|value)\b/.test(text)) return "customerCount";
  if (/\b(customer|customers|users|people)\b/.test(text) && /\b(show|list|per|each|by|breakdown)\b/.test(text) && !/\b(recent|latest|last)\b/.test(text)) return "customers";
  if (/\b(recent|latest|last)\b/.test(text) && /\borders?\b/.test(text)) return "recent";
  if (/\b(average|avg|mean)\b/.test(text) && /\b(order|orders|amount|spend|spent|value)\b/.test(text)) return "average";
  if (/\b(how many|count|number of)\b/.test(text) && /\borders?\b/.test(text)) return "count";
  if (/\b(total|spend|spent)\b/.test(text) && /\b(amount|spend|spent|value|cost|money)\b/.test(text)) return "total";
  if (/\borders?\b/.test(text) && /\b(show|list|view)\b/.test(text)) return "orders";
  return null;
}

export async function answerOrderQuestion(user, { question, scope = "mine", offset = 0 }, database = pool) {
  if (scope === "all" && user.role !== 1) throw fail("Only admins may query all users.", 403);
  const mentionsOtherUsers = /\b(all|other|every|everyone|customer|customers|users?|people|someone|their|his|her)\b|@|\buser\s*#?\s*\d+/i.test(question);
  if (user.role !== 1 && mentionsOtherUsers) throw fail("You can only ask about your own orders.", 403);
  if (scope === "mine" && mentionsOtherUsers) throw fail('Choose "All users" to ask about other users.');
  const intent = interpretQuestion(question);
  if (!intent) throw fail("Ask for total order amount, order count, average amount, or an order list. Admins can also ask for customer count and totals by customer. Date filters and individual customer lookups are not supported yet.");
  if (["customers", "customerCount"].includes(intent) && (user.role !== 1 || scope !== "all")) throw fail("Only admins using All users may query customers.", 403);
  // Reject unsupported qualifiers rather than answering a misleading partial question.
  const qualifiers = question.replace(/\bfor (all (users|customers)|each customer|every customer|my account)\b/gi, "");
  if (/\b(today|yesterday|week|month|year|between|before|after|since|cancelled|canceled|pending|booked|status|for|where|over|under|more than|less than)\b|\d/i.test(qualifiers)) {
    throw fail("Please ask an all-time order question without date, status, product, or amount filters.");
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const ownerId = scope === "all" ? null : user.id;
    const result = intent === "customerCount"
      ? await client.query("SELECT COUNT(*)::text AS customer_count FROM users WHERE role = $1", [2])
      : intent === "customers"
        ? await client.query(`SELECT u.id, u.name, u.username, COUNT(o.id)::text AS order_count,
            COALESCE(SUM(o.total_amount), 0)::text AS total_amount
            FROM users u LEFT JOIN orders o ON o.user_id = u.id
            WHERE u.role = $1 GROUP BY u.id, u.name, u.username
            ORDER BY u.id LIMIT 51 OFFSET $2`, [2, offset])
      : ["recent", "orders"].includes(intent)
      ? await client.query(`SELECT o.id, o.total_amount::text, o.item_count, o.created_at, o.status,
            u.name AS customer_name, u.username AS customer_username
          FROM orders o JOIN users u ON u.id = o.user_id
          WHERE ($1::integer IS NULL OR o.user_id = $1)
          ORDER BY o.created_at DESC, o.id DESC LIMIT $2 OFFSET $3`, [ownerId, intent === "recent" ? 5 : 51, intent === "recent" ? 0 : offset])
      : await client.query(`SELECT COUNT(*)::text AS order_count,
          COALESCE(SUM(total_amount), 0)::text AS total_amount,
          COALESCE(AVG(total_amount), 0)::numeric(16,2)::text AS average_amount
          FROM orders WHERE ($1::integer IS NULL OR user_id = $1)`, [ownerId]);
    await client.query("COMMIT");
    const subject = scope === "all" ? "Across all users" : "For your account";
    if (intent === "customerCount") return { answer: `There are ${result.rows[0].customer_count} customer accounts (excluding admins).`, scope, intent };
    if (["customers", "orders"].includes(intent)) {
      const rows = result.rows.slice(0, 50);
      return {
        answer: rows.length ? `Showing ${intent === "customers" ? "customers and their order totals" : "orders"} ${offset + 1}–${offset + rows.length}${scope === "all" ? " across all users" : " for your account"}.` : "No more results.",
        scope, intent, [intent]: rows, nextOffset: result.rows.length > 50 ? offset + 50 : null,
      };
    }
    if (intent === "recent") {
      return { answer: result.rows.length ? `${subject}, here are the ${result.rows.length} most recent orders.` : `${subject}, there are no orders yet.`, scope, intent, orders: result.rows };
    }
    const row = result.rows[0];
    const answer = intent === "count" ? `${subject}, there are ${row.order_count} orders.`
      : intent === "average" ? `${subject}, the average order amount is ${money(row.average_amount)} across ${row.order_count} orders.`
        : `${subject}, the total order amount is ${money(row.total_amount)} across ${row.order_count} orders.`;
    return { answer, scope, intent, orderCount: row.order_count };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
