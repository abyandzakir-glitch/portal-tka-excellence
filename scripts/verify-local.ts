/**
 * Local database verification without Supabase or Docker.
 *
 *   pnpm verify:local
 *
 * Starts a throw-away PostgreSQL 17 server (embedded-postgres: official
 * binaries shipped via npm) in the OS temp folder, adds a minimal stub of
 * Supabase's `auth` schema and roles, applies every Drizzle migration, runs the
 * seed and then the RLS isolation test. The data directory is deleted at the end.
 * The Data API layer of the RLS test is skipped here (no Supabase Auth).
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

const ROOT = join(import.meta.dirname, "..");
const PORT = 54329;
const PASSWORD = randomBytes(12).toString("hex");
const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

/** Just enough of Supabase's environment for our migrations and policies. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  -- No default table privileges: newer Supabase projects do not grant them
  -- either, so migration 0007 must state every grant the app relies on.

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated;
`;

/** Runs a TypeScript script with tsx in a child Node process (no shell). */
function runScript(script: string, env: NodeJS.ProcessEnv, args: string[] = []) {
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [TSX_CLI, script, ...args], { cwd: ROOT, env, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: join(tmpdir(), `portal-verify-${randomBytes(4).toString("hex")}`),
    port: PORT,
    user: "postgres",
    password: PASSWORD,
    persistent: false, // data directory is removed on stop()
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: (e) => console.error("[postgres]", e),
  });

  console.log("→ Menyalakan PostgreSQL 17 sementara…");
  await pg.initialise();
  await pg.start();

  const url = `postgres://postgres:${PASSWORD}@127.0.0.1:${PORT}/postgres`;
  const prodUrl = `postgres://postgres:${PASSWORD}@127.0.0.1:${PORT}/prodcheck`;
  let code = 1;

  /** Roles are cluster-wide, so a second database in the same instance skips creating them. */
  async function migrate(dbUrl: string, opts: { quiet?: boolean; skipRoles?: boolean } = {}) {
    const admin = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      await admin.unsafe(opts.skipRoles ? SUPABASE_STUB.replace(/create role[^;]*;/g, "") : SUPABASE_STUB);
      const journal = JSON.parse(readFileSync(join(ROOT, "drizzle/meta/_journal.json"), "utf8")) as {
        entries: { tag: string }[];
      };
      for (const { tag } of journal.entries) {
        const statements = readFileSync(join(ROOT, "drizzle", `${tag}.sql`), "utf8").split("--> statement-breakpoint");
        for (const statement of statements) if (statement.trim()) await admin.unsafe(statement);
        if (!opts.quiet) console.log(`✓ migrasi ${tag}`);
      }
    } finally {
      await admin.end();
    }
  }

  try {
    await migrate(url);

    const env = {
      ...process.env,
      DATABASE_URL: url,
      DATABASE_URL_DIRECT: url,
      SEED_AUTH_MODE: "local",
      SEED_DEMO_PASSWORD: "", // skip the Data API layer in the RLS test
    };

    // Production mode: master data only, in a separate database.
    console.log("\n== Seed mode produksi (hanya data master) ==");
    {
      const root = postgres(url, { max: 1, onnotice: () => {} });
      await root.unsafe("create database prodcheck");
      await root.end();
      await migrate(prodUrl, { quiet: true, skipRoles: true });
      code = await runScript("scripts/seed/index.ts", { ...env, DATABASE_URL: prodUrl, DATABASE_URL_DIRECT: prodUrl }, ["--production"]);
      const db = postgres(prodUrl, { max: 1, onnotice: () => {} });
      const [r] = await db<{ schools: number; comps: number; settings: number; students: number; profiles: number; tryouts: number; achievements: number }[]>`
        select (select count(*)::int from public.schools) as schools, (select count(*)::int from public.competencies) as comps,
               (select count(*)::int from public.settings) as settings, (select count(*)::int from public.students) as students,
               (select count(*)::int from public.profiles) as profiles, (select count(*)::int from public.tryouts) as tryouts,
               (select count(*)::int from public.achievements) as achievements`;
      await db.end();
      const ok = code === 0 && r!.schools === 5 && r!.comps > 0 && r!.settings > 0 && r!.students + r!.profiles + r!.tryouts + r!.achievements === 0;
      console.log(`${ok ? "  ✓" : "  ✗"} 5 sekolah, ${r!.comps} kompetensi, ${r!.settings} pengaturan; 0 siswa/akun/TO/prestasi dummy (${r!.students}/${r!.profiles}/${r!.tryouts}/${r!.achievements})`);
      if (!ok) code = 1;
    }

    console.log("\n== Seed ==");
    if (code === 0) code = await runScript("scripts/seed/index.ts", env);
    if (code === 0) {
      console.log("\n== Uji RLS ==");
      code = await runScript("tests/integration/rls.test.ts", env);
    }
    if (code === 0) {
      console.log("\n== Verifikasi angka dashboard TKA vs perhitungan manual ==");
      code = await runScript("tests/integration/tka-metrics.test.ts", env);
    }
    if (code === 0) {
      console.log("\n== Verifikasi angka dashboard Prestasi vs perhitungan manual ==");
      code = await runScript("tests/integration/achievement-metrics.test.ts", env);
    }
    if (code === 0) {
      console.log("\n== Uji impor (commit, ganti, batalkan) ==");
      code = await runScript("tests/integration/import.test.ts", { ...env, IMPORT_TEST_ALLOW_WRITE: "1" });
    }
    if (code === 0) {
      console.log("\n== File contoh impor (rapi & berantakan) ==");
      code = await runScript("scripts/import-examples.ts", env);
    }
  } finally {
    await pg.stop();
  }
  process.exitCode = code;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
