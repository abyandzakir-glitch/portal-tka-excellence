import { readFileSync } from "node:fs";
import { config, parse } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * Migrations for the PRODUCTION Supabase project (`pnpm prod:migrate`).
 * Reads `.env.produksi` (gitignored). Refuses to run when it points at the
 * same database as `.env.local` (the trial/dev project with dummy data).
 */
config({ path: ".env.produksi", quiet: true });

const prodUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "";
if (!prodUrl) throw new Error("`.env.produksi` belum diisi (DATABASE_URL_DIRECT).");
let devUrl = "";
try {
  const dev = parse(readFileSync(".env.local"));
  devUrl = dev.DATABASE_URL_DIRECT ?? dev.DATABASE_URL ?? "";
} catch {
  // no .env.local: nothing to compare against
}
const dbKey = (u: string) => `${new URL(u).username}@${new URL(u).hostname}`;
if (devUrl && dbKey(devUrl) === dbKey(prodUrl)) {
  throw new Error("`.env.produksi` menunjuk ke project Supabase yang sama dengan `.env.local` (uji coba). Isi dengan kredensial project produksi.");
}
console.log(`→ Target database PRODUKSI: ${new URL(prodUrl).username} @ ${new URL(prodUrl).hostname}`);

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  entities: { roles: { provider: "supabase" } },
  dbCredentials: { url: prodUrl },
  strict: true,
  verbose: true,
});
