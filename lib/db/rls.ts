import "server-only";
import { sql } from "drizzle-orm";
import { getSystemDb, type Db } from "./client";

export type RlsTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Minimal JWT claims needed by Postgres' auth.uid() / auth.jwt(). */
export interface JwtClaims {
  sub: string;
  role?: string;
  [key: string]: unknown;
}

/**
 * Runs `fn` inside a transaction that impersonates the signed-in user:
 *   - request.jwt.claims is set so auth.uid() resolves to the user,
 *   - the role is switched to `authenticated` so every RLS policy applies.
 * Both settings are transaction-local, so pooled connections stay clean.
 */
export async function withRls<T>(claims: JwtClaims, fn: (tx: RlsTx) => Promise<T>): Promise<T> {
  return getSystemDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
