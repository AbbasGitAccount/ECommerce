const connectionUrl = (env) => env.DATABASE_URL || env.POSTGRES_URL;

export function databaseOptions(env) {
  const connectionString = connectionUrl(env);
  let hostname = env.DB_HOST || env.PGHOST;
  if (connectionString) {
    try { hostname = new URL(connectionString).hostname; } catch { /* Report a sanitized error at initialization. */ }
  }
  const ssl = env.DB_SSL === "true" ? true : env.DB_SSL === "false" ? false
    : hostname?.endsWith(".neon.tech") ? true : undefined;
  return {
    ...(connectionString ? { connectionString } : {
      user: env.DB_USER || env.PGUSER,
      host: hostname,
      database: env.DB_NAME || env.PGDATABASE,
      password: env.DB_PASSWORD || env.PGPASSWORD,
      port: Number(env.DB_PORT || env.PGPORT) || 5432,
    }),
    ...(ssl === undefined ? {} : { ssl }),
    max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, allowExitOnIdle: true,
  };
}

export function databaseConfigurationIssue(env) {
  const connectionString = connectionUrl(env);
  if (connectionString) {
    try {
      const url = new URL(connectionString);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) return "DATABASE_URL_INVALID";
    } catch { return "DATABASE_URL_INVALID"; }
  } else if (env.VERCEL && !(env.DB_HOST || env.PGHOST)) {
    return "DATABASE_CONFIG_MISSING";
  }
  return null;
}

export function databaseFailureHint(error) {
  const hints = {
    DATABASE_CONFIG_MISSING: "Set DATABASE_URL / POSTGRES_URL or the DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD variables for this deployment environment, then redeploy.",
    DATABASE_URL_INVALID: "Use a PostgreSQL connection URL (postgresql://...) supplied by your database provider.",
    ECONNREFUSED: "Check database host/port and network access. A deployed API cannot connect to PostgreSQL on your laptop using localhost.",
    ENOTFOUND: "Check the database hostname in the deployment environment variables.",
    ETIMEDOUT: "Check database firewall/network access from Vercel.",
    "28P01": "Database authentication failed. Check the database user and password.",
    "3D000": "The configured PostgreSQL database does not exist.",
    "42501": "The database user lacks permissions to initialize the application schema.",
    "55P03": "Schema initialization could not acquire a lock. Check active database transactions and retry.",
    SELF_SIGNED_CERT_IN_CHAIN: "Configure the database provider's trusted TLS certificate chain.",
    DEPTH_ZERO_SELF_SIGNED_CERT: "Configure the database provider's trusted TLS certificate chain.",
  };
  if (hints[error.code]) return hints[error.code];
  if (/timeout|timed out/i.test(error.message || "")) return "Database connection timed out. Check database availability and network access from Vercel.";
  return "Check database connection settings, TLS requirements, and schema permissions.";
}
