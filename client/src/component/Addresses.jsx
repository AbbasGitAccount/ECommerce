import { readApiResponse } from "../api.js";
import { useEffect, useState } from "react";
import "./Addresses.css";

const empty = { recipient: "", phone: "", line1: "", line2: "", city: "", state: "", postal_code: "", country: "" };
const fields = [
  ["recipient", "Recipient name", 150, "name"], ["phone", "Phone number", 30, "tel"],
  ["line1", "Street address", 200, "address-line1"], ["line2", "Apartment / address line 2 (optional)", 200, "address-line2"],
  ["city", "City", 100, "address-level2"], ["state", "State / region", 100, "address-level1"],
  ["postal_code", "Postal code", 20, "postal-code"], ["country", "Country", 100, "country-name"],
];

export default function Addresses() {
  const [addresses, setAddresses] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch("/api/addresses");
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Could not load addresses");
    setAddresses(result.data);
  }
  useEffect(() => { load().catch((err) => setError(err.message)).finally(() => setLoading(false)); }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(editing === null ? "/api/addresses" : `/api/addresses/${editing}`, {
        method: editing === null ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not save address");
      setForm(empty); setEditing(null);
      await load(); setNotice("Delivery address saved.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove(id) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/addresses/${id}`, { method: "DELETE" });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not remove address");
      if (editing === id) { setEditing(null); setForm(empty); }
      await load(); setNotice("Address removed. Existing orders retain their delivery details.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="addresses-page" aria-labelledby="addresses-title">
    <p className="eyebrow">YOUR ACCOUNT</p><h1 id="addresses-title">Delivery addresses</h1>
    <p>Save your delivery details, then select an address when booking products.</p>
    {error && <p className="alert error-alert" role="alert">{error}</p>}
    <p role="status">{notice}</p>
    <div className="addresses-layout">
      <form className="panel address-form" onSubmit={save}>
        <h2>{editing === null ? "Add an address" : "Edit address"}</h2>
        <fieldset disabled={busy || loading}>
          {fields.map(([key, label, max, autoComplete]) => <div key={key}>
            <label htmlFor={`address-${key}`}>{label}</label>
            <input id={`address-${key}`} type={key === "phone" ? "tel" : "text"} autoComplete={autoComplete} maxLength={max} required={key !== "line2"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
          </div>)}
          <button className="primary-button" type="submit">{busy ? "Saving…" : "Save address"}</button>
          {editing !== null && <button className="nav-link" type="button" onClick={() => { setEditing(null); setForm(empty); }}>Cancel edit</button>}
        </fieldset>
      </form>
      <div className="address-list" aria-label="Saved delivery addresses">
        {loading ? <p role="status">Loading addresses…</p> : addresses.length === 0 ? <p>No saved addresses yet.</p> : addresses.map((address) => <article className="panel address-card" key={address.id}>
          <h2>{address.recipient}</h2>
          <address>{address.line1}<br />{address.line2 && <>{address.line2}<br /></>}{address.city}, {address.state} {address.postal_code}<br />{address.country}<br />{address.phone}</address>
          <button className="nav-link" type="button" disabled={busy} onClick={() => {
            setEditing(address.id); setForm(Object.fromEntries(Object.keys(empty).map((key) => [key, address[key]]))); setError("");
            document.getElementById("address-recipient")?.focus();
          }}>Edit<span className="address-sr"> address for {address.recipient}</span></button>
          <button className="nav-link" type="button" disabled={busy} onClick={() => remove(address.id)}>Remove<span className="address-sr"> address for {address.recipient}</span></button>
        </article>)}
      </div>
    </div>
  </section>;
}
