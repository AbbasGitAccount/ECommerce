import pool from "../config/db.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));

// Questions select an allowlisted intent, never SQL fragments or identifiers.
export function interpretQuestion(question) {
  const text = question.toLowerCase().replace(/[’']/g, "");
  if (/\b(delete|drop|insert|update|alter|truncate|password|email|sql)\b/.test(text)) return null;
  if (/\b(recent|latest|last)\b/.test(text) && /\borders?\b/.test(text)) return "recent";
  if (/\b(average|avg|mean)\b/.test(text) && /\b(order|orders|amount|spend|spent|value)\b/.test(text)) return "average";
  if (/\b(how many|count|number of)\b/.test(text) && /\borders?\b/.test(text)) return "count";
  if (/\b(total|spend|spent)\b/.test(text) && /\b(amount|spend|spent|value|cost|money)\b/.test(text)) return "total";
  return null;
}

export async function answerOrderQuestion(user, { question, scope }, database = pool) {
  if (scope === "all" && user.role !== 1) throw fail("Only admins may query all users.", 403);
  const mentionsOtherUsers = /\b(all|other|every|everyone|customer|customers|users?|people|someone|their|his|her)\b|@|\buser\s*#?\s*\d+/i.test(question);
  if (user.role !== 1 && mentionsOtherUsers) throw fail("You can only ask about your own orders.", 403);
  if (scope === "mine" && mentionsOtherUsers) throw fail('Choose "All users" to ask about other users.');
  const intent = interpretQuestion(question);
  if (!intent) throw fail("Try asking for your total order amount, order count, average order amount, or recent orders. Date filters, individual customer lookups, and other questions are not supported yet.");
  // Reject unsupported qualifiers rather than answering a misleading partial question.
  if (/\b(today|yesterday|week|month|year|between|before|after|since|cancelled|canceled|pending|booked|status|for|where|over|under|more than|less than)\b|\d/i.test(question)) {
    throw fail("Please ask an all-time order question without date, status, product, or amount filters.");
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const ownerId = scope === "all" ? null : user.id;
    const result = intent === "recent"
      ? await client.query(`SELECT id, total_amount::text, item_count, created_at
          FROM orders WHERE ($1::integer IS NULL OR user_id = $1)
          ORDER BY created_at DESC, id DESC LIMIT 5`, [ownerId])
      : await client.query(`SELECT COUNT(*)::text AS order_count,
          COALESCE(SUM(total_amount), 0)::text AS total_amount,
          COALESCE(AVG(total_amount), 0)::numeric(16,2)::text AS average_amount
          FROM orders WHERE ($1::integer IS NULL OR user_id = $1)`, [ownerId]);
    await client.query("COMMIT");
    const subject = scope === "all" ? "Across all users" : "For your account";
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
