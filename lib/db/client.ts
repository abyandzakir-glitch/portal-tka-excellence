import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Raw Drizzle client. It connects as the database owner and therefore BYPASSES
 * Row Level Security. Application code must go through `withRls()` in
 * `lib/db/rls.ts`; this export is for the RLS wrapper and system jobs only.
 */
function createDb() {
  // prepare: false is required for Supabase's transaction-mode pooler.
  const client = postgres(serverEnv().DATABASE_URL, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { __db?: Db };

export function getSystemDb(): Db {
  globalForDb.__db ??= createDb();
  return globalForDb.__db;
}
