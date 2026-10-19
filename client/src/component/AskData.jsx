import { useEffect, useRef, useState } from "react";
import "./AskData.css";

const suggestions = ["What is my total order amount?", "How many orders do I have?", "What is my average order amount?", "Show my recent orders"];
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));

export default function AskData({ isAdmin }) {
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState("mine");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef(null);
  const inFlight = useRef(false);
  const abort = useRef(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy]);

  async function ask(text) {
    const value = text.trim();
    if (inFlight.current || value.length < 3 || value.length > 500) return;
    inFlight.current = true;
    abort.current = new AbortController();
    setBusy(true);
    setError("");
    setQuestion("");
    setMessages((current) => [...current, { role: "user", text: value, scope }]);
    try {
      const response = await fetch("/api/ask-data", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value, scope }), signal: abort.current.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not get an answer.");
      setMessages((current) => [...current, { role: "assistant", text: result.data.answer, orders: result.data.orders }]);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message);
        setQuestion(value);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section className="ask-data" aria-labelledby="ask-data-title">
    <p className="eyebrow">ORDER INSIGHTS</p>
    <h1 id="ask-data-title">Ask Your Data</h1>
    <p className="ask-description">Ask about total spending, order count, average amount, or your five most recent orders. Answers use current, all-time order data. Ask each question in full.</p>
    {isAdmin ? <div className="ask-scope">
      <label htmlFor="ask-scope">Orders to query</label>
      <select id="ask-scope" className="role-select" value={scope} disabled={busy} onChange={(event) => setScope(event.target.value)}>
        <option value="mine">My orders</option><option value="all">All users</option>
      </select>
    </div> : <p className="ask-description">Only your own orders are included.</p>}
    <div className="ask-suggestions" aria-label="Example questions">
      {suggestions.map((text) => <button className="nav-link" type="button" disabled={busy} key={text} onClick={() => ask(text)}>{text}</button>)}
    </div>
    <div className="panel ask-chat">
      <div className="ask-messages" role="log" aria-label="Data questions and answers" aria-live="polite" aria-relevant="additions" aria-busy={busy}>
        {messages.length === 0 && <p className="ask-description">Start with a question below or choose an example above.</p>}
        {messages.map((message, index) => <article className={`ask-message ask-message--${message.role}`} key={index}>
          <strong>{message.role === "user" ? `You · ${message.scope === "all" ? "All users" : "My orders"}` : "Ask Your Data"}</strong>
          <p>{message.text}</p>
          {message.orders?.length > 0 && <ul>{message.orders.map((order) => <li key={order.id}>
            Order #{order.id}: {money(order.total_amount)} · {order.item_count} items · {new Date(order.created_at).toLocaleDateString()}
          </li>)}</ul>}
        </article>)}
        {busy && <p role="status">Checking orders…</p>}
        <div ref={end} />
      </div>
      {error && <p className="alert error-alert" role="alert">{error}</p>}
      <form onSubmit={(event) => { event.preventDefault(); ask(question); }}>
        <label htmlFor="data-question">Your question</label>
        <div className="ask-compose">
          <input id="data-question" value={question} onChange={(event) => setQuestion(event.target.value)} minLength={3} maxLength={500} required disabled={busy} placeholder="What is my total order amount?" />
          <button className="primary-button" disabled={busy || question.trim().length < 3} type="submit">{busy ? "Asking…" : "Ask"}</button>
        </div>
      </form>
    </div>
  </section>;
}
