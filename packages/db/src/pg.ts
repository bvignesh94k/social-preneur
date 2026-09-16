import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Database } from "./client";
import * as schema from "./schema";

export function createPgDatabase(
  connectionString: string,
  options: { maxConnections?: number } = {},
): { db: Database; close: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString, max: options.maxConnections ?? 10 });
  // Without a listener, an error on an idle connection becomes an uncaught exception that stops the server.
  pool.on("error", (error) => {
    console.error("Database connection error:", error.message);
  });
  const db = drizzle({ client: pool, schema });
  return { db, close: () => pool.end() };
}
