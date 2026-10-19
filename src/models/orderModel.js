import pool from "../config/db.js";

export async function getOrderHistory(user) {
  const result = await pool.query(`
    SELECT o.id, o.created_at, o.status, o.item_count, o.total_amount,
           u.name AS customer_name, u.username AS customer_username,
           COALESCE((
             SELECT json_agg(json_build_object(
               'id', i.id, 'product_name', i.product_name, 'quantity', i.quantity,
               'unit_price', i.unit_price::text, 'subtotal', i.subtotal::text
             ) ORDER BY i.id)
             FROM order_items i WHERE i.order_id = o.id
           ), '[]'::json) AS items
    FROM orders o
    JOIN users u ON u.id = o.user_id
    ${user.role === 1 ? "" : "WHERE o.user_id = $1"}
    ORDER BY o.created_at DESC, o.id DESC
  `, user.role === 1 ? [] : [user.id]);
  return result.rows;
}

function orderError(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

export async function insertOrder(userId, items) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT id FROM users WHERE id = $1 FOR KEY SHARE", [userId]);
    if (!user.rows.length) throw orderError("User not found. Please log in again.", 404);
    const products = await client.query(
      'SELECT id, name, price, "isApproved" FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE',
      [items.map((item) => item.productId)],
    );
    const lines = items.map((item) => {
      const product = products.rows.find((row) => row.id === item.productId);
      if (!product || !product.isApproved) throw orderError("Some products are unavailable or unapproved. Refresh products and update your cart.");
      const unitCents = Math.round(Number(product.price) * 100);
      return { ...item, name: product.name, unitCents, subtotalCents: unitCents * item.quantity };
    });
    const totalCents = lines.reduce((sum, item) => sum + item.subtotalCents, 0);
    const itemCount = lines.reduce((sum, item) => sum + item.quantity, 0);
    const result = await client.query(
      "INSERT INTO orders (user_id, total_amount, item_count) VALUES ($1, $2, $3) RETURNING id, user_id, total_amount, item_count, status, created_at",
      [userId, (totalCents / 100).toFixed(2), itemCount],
    );
    const order = result.rows[0];
    for (const item of lines) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5, $6)",
        [order.id, item.productId, item.name, item.quantity, (item.unitCents / 100).toFixed(2), (item.subtotalCents / 100).toFixed(2)],
      );
    }
    await client.query("COMMIT");
    return order;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
