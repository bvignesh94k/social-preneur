import "server-only";
import type { Database } from "@sp/db";
import { createPgDatabase } from "@sp/db/pg";
import { env } from "./env";

// Cached on globalThis so hot reloads in development reuse one connection pool.
const globalForDb = globalThis as unknown as { spDb?: Database };

export async function getDb(): Promise<Database> {
  globalForDb.spDb ??= createPgDatabase(env.DATABASE_URL, { maxConnections: env.DATABASE_POOL_MAX }).db;
  return globalForDb.spDb;
}
