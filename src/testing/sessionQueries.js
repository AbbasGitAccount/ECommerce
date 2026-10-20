// In-memory PostgreSQL session responses for HTTP tests; production uses PostgreSQL.
export function sessionQueries(fallback = async () => ({ rows: [] })) {
  const sessions = new Map();
  const query = async (sql, values) => {
    if (sql.startsWith("INSERT INTO auth_sessions")) {
      sessions.set(values[0], { id: values[1], expires: values[2] });
      return { rows: [] };
    }
    if (sql.startsWith("DELETE FROM auth_sessions")) { sessions.delete(values[0]); return { rows: [] }; }
    if (sql.includes("FROM auth_sessions s JOIN users")) {
      const session = sessions.get(values[0]);
      return { rows: session && session.expires > new Date() ? [{ id: session.id, role: session.id === 1 ? 1 : 2 }] : [] };
    }
    return fallback(sql, values);
  };
  query.sessions = sessions;
  return query;
}
