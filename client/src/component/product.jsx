import { useCallback, useEffect, useRef, useState } from "react";
import "./product.css";
import "./Addresses.css";

const formatPrice = (value) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(value);
const emptyForm = { name: "", category: "", price: "", size: "", quantity: "0", isApproved: false, image: undefined, image_url: null };

function ProductArtwork({ src, name }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return <div className="product-art product-art--lavender">
    {src && !failed ? <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} /> : <span aria-hidden="true">&#128230;</span>}
  </div>;
}

export default function Product({ purchasing = false, onManageAddresses, cart: savedCart, onCartChange }) {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [localCart, setLocalCart] = useState([]);
  const cart = savedCart ?? localCart;
  const setCart = onCartChange ?? setLocalCart;
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [addressError, setAddressError] = useState("");
  const [readingImage, setReadingImage] = useState(false);
  const imageInput = useRef(null);
  useEffect(() => {
    if (!purchasing) return;
    const controller = new AbortController();
    fetch("/api/addresses", { signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not load delivery addresses");
      setAddresses(result.data);
      setAddressId(result.data[0] ? String(result.data[0].id) : "");
    }).catch((error) => { if (error.name !== "AbortError") setAddressError(error.message); });
    return () => controller.abort();
  }, [purchasing]);

  async function bookProducts() {
    if (booking || cart.length === 0 || !addressId) return;
    setBooking(true);
    setBookingError("");
    setNotice("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId: Number(addressId), items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not book products");
      setCart([]);
      setNotice(`Order #${result.data.id} booked successfully: ${result.data.item_count} items, total ${formatPrice(Number(result.data.total_amount))}.`);
      await loadProducts();
    } catch (error) {
      setBookingError(error.message);
    } finally {
      setBooking(false);
    }
  }

  function editProduct(product) {
    setEditingId(product.id);
    setForm({ name: product.name, category: product.category, price: String(product.price), size: product.size || "", quantity: String(product.quantity ?? 0), isApproved: product.isApproved, image: undefined, image_url: product.image_url });
    if (imageInput.current) imageInput.current.value = "";
    setSaveError("");
    setNotice("");
    document.getElementById("product-name")?.focus();
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    if (imageInput.current) imageInput.current.value = "";
    setSaveError("");
  }

  function chooseImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024 || file.size === 0) {
      setSaveError("Choose a JPEG, PNG, or WebP image up to 2 MB.");
      event.target.value = "";
      return;
    }
    setSaveError(""); setReadingImage(true);
    const reader = new FileReader();
    reader.onload = () => { setForm((current) => ({ ...current, image: reader.result })); setReadingImage(false); };
    reader.onerror = () => { setSaveError("Could not read this image. Try another file."); setReadingImage(false); };
    reader.readAsDataURL(file);
  }

  function addToCart(product) {
    if (booking || product.quantity <= 0) return;
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      return existing
        ? current.map((item) => item.id === product.id ? { ...item, quantity: Math.min(999, product.quantity, item.quantity + 1) } : item)
        : [...current, { ...product, quantity: 1 }];
    });
    setNotice(`${product.name} added to your cart.`);
  }

  function changeQuantity(id, change) {
    if (booking) return;
    const stock = products.find((product) => product.id === id)?.quantity ?? 0;
    setCart((current) => current
      .map((item) => item.id === id ? { ...item, quantity: Math.min(999, stock, item.quantity + change) } : item)
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
    if (readingImage || saving) return;
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const { image_url: _existingImage, ...values } = form;
      const response = await fetch(editingId === null ? "/api/products" : `/api/products/${editingId}`, {
        method: editingId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, name: form.name.trim(), category: form.category.trim(), size: form.size.trim(), quantity: Number(form.quantity), price: Number(form.price) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not save product");
      setForm(emptyForm);
      if (imageInput.current) imageInput.current.value = "";
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

  const visibleProducts = products.filter((product) => (!purchasing || (product.isApproved === true && product.quantity > 0)) &&
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
                {item.size && <span>Size: {item.size}</span>}
              </div>
              <div className="cart-quantity" role="group" aria-label={`Quantity for ${item.name}`}>
                <button type="button" disabled={booking} aria-label={`Decrease quantity of ${item.name}`} onClick={() => changeQuantity(item.id, -1)}>-</button>
                <span aria-label={`Quantity: ${item.quantity}`}>{item.quantity}</span>
                <button type="button" disabled={booking || loading || item.quantity >= Math.min(999, products.find((product) => product.id === item.id)?.quantity ?? 0)} aria-label={`Increase quantity of ${item.name}`} onClick={() => changeQuantity(item.id, 1)}>+</button>
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
        <div className="checkout-address">
          <label htmlFor="checkout-address">Deliver to</label>
          <select id="checkout-address" className="role-select" value={addressId} disabled={booking || addresses.length === 0} onChange={(event) => setAddressId(event.target.value)}>
            <option value="">Select a delivery address</option>
            {addresses.map((address) => <option key={address.id} value={address.id}>{address.recipient} — {address.line1}, {address.city}, {address.postal_code}</option>)}
          </select>
          {addressError && <p role="alert">{addressError}</p>}
          {addresses.length === 0 && <p>Add a delivery address before booking.</p>}
          {onManageAddresses && <button className="nav-link" type="button" disabled={booking} onClick={onManageAddresses}>Manage delivery addresses</button>}
        </div>
        <button className="primary-button book-products-button" type="button" disabled={booking || cart.length === 0 || !addressId}
          onClick={bookProducts}>{booking ? "Booking..." : "Book products"}</button>
      </section>}

      {!purchasing && <form className="panel product-form" onSubmit={handleSubmit}>
        <h2>{editingId === null ? "Add a product" : "Edit product"}</h2>
        <fieldset className="product-fields" disabled={saving || readingImage}>
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
        <div className="product-media-fields">
          <div>
            <label htmlFor="product-quantity">Stock quantity</label>
            <input id="product-quantity" type="number" min="0" max="2147483647" step="1" required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value, isApproved: Number(event.target.value) === 0 ? false : form.isApproved })} />
            <p className="product-image-help">Zero stock automatically makes this product unapproved.</p>
          </div>
          <div>
            <label htmlFor="product-size">Size (optional)</label>
            <input id="product-size" maxLength={50} value={form.size} placeholder="e.g. M, 42, or 500 ml" onChange={(event) => setForm({ ...form, size: event.target.value })} />
          </div>
          <div>
            <label htmlFor="product-image">Product image (optional)</label>
            <input ref={imageInput} id="product-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} aria-describedby="product-image-help" />
            <p id="product-image-help" className="product-image-help">JPEG, PNG, or WebP up to 2 MB. Leave unchanged to keep the current image.</p>
          </div>
        </div>
        <div className="product-image-preview">
          <ProductArtwork src={form.image === null ? null : form.image ?? form.image_url} name="Product image preview" />
          {(form.image || (form.image !== null && form.image_url)) && <button className="nav-link" type="button" onClick={() => {
            setForm({ ...form, image: null }); if (imageInput.current) imageInput.current.value = "";
          }}>Remove image</button>}
        </div>
        <label className="product-approval" htmlFor="product-approved">
          <input id="product-approved" type="checkbox" checked={form.isApproved} disabled={Number(form.quantity) <= 0}
            onChange={(event) => setForm({ ...form, isApproved: event.target.checked })} />
          Approved (available on Purchasing page)
        </label>
        </fieldset>
        {saveError && <p className="alert error-alert" role="alert">{saveError}</p>}
        <div className="product-form-actions">
          <button className="primary-button product-submit" type="submit" disabled={saving || readingImage}>
            {readingImage ? "Reading image..." : saving ? "Saving..." : editingId === null ? "Add product" : "Save changes"}
          </button>
          {editingId !== null && <button className="nav-link" type="button" onClick={cancelEdit} disabled={saving || readingImage}>Cancel</button>}
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
                <ProductArtwork key={product.image_url || "placeholder"} src={product.image_url} name={product.name} />
                <div className="product-details">
                  <p className="product-category">{product.category}</p>
                  <p className={product.isApproved ? "product-status product-status--approved" : "product-status product-status--pending"}>
                    {product.isApproved ? "Approved" : "Not approved"}
                  </p>
                  <h2>{product.name}</h2>
                  {product.size && <p className="product-size">Size: {product.size}</p>}
                  <p className="product-size">{product.quantity > 0 ? `${product.quantity} in stock` : "Out of stock"}</p>
                  <div className="product-actions">
                    <strong>{formatPrice(product.price)}</strong>
                    {!purchasing && <button type="button" disabled={saving || readingImage} onClick={() => editProduct(product)}
                      aria-label={`Edit ${product.name}`}>Edit</button>}
                    {purchasing && <button type="button" disabled={booking || (cart.find((item) => item.id === product.id)?.quantity ?? 0) >= Math.min(999, product.quantity)} aria-label={`Add ${product.name} to cart`} onClick={() => addToCart(product)}>Add to cart</button>}
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
