import { readApiResponse } from "../api.js";
import { useCallback, useEffect, useState } from "react";
import "./OrderHistory.css";

const price = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
const date = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const statuses = ["booked", "out_for_delivery", "delivered"];
const statusLabels = { booked: "Booked", out_for_delivery: "Out for delivery", delivered: "Delivered" };

export default function OrderHistory({ isAdmin = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [updateError, setUpdateError] = useState("");
  const [notice, setNotice] = useState("");

  async function changeStatus(order) {
    if (updatingId !== null) return;
    const nextStatus = order.status === "booked" ? "out_for_delivery" : "delivered";
    setUpdatingId(order.id); setUpdateError(""); setNotice("");
    try {
      const response = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not update order status");
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, ...result.data } : item));
      setNotice(`Order #${order.id} is now ${statusLabels[result.data.status]}.`);
    } catch (err) { setUpdateError(err.message); } finally { setUpdatingId(null); }
  }

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/orders");
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not load order history");
      setOrders(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const totalOrderCents = orders.reduce(
    (sum, order) => sum + Math.round(Number(order.total_amount) * 100),
    0,
  );

  return (
    <section className="order-history" aria-labelledby="order-history-title">
      <header className="order-history-heading">
        <div>
          <p className="eyebrow">YOUR BOOKINGS</p>
          <h1 id="order-history-title">Order history</h1>
          <p>{isAdmin ? "View bookings from all customers." : "View your previous bookings and order details."}</p>
        </div>
        <button className="nav-link" type="button" disabled={loading || updatingId !== null} onClick={loadOrders}>Refresh orders</button>
      </header>
      {error && <p className="alert error-alert" role="alert">{error}</p>}
      {updateError && <p className="alert error-alert" role="alert">{updateError}</p>}
      <p role="status">{notice}</p>
      {isAdmin && !loading && !error && <div className="panel order-history-summary" role="status">
        <div>
          <h2>Total order amount — all users</h2>
          <p>{orders.length} {orders.length === 1 ? "order" : "orders"}</p>
        </div>
        <strong>{price(totalOrderCents / 100)}</strong>
      </div>}
      {loading ? <p className="order-history-empty" role="status">Loading orders...</p> : error ? null : orders.length === 0 ? (
        <p className="order-history-empty">{isAdmin ? "No orders have been booked yet." : "You have no orders yet. Book products from the Purchasing page to see them here."}</p>
      ) : <>
        <p className="order-history-count">{orders.length} {orders.length === 1 ? "order" : "orders"}</p>
        <div className="order-history-list">
          {orders.map((order) => (
            <article className="panel order-history-card" key={order.id} aria-labelledby={`order-${order.id}`}>
              <header className="order-card-heading">
                <div>
                  <h2 id={`order-${order.id}`}>Order #{order.id}</h2>
                  <time dateTime={order.created_at}>{date(order.created_at)}</time>
                  {isAdmin && <p className="order-customer">Customer: {order.customer_name}{order.customer_username ? ` (@${order.customer_username})` : ""}</p>}
                </div>
                <span className={`order-status order-status--${order.status}`}>{statusLabels[order.status] || order.status}</span>
              </header>
              <ol className="order-progress" aria-label={`Delivery progress for order ${order.id}`}>
                {statuses.map((status, index) => <li key={status} aria-current={order.status === status ? "step" : undefined}
                  className={index <= statuses.indexOf(order.status) ? "order-progress-done" : ""}>
                  <span aria-hidden="true">{index < statuses.indexOf(order.status) ? "✓" : index + 1}</span>{statusLabels[status]}
                </li>)}
              </ol>
              {isAdmin && order.status !== "delivered" && <button className="primary-button order-status-action" type="button"
                disabled={updatingId !== null} onClick={() => changeStatus(order)} aria-label={`Mark order ${order.id} ${order.status === "booked" ? "out for delivery" : "delivered"}`}>
                {updatingId === order.id ? "Updating..." : order.status === "booked" ? "Mark out for delivery" : "Mark delivered"}
              </button>}
              <div className="order-table-scroll" tabIndex={0} role="region" aria-label={`Items in order ${order.id}`}>
                <table className="order-items-table">
                  <caption className="order-table-caption">Products in order #{order.id}</caption>
                  <thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Subtotal</th></tr></thead>
                  <tbody>{order.items.map((item) => <tr key={item.id}>
                    <th scope="row">{item.product_name}{item.product_size && <small> · Size: {item.product_size}</small>}</th>
                    <td>{item.quantity}</td><td>{price(item.unit_price)}</td><td>{price(item.subtotal)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <footer className="order-card-total">
                <span>{order.items.length} {order.items.length === 1 ? "product" : "products"} &middot; {order.item_count} {order.item_count === 1 ? "item" : "items"}</span>
                <strong>Total: {price(order.total_amount)}</strong>
              </footer>
              {order.delivery_address && <div className="order-delivery">
                <h3>Delivery address</h3>
                <address>{order.delivery_address.recipient}<br />{order.delivery_address.line1}<br />
                  {order.delivery_address.line2 && <>{order.delivery_address.line2}<br /></>}
                  {order.delivery_address.city}, {order.delivery_address.state} {order.delivery_address.postal_code}<br />
                  {order.delivery_address.country}<br />{order.delivery_address.phone}
                </address>
              </div>}
            </article>
          ))}
        </div>
      </>}
    </section>
  );
}
