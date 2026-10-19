import { useCallback, useEffect, useState } from "react";
import "./product.css";

const formatPrice = (value) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(value);
const emptyForm = { name: "", category: "", price: "", isApproved: false };

export default function Product({ purchasing = false }) {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");

  async function bookProducts() {
    if (booking || cart.length === 0) return;
    setBooking(true);
    setBookingError("");
    setNotice("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not book products");
      setCart([]);
      setNotice(`Order #${result.data.id} booked successfully: ${result.data.item_count} items, total ${formatPrice(Number(result.data.total_amount))}.`);
    } catch (error) {
      setBookingError(error.message);
    } finally {
      setBooking(false);
    }
  }

  function editProduct(product) {
    setEditingId(product.id);
    setForm({ name: product.name, category: product.category, price: String(product.price), isApproved: product.isApproved });
    setSaveError("");
    setNotice("");
    document.getElementById("product-name")?.focus();
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setSaveError("");
  }

  function addToCart(product) {
    if (booking) return;
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      return existing
        ? current.map((item) => item.id === product.id ? { ...item, quantity: Math.min(999, item.quantity + 1) } : item)
        : [...current, { ...product, quantity: 1 }];
    });
    setNotice(`${product.name} added to your cart.`);
  }

  function changeQuantity(id, change) {
    if (booking) return;
    setCart((current) => current
      .map((item) => item.id === id ? { ...item, quantity: Math.min(999, item.quantity + change) } : item)
      .filter((item) => item.quantity > 0));
  }

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(purchasing ? "/api/purchasing/products" : "/api/products");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not load products");
      setProducts(result.data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [purchasing]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const response = await fetch(editingId === null ? "/api/products" : `/api/products/${editingId}`, {
        method: editingId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim(), category: form.category.trim(), price: Number(form.price) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not save product");
      setForm(emptyForm);
      setEditingId(null);
      setNotice(result.data.isApproved
        ? "Product saved and available on the Purchasing page."
        : "Product saved as unapproved. It is listed here but hidden from Purchasing.");
      await loadProducts();
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  }

  const visibleProducts = products.filter((product) => (!purchasing || product.isApproved === true) &&
    `${product.name} ${product.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = cart.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);

  return (
    <section className="products-page" aria-labelledby="products-title">
      <header className="products-heading">
        <div>
          <p className="eyebrow">THE EVERYDAY COLLECTION</p>
          <h1 id="products-title">{purchasing ? "ECommerce" : "Products"}</h1>
          <p className="products-description">{purchasing ? "Shop approved products." : "Manage all products, including those awaiting approval."}</p>
        </div>
        {purchasing && <p className="products-cart" aria-live="polite">
          Cart: {itemCount} {itemCount === 1 ? "item" : "items"}
          <strong>{formatPrice(totalCents / 100)}</strong>
        </p>}
      </header>

      {purchasing && <section className="panel shopping-cart" aria-labelledby="cart-title">
        <div className="cart-heading">
          <h2 id="cart-title">Your cart</h2>
          {cart.length > 0 && <button className="nav-link" type="button" disabled={booking} onClick={() => {
            setCart([]);
            setNotice("Cart cleared.");
          }}>Clear cart</button>}
        </div>
        {cart.length === 0 ? <p className="cart-empty">Your cart is empty. Add products below to get started.</p> : <>
          <ul className="cart-list">
            {cart.map((item) => <li className="cart-row" key={item.id}>
              <div className="cart-item-details">
                <strong>{item.name}</strong>
                <span>{formatPrice(item.price)} each</span>
              </div>
              <div className="cart-quantity" role="group" aria-label={`Quantity for ${item.name}`}>
                <button type="button" disabled={booking} aria-label={`Decrease quantity of ${item.name}`} onClick={() => changeQuantity(item.id, -1)}>-</button>
                <span aria-label={`Quantity: ${item.quantity}`}>{item.quantity}</span>
                <button type="button" disabled={booking || item.quantity >= 999} aria-label={`Increase quantity of ${item.name}`} onClick={() => changeQuantity(item.id, 1)}>+</button>
              </div>
              <strong className="cart-subtotal">{formatPrice(Math.round(item.price * 100) * item.quantity / 100)}</strong>
              <button className="nav-link" type="button" disabled={booking} aria-label={`Remove ${item.name} from cart`}
                onClick={() => setCart((current) => current.filter((product) => product.id !== item.id))}>Remove</button>
            </li>)}
          </ul>
        </>}
        <div className="cart-summary" aria-live="polite" aria-atomic="true">
          <span>{cart.length} {cart.length === 1 ? "product" : "products"} &middot; {itemCount} {itemCount === 1 ? "item" : "items"}</span>
          <strong>Total: {formatPrice(totalCents / 100)}</strong>
        </div>
        {bookingError && <p className="alert error-alert" role="alert">{bookingError}</p>}
        <button className="primary-button book-products-button" type="button" disabled={booking || cart.length === 0}
          onClick={bookProducts}>{booking ? "Booking..." : "Book products"}</button>
      </section>}

      {!purchasing && <form className="panel product-form" onSubmit={handleSubmit}>
        <h2>{editingId === null ? "Add a product" : "Edit product"}</h2>
        <fieldset className="product-fields" disabled={saving}>
        <div className="product-form-fields">
          <div>
            <label htmlFor="product-name">Product name</label>
            <input id="product-name" value={form.name} maxLength={150} required
              onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <label htmlFor="product-category">Category</label>
            <input id="product-category" value={form.category} maxLength={80} required
              onChange={(event) => setForm({ ...form, category: event.target.value })} />
          </div>
          <div>
            <label htmlFor="product-price">Price (USD)</label>
            <input id="product-price" type="number" min="0" max="99999999.99" step="0.01" value={form.price} required
              onChange={(event) => setForm({ ...form, price: event.target.value })} />
          </div>
        </div>
        <label className="product-approval" htmlFor="product-approved">
          <input id="product-approved" type="checkbox" checked={form.isApproved}
            onChange={(event) => setForm({ ...form, isApproved: event.target.checked })} />
          Approved (available on Purchasing page)
        </label>
        </fieldset>
        {saveError && <p className="alert error-alert" role="alert">{saveError}</p>}
        <div className="product-form-actions">
          <button className="primary-button product-submit" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingId === null ? "Add product" : "Save changes"}
          </button>
          {editingId !== null && <button className="nav-link" type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>}
        </div>
      </form>}

      <p className="products-notice" role="status">{notice}</p>
      <div className="products-toolbar">
        <div className="products-search">
          <label htmlFor="product-search">{purchasing ? "Search approved products" : "Search all products"}</label>
          <input id="product-search" type="search" placeholder="Search by name or category"
            value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <button className="nav-link" type="button" onClick={loadProducts} disabled={loading}>Refresh products</button>
        <span>{visibleProducts.length} products</span>
      </div>

      {loadError && <p className="alert error-alert" role="alert">{loadError}</p>}
      {loading ? <p className="products-empty" role="status">Loading products...</p> : loadError ? null :
        visibleProducts.length === 0 ? (
          <p className="products-empty">{search.trim() ? "No products match your search." : purchasing ? "No approved products yet." : "No products yet. Add your first product above."}</p>
        ) : (
          <div className="products-grid">
            {visibleProducts.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-art product-art--lavender" aria-hidden="true">&#128230;</div>
                <div className="product-details">
                  <p className="product-category">{product.category}</p>
                  <p className={product.isApproved ? "product-status product-status--approved" : "product-status product-status--pending"}>
                    {product.isApproved ? "Approved" : "Not approved"}
                  </p>
                  <h2>{product.name}</h2>
                  <div className="product-actions">
                    <strong>{formatPrice(product.price)}</strong>
                    {!purchasing && <button type="button" disabled={saving} onClick={() => editProduct(product)}
                      aria-label={`Edit ${product.name}`}>Edit</button>}
                    {purchasing && <button type="button" disabled={booking || (cart.find((item) => item.id === product.id)?.quantity ?? 0) >= 999} aria-label={`Add ${product.name} to cart`} onClick={() => addToCart(product)}>Add to cart</button>}
                  </div>
                  {purchasing && <p className="product-cart-count">In cart: {cart.find((item) => item.id === product.id)?.quantity ?? 0}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      {purchasing && <p className="products-demo-note">Your cart is kept for this visit only.</p>}
    </section>
  );
}
