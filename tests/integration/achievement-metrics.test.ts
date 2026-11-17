/**
 * Achievements dashboard numbers vs. independent SQL on the seed (Fase 4).
 * Read-only; runs in `pnpm verify:local`.
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../lib/db/schema";
import type { RlsTx } from "../../lib/db/rls";
import { loadAchievementView, parseAchievementFilters } from "../../lib/achievements/load";
import { parseTkaFilters } from "../../lib/tka/filters";
import { loadContext } from "../../lib/tka/load";

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!;
const client = postgres(url, { max: 1, prepare: Boolean(process.env.DATABASE_URL_DIRECT), onnotice: () => {} });
const db = drizzle(client, { schema });
let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passes++;
  else failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

class Rollback extends Error {}
async function view(userId: string, params: Record<string, string> = {}, schoolCode: string | null = null) {
  let out!: Awaited<ReturnType<typeof loadAchievementView>>;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`);
      await tx.execute(sql`set local role authenticated`);
      const ctx = (await loadContext(tx as unknown as RlsTx, parseTkaFilters(params), "2026-11-17"))!;
      const school = schoolCode ? ctx.schools.find((s) => s.code === schoolCode)!.id : null;
      out = await loadAchievementView(tx as unknown as RlsTx, ctx, parseAchievementFilters(params), school);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

async function main() {
  const users = await client<{ id: string; email: string }[]>`select id, email from public.profiles`;
  const user = (l: string) => users.find((u) => u.email.startsWith(`${l}@`))!.id;
  const sa = user("superadmin");
  const admin = user("admin.sdtjbdg");

  console.log("\nKPI prestasi TA 2026/2027 (jaringan)");
  const v = await view(sa);
  const range = sql`a.achieved_on between '2026-07-01' and '2027-06-30'`;
  const prevRange = sql`a.achieved_on between '2025-07-01' and '2026-06-30'`;
  const one = async <T>(q: Promise<T[]>) => (await q)[0]!;
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from public.achievements a where ${range}`);
  check("total prestasi", v.kpis.total === n, `${v.kpis.total} vs ${n}`);
  const [{ p }] = await db.execute<{ p: number }>(sql`select count(*)::int as p from public.achievements a where ${prevRange}`);
  check("total periode yang sama tahun lalu", v.kpis.previousTotal === p, `${v.kpis.previousTotal} vs ${p}`);
  const [{ u }] = await db.execute<{ u: number }>(sql`
    select count(distinct coalesce('id:' || pp.student_id::text,
                 'nama:' || pp.school_id::text || ':' || trim(regexp_replace(lower(pp.raw_name), '[^a-z0-9]+', ' ', 'g'))))::int as u
      from public.achievement_participants pp join public.achievements a on a.id = pp.achievement_id where ${range}`);
  check("siswa berprestasi unik", v.kpis.students === u, `${v.kpis.students} vs ${u}`);
  const [{ np }] = await db.execute<{ np: number }>(sql`select count(*)::int as np from public.achievements a where ${range} and a.level in ('NASIONAL','INTERNASIONAL')`);
  check("nasional + internasional", v.kpis.nationalPlus === np);
  // Points with the default weights written out by hand.
  const [{ pts }] = await db.execute<{ pts: string }>(sql`
    select sum(
      (case a.level when 'KOTA_KABUPATEN' then 1 when 'PROVINSI' then 2 when 'NASIONAL' then 4 when 'INTERNASIONAL' then 6 else 1 end) *
      (case a.rank when 'JUARA_1' then 5 when 'MEDALI_EMAS' then 5 when 'JUARA_2' then 4 when 'MEDALI_PERAK' then 4
                   when 'JUARA_3' then 3 when 'MEDALI_PERUNGGU' then 3 when 'HARAPAN' then 2 when 'FINALIS' then 1 else 0.5 end))::text as pts
      from public.achievements a where ${range}`);
  check("Poin Prestasi (bobot ditulis manual)", Math.abs(v.kpis.points - Number(pts)) < 1e-9, `${v.kpis.points} vs ${pts}`);

  console.log("\nMatriks sekolah × tingkat & kategori");
  const matrix = await db.execute<{ code: string; level: string | null; c: number }>(sql`
    select s.school_code as code, a.level, count(*)::int as c from public.achievements a join public.schools s on s.id = a.school_id
     where ${range} group by 1, 2`);
  const ok = matrix.every((m) => {
    const sc = v.schools.find((s) => s.code === m.code)!;
    return v.bySchoolLevel[sc.id]![(m.level ?? "KOSONG") as "NASIONAL"] === m.c;
  });
  check("setiap sel matriks cocok", ok);
  const [{ ac }] = await db.execute<{ ac: number }>(sql`select count(*)::int as ac from public.achievements a where ${range} and a.category in ('AKADEMIK','TEKNOLOGI')`);
  check("akademik (Akademik + Teknologi)", v.academic.academic === ac, `${v.academic.academic} vs ${ac}`);
  check("akademik + non-akademik + belum dikategorikan = total", v.academic.academic + v.academic.nonAcademic + v.academic.unknown === v.kpis.total);
  check("tren kumulatif berakhir di total", (v.monthly.at(-1)?.cumulative ?? 0) === v.kpis.total);

  console.log("\nFilter & isolasi sekolah");
  const nas = await view(sa, { tingkat: "NASIONAL" });
  const [{ nn }] = await db.execute<{ nn: number }>(sql`select count(*)::int as nn from public.achievements a where ${range} and a.level = 'NASIONAL'`);
  check("filter tingkat Nasional", nas.kpis.total === nn);
  const own = await view(admin);
  const [{ bdg }] = await db.execute<{ bdg: number }>(sql`
    select count(*)::int as bdg from public.achievements a join public.schools s on s.id = a.school_id where ${range} and s.school_code = 'SDTJBDG'`);
  check("admin SDTJBDG hanya menghitung prestasi sekolahnya (RLS)", own.kpis.total === bdg && own.records.every((r) => r.schoolId === own.records[0]?.schoolId), `${own.kpis.total} vs ${bdg}`);
  const asSa = await view(sa, {}, "SDTJBDG");
  check("angka sekolah sama untuk Super Admin dan admin sekolah", JSON.stringify(asSa.kpis) === JSON.stringify(own.kpis));
  void one;

  console.log(`\n${passes} lulus, ${failures} gagal`);
  if (failures) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
