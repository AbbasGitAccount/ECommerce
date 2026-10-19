import { useCallback, useEffect, useState } from "react";
import Login from "./Login.jsx";
import Product from "./product.jsx";
import AskData from "./AskData.jsx";
async function requestUsers() {
  const response = await fetch("/api/users");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Could not load users");
  return payload.data;
}

export default function App() {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState("products");
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(2);
  const isAdmin = currentUser?.role === 1;
  const isCustomer = currentUser?.role === 2;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUsers(await requestUsers());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role === 1 && page === "directory") loadUsers();
  }, [currentUser, page, loadUsers]);

  function handleLogin(user) {
    setCurrentUser(user);
    setPage(user.role === 1 ? "products" : "purchasing");
  }

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not log out. Please try again.");
    } catch (err) {
      window.alert(err.message);
      return;
    }
    setCurrentUser(null);
    setUsers([]);
    setName("");
    setEmail("");
    setUsername("");
    setPassword("");
    setError("");
    setNotice("");
    setRole(2);
    setPage("products");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          username: username.trim(),
          password,
          role,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Could not add user");
      setUsers((current) => [payload.data, ...current]);
      setName("");
      setEmail("");
      setUsername("");
      setPassword("");
      setRole(2);
      setNotice("User added successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ECommerce home" onClick={() => setPage(isAdmin ? "products" : "purchasing")}>
          <span className="brand-mark">E</span>
          <span>ECommerce<span className="brand-dot">.</span></span>
        </a>
        {currentUser && <nav className="topbar-links" aria-label="Main navigation">
          <span className="account-role">{isAdmin ? "Admin" : "Customer"}</span>
          {isAdmin && <button className={page === "directory" ? "nav-link active" : "nav-link"} type="button" onClick={() => setPage("directory")}>People</button>}
          {isAdmin && <button className={page === "products" ? "nav-link active" : "nav-link"} type="button" onClick={() => setPage("products")}>Products</button>}
          {isCustomer && <button className={page === "purchasing" ? "nav-link active" : "nav-link"} type="button" onClick={() => setPage("purchasing")}>Purchasing</button>}
          <button className={page === "ask-data" ? "nav-link active" : "nav-link"} type="button" onClick={() => setPage("ask-data")}>Ask Your Data</button>
          <button className="nav-link" type="button" onClick={handleLogout}>Log out</button>
        </nav>}
      </header>
      {!currentUser ? (
        <Login onLogin={handleLogin} />
      ) : page === "ask-data" ? (
        <AskData key={currentUser.id} isAdmin={isAdmin} />
      ) : isAdmin && page === "products" ? (
        <Product />
      ) : isCustomer ? (
        <Product key="purchasing" purchasing />
      ) : (
        <>
      <section className="intro" id="top">
        <div>
          <p className="eyebrow">YOUR TEAM, AT A GLANCE</p>
          <h1>People</h1>
          <p className="intro-copy">Keep your customer directory organized and up to date.</p>
        </div>
        <div className="people-count" aria-live="polite">
          <span className="count-number">{users.length}</span>
          <span className="count-label">{users.length === 1 ? "person" : "people"}</span>
        </div>
      </section>

      <section className="content-grid" aria-label="User directory">
        <form className="panel add-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <span className="heading-icon">＋</span>
            <div>
              <h2>Add a person</h2>
              <p>Add someone to your directory.</p>
            </div>
          </div>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="e.g. Alex Morgan"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="alex@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="Choose a username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            minLength={3}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
          <label htmlFor="user-role">Role</label>
          <select id="user-role" className="role-select" value={role} onChange={(event) => setRole(Number(event.target.value))}>
            <option value={1}>Admin</option>
            <option value={2}>Customer</option>
          </select>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? <><span className="spinner" /> Adding…</> : "Add person"}
            {!saving && <span aria-hidden="true">→</span>}
          </button>
          <p className="form-footnote">Username must be 3+ characters; password must be 8+.</p>
        </form>

        <section className="panel list-panel" aria-labelledby="list-title">
          <div className="list-heading">
            <div>
              <p className="eyebrow">DIRECTORY</p>
              <h2 id="list-title">All people</h2>
            </div>
            <button className="refresh-button" type="button" onClick={loadUsers} disabled={loading} aria-label="Refresh people list">
              <span className={loading ? "refresh-icon spinning" : "refresh-icon"}>↻</span>
            </button>
          </div>

          {error && <div className="alert error-alert" role="alert">{error}</div>}
          {notice && <div className="alert success-alert" role="status">{notice}</div>}

          {loading ? (
            <div className="empty-state"><span className="spinner large-spinner" />Loading people…</div>
          ) : users.length === 0 && !error ? (
            <div className="empty-state">
              <span className="empty-icon">✳</span>
              <strong>Your directory is ready</strong>
              <span>Add the first person using the form.</span>
            </div>
          ) : (
            <ul className="user-list">
              {users.map((user) => (
                <li className="user-row" key={user.id}>
                  <span className="avatar" aria-hidden="true">{(user.name || "?").trim().charAt(0).toUpperCase()}</span>
                  <span className="user-info">
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                    <span>{user.role === 1 ? "Admin" : "Customer"}</span>
                    <span className="user-username">
                      {user.username ? `@${user.username}` : "Login credentials not set"}
                    </span>
                  </span>
                  <span className="user-id">#{user.id}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      <footer className="footer">A little more connected, every day.</footer>
        </>
      )}
    </main>
  );
}
