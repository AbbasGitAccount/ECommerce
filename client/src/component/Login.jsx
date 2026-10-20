import { readApiResponse } from "../api.js";
import { useState } from "react";
import RegisterCustomer from "./RegisterCustomer.jsx";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [registering, setRegistering] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Unable to log in");
      setMessage(`Welcome, ${result.data.username}! You are logged in.`);
      setPassword("");
      onLogin(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (registering) return <RegisterCustomer onBack={() => setRegistering(false)} onRegistered={(newUsername) => {
    setUsername(newUsername);
    setPassword("");
    setError("");
    setMessage("Customer account created. Log in to continue.");
    setRegistering(false);
  }} />;

  return (
    <section className="login-wrap" aria-labelledby="login-title">
      <form className="panel login-panel" onSubmit={handleSubmit}>
        <div className="login-symbol" aria-hidden="true">↗</div>
        <p className="eyebrow">WELCOME BACK</p>
        <h1 id="login-title">Log in</h1>
        <p className="login-copy">Enter your username and password to continue.</p>

        {error && <div className="alert error-alert" role="alert">{error}</div>}
        {message && <div className="alert success-alert" role="status">{message}</div>}

        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          minLength={3}
          required
        />
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
        <button className="primary-button login-button" type="submit" disabled={busy}>
          {busy ? <><span className="spinner" /> Logging in…</> : "Log in"}
          {!busy && <span aria-hidden="true">→</span>}
        </button>
        <p className="login-register-link">New customer? <button className="back-link" type="button" disabled={busy} onClick={() => {
          setPassword("");
          setError("");
          setMessage("");
          setRegistering(true);
        }}>Add customer</button></p>
      </form>
    </section>
  );
}
