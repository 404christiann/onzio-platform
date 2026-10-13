import type { ClientConfig } from "pg";

/** Database contracts may use a separate local stack without touching another
 * checkout's fixtures. Refuse hosted URLs before opening a connection. */
export function localPostgresConfig(env: Record<string, string | undefined> = process.env): ClientConfig {
  if (!env.SUPABASE_DB_URL) return { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
  const connection = new URL(env.SUPABASE_DB_URL);
  if (!["postgres:", "postgresql:"].includes(connection.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname)) {
    throw new Error("[TEST SAFETY] Refusing a non-loopback PostgreSQL connection.");
  }
  // Prevent libpq parameters from overriding the validated host through a
  // second host/service setting encoded in the query string.
  if (["host", "hostaddr", "service", "servicefile"].some(key => connection.searchParams.has(key))) {
    throw new Error("[TEST SAFETY] Refusing a PostgreSQL host override.");
  }
  return { connectionString: connection.toString() };
}
