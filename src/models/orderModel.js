import pool from "../config/db.js";

export async function getOrderHistory(user) {
  const result = await pool.query(`
    SELECT o.id, o.created_at, o.status, o.item_count, o.total_amount, o.delivery_address,
           u.name AS customer_name, u.username AS customer_username,
           COALESCE((
             SELECT json_agg(json_build_object(
               'id', i.id, 'product_name', i.product_name, 'quantity', i.quantity,
               'unit_price', i.unit_price::text, 'subtotal', i.subtotal::text, 'product_size', i.product_size
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

export async function insertOrder(userId, items, addressId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT id FROM users WHERE id = $1 FOR KEY SHARE", [userId]);
    if (!user.rows.length) throw orderError("User not found. Please log in again.", 404);
    const address = await client.query(`SELECT recipient, phone, line1, line2, city, state, postal_code, country
      FROM user_addresses WHERE user_id = $1 AND id = $2 FOR SHARE`, [userId, addressId]);
    if (!address.rows.length) throw orderError("Delivery address not found. Select one of your saved addresses.", 404);
    const products = await client.query(
      'SELECT id, name, size, price, quantity, "isApproved" FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
      [items.map((item) => item.productId)],
    );
    const lines = items.map((item) => {
      const product = products.rows.find((row) => row.id === item.productId);
      if (!product || !product.isApproved) throw orderError("Some products are unavailable or unapproved. Refresh products and update your cart.");
      if (product.quantity < item.quantity) throw orderError(`Not enough stock for ${product.name}. Refresh products and update your cart.`);
      const unitCents = Math.round(Number(product.price) * 100);
      return { ...item, name: product.name, size: product.size || "", unitCents, subtotalCents: unitCents * item.quantity };
    });
    const totalCents = lines.reduce((sum, item) => sum + item.subtotalCents, 0);
    const itemCount = lines.reduce((sum, item) => sum + item.quantity, 0);
    const result = await client.query(
      "INSERT INTO orders (user_id, total_amount, item_count, delivery_address) VALUES ($1, $2, $3, $4::jsonb) RETURNING id, user_id, total_amount, item_count, status, created_at, delivery_address",
      [userId, (totalCents / 100).toFixed(2), itemCount, JSON.stringify(address.rows[0])],
    );
    const order = result.rows[0];
    for (const item of lines) {
      const stock = await client.query(`UPDATE products SET quantity = quantity - $2,
        "isApproved" = CASE WHEN quantity - $2 = 0 THEN FALSE ELSE "isApproved" END
        WHERE id = $1 AND quantity >= $2 RETURNING id`, [item.productId, item.quantity]);
      if (!stock.rows.length) throw orderError("Stock changed. Refresh products and update your cart.");
      await client.query(
        "INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, product_size) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [order.id, item.productId, item.name, item.quantity, (item.unitCents / 100).toFixed(2), (item.subtotalCents / 100).toFixed(2), item.size],
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
