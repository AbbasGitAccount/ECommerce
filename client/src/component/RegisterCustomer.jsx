import { useState } from "react";

export default function RegisterCustomer({ onBack, onRegistered }) {
  const [form, setForm] = useState({ name: "", email: "", username: "", password: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function changeField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), username: form.username.trim(), password: form.password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not create customer account");
      onRegistered(result.data.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="login-wrap" aria-labelledby="register-title">
      <form className="panel login-panel" onSubmit={handleSubmit}>
        <button className="back-link" type="button" disabled={busy} onClick={onBack}>Back to login</button>
        <p className="eyebrow registration-eyebrow">JOIN ECOMMERCE</p>
        <h1 id="register-title">Add customer</h1>
        <p className="login-copy">Create your account to purchase products and view your orders.</p>
        {error && <p className="alert error-alert" role="alert">{error}</p>}
        <fieldset className="registration-fields" disabled={busy}>
          <label htmlFor="register-name">Name</label>
          <input id="register-name" name="name" autoComplete="name" value={form.name} onChange={changeField} required />
          <label htmlFor="register-email">Email address</label>
          <input id="register-email" name="email" type="email" autoComplete="email" value={form.email} onChange={changeField} required />
          <label htmlFor="register-username">Username</label>
          <input id="register-username" name="username" autoComplete="username" minLength={3} value={form.username} onChange={changeField} required />
          <label htmlFor="register-password">Password</label>
          <input id="register-password" name="password" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={changeField} required />
          <label htmlFor="register-confirm-password">Confirm password</label>
          <input id="register-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} value={form.confirmPassword} onChange={changeField} required />
        </fieldset>
        <button className="primary-button login-button" type="submit" disabled={busy}>{busy ? "Creating account..." : "Create customer account"}</button>
      </form>
    </section>
  );
}
