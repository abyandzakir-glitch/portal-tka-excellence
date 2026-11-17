/**
 * Fase 3 acceptance criterion (CLAUDE.md §11): "angka di dashboard cocok
 * dengan perhitungan manual pada data seed".
 *
 * Read-only. Loads dashboard view models exactly as the pages do (same
 * loaders, RLS role impersonation) and recomputes the same numbers with
 * independent SQL + hand-written arithmetic (no lib/metrics code).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../lib/db/schema";
import type { RlsTx } from "../../lib/db/rls";
import { parseTkaFilters } from "../../lib/tka/filters";
import { loadCompetencyStudents, loadContext, loadNetworkView, loadSchoolView, loadStudentView, type TkaContext } from "../../lib/tka/load";

const TODAY = "2026-11-17";
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!;
const client = postgres(url, { max: 1, prepare: Boolean(process.env.DATABASE_URL_DIRECT), onnotice: () => {} });
const db = drizzle(client, { schema });

let passes = 0;
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const close = (a: number | null | undefined, b: number | null | undefined, eps = 1e-6) => a != null && b != null && Math.abs(a - b) < eps;

class Rollback extends Error {}
async function asUser<T>(userId: string, fn: (tx: RlsTx) => Promise<T>): Promise<T> {
  let out!: T;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`);
      await tx.execute(sql`set local role authenticated`);
      out = await fn(tx as unknown as RlsTx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

async function ctxFor(tx: RlsTx, params: Record<string, string> = {}): Promise<TkaContext> {
  return (await loadContext(tx, parseTkaFilters(params), TODAY))!;
}

/** Hand-written mastery: 70/30 blend, 2x recent within each source, single-source fallback. */
function manualMastery(to: { rA: number; rC: number; oA: number; oC: number }, pr: { rA: number; rC: number; oA: number; oC: number }) {
  const ratio = (x: typeof to) => (x.rA * 2 + x.oA > 0 ? (x.rC * 2 + x.oC) / (x.rA * 2 + x.oA) : null);
  const a = ratio(to);
  const b = ratio(pr);
  if (a != null && b != null) return 0.7 * a + 0.3 * b;
  return a ?? b;
}

async function main() {
  const users = await client<{ id: string; email: string }[]>`select id, email from public.profiles`;
  const user = (local: string) => users.find((u) => u.email.startsWith(`${local}@`))!.id;
  const superAdmin = user("superadmin");
  const adminBdg = user("admin.sdtjbdg");
  const [bdg] = await client<{ id: string; level: "sd" | "smp" }[]>`select id, level from public.schools where school_code = 'SDTJBDG'`;

  // ---------------------------------------------------------------------------
  console.log("\nRingkasan jaringan — Matematika, TA penuh");
  const net = await asUser(superAdmin, async (tx) => loadNetworkView(tx, await ctxFor(tx)));

  // Latest MAT TO per school = TO 4 (2026-11-14); previous = TO 3.
  const latest = await client<{ n_present: number; avg: string; meet: number; n_expected: number }[]>`
    with latest as (
      select ts.school_id, t.id from public.tryouts t join public.subjects s on s.id = t.subject_id
        join public.tryout_schools ts on ts.tryout_id = t.id
       where s.code = 'MAT' and t.name like 'TO 4 %')
    select count(*) filter (where sc.status = 'present')::int as n_present,
           avg(sc.raw_score) filter (where sc.status = 'present')::text as avg,
           count(*) filter (where sc.status = 'present' and sc.raw_score >= 70)::int as meet,
           (select count(*)::int from public.students where is_active) as n_expected
      from public.tryout_scores sc join latest l on l.id = sc.tryout_id and l.school_id = sc.school_id`;
  const L = latest[0]!;
  check("rata-rata nilai TO terakhir", close(net.kpis.average, Math.round(Number(L.avg) * 100) / 100, 0.006), `${net.kpis.average} vs ${L.avg}`);
  check("% siswa mencapai target (70)", close(net.kpis.shareMeetingTarget, L.meet / L.n_present), `${net.kpis.shareMeetingTarget} vs ${L.meet}/${L.n_present}`);
  check("tingkat partisipasi", close(net.kpis.participation, L.n_present / L.n_expected), `${net.kpis.participation} vs ${L.n_present}/${L.n_expected}`);

  const [prev] = await client<{ avg: string }[]>`
    select avg(sc.raw_score)::text as avg from public.tryout_scores sc join public.tryouts t on t.id = sc.tryout_id
      join public.subjects s on s.id = t.subject_id where s.code = 'MAT' and t.name like 'TO 3 %' and sc.status = 'present'`;
  check("perubahan vs TO sebelumnya", close(net.kpis.delta, Math.round((Math.round(Number(L.avg) * 100) / 100 - Math.round(Number(prev!.avg) * 100) / 100) * 100) / 100, 0.011), `${net.kpis.delta}`);

  const [week] = await client<{ a: number }[]>`select coalesce(sum(p.attempted), 0)::int as a from public.practice_logs p
    join public.subjects s on s.id = p.subject_id where s.code = 'MAT' and p.week_start = '2026-11-16'`;
  check("total soal latihan pekan ini (16–22 Nov)", net.kpis.practiceThisWeek === week!.a, `${net.kpis.practiceThisWeek} vs ${week!.a}`);
  check("jumlah siswa dalam cakupan = siswa aktif", net.kpis.students === L.n_expected);

  // ---------------------------------------------------------------------------
  console.log("\nHeatmap: satu sel sekolah × kompetensi dihitung manual");
  const [comp] = await client<{ id: string; name: string }[]>`
    select c.id, c.name from public.competencies c join public.subjects s on s.id = c.subject_id
     where s.code = 'MAT' and s.level = 'sd' and c.depth = 2 order by c.code limit 1 offset 1`;
  const recentStart = "2026-10-21"; // asOf 2026-11-17, 4 weeks
  const [toc] = await client<{ rA: number; rC: number; oA: number; oC: number }[]>`
    select count(*) filter (where t.date >= ${recentStart})::int as "rA",
           count(*) filter (where t.date >= ${recentStart} and r.is_correct)::int as "rC",
           count(*) filter (where t.date < ${recentStart})::int as "oA",
           count(*) filter (where t.date < ${recentStart} and r.is_correct)::int as "oC"
      from public.item_responses r join public.tryout_items i on i.id = r.item_id join public.tryouts t on t.id = r.tryout_id
     where i.competency_id = ${comp!.id} and not i.is_voided and r.school_id = ${bdg!.id}`;
  const [prc] = await client<{ rA: number; rC: number; oA: number; oC: number }[]>`
    select coalesce(sum(attempted) filter (where week_start >= ${recentStart}), 0)::int as "rA",
           coalesce(sum(correct) filter (where week_start >= ${recentStart}), 0)::int as "rC",
           coalesce(sum(attempted) filter (where week_start < ${recentStart}), 0)::int as "oA",
           coalesce(sum(correct) filter (where week_start < ${recentStart}), 0)::int as "oC"
      from public.practice_logs where competency_id = ${comp!.id} and school_id = ${bdg!.id}`;
  const expected = manualMastery(toc!, prc!);
  const cell = net.heatmap.cells[`${comp!.id}|${bdg!.id}`];
  check(`SDTJBDG × "${comp!.name}" = ${(expected! * 100).toFixed(2)}%`, close(cell?.ratio, expected), `${cell?.ratio} vs ${expected}`);
  check("jumlah butir sel = TO + latihan (tanpa bobot)", cell?.items === toc!.rA + toc!.oA + prc!.rA + prc!.oA);

  const [voided] = await client<{ n: number }[]>`
    select count(*)::int as n from public.item_responses r join public.tryout_items i on i.id = r.item_id
     where i.is_voided and i.competency_id = ${comp!.id} and r.school_id = ${bdg!.id}`;
  check("butir dianulir tidak ikut dihitung", voided!.n === 0 || cell!.items === toc!.rA + toc!.oA + prc!.rA + prc!.oA);

  const smpCell = Object.keys(net.heatmap.cells).find((k) => k.startsWith(`${comp!.id}|`) && !k.endsWith(bdg!.id) && net.heatmap.cols.find((c) => k.endsWith(c.id))?.level === "smp");
  check("kompetensi SD tidak diisi untuk sekolah SMP", smpCell === undefined);

  // ---------------------------------------------------------------------------
  console.log("\nDashboard sekolah: admin sekolah vs Super Admin (RLS tidak mengubah angka)");
  const school = { id: bdg!.id, code: "SDTJBDG", name: "SD Talenta Juara Bandung", level: "sd" as const };
  const asAdmin = await asUser(adminBdg, async (tx) => loadSchoolView(tx, await ctxFor(tx), school));
  const asSuper = await asUser(superAdmin, async (tx) => loadSchoolView(tx, await ctxFor(tx), school));
  check("KPI sama untuk kedua peran", JSON.stringify(asAdmin.kpis) === JSON.stringify(asSuper.kpis));
  check("heatmap kelas sama untuk kedua peran", JSON.stringify(asAdmin.heatmap) === JSON.stringify(asSuper.heatmap));
  check("tabel siswa berisi 60 siswa SDTJBDG", asAdmin.students.length === 60);
  const netCell = net.heatmap.cells[`${comp!.id}|${bdg!.id}`];
  const schoolPooled = asSuper.weakest.find((w) => w.id === comp!.id);
  check("sel jaringan = nilai sekolah di daftar kompetensi terlemah (bila tampil)", !schoolPooled || close(schoolPooled.ratio, netCell?.ratio));

  // Class heatmap pooled over classes equals school pooled (linearity).
  const drill = await asUser(superAdmin, async (tx) => loadCompetencyStudents(tx, await ctxFor(tx), comp!.id, bdg!.id, null));
  check("drill-down sel heatmap = nilai sel", close(drill?.pooled.ratio, netCell?.ratio), `${drill?.pooled.ratio} vs ${netCell?.ratio}`);
  check("drill-down mengurutkan siswa terlemah lebih dulu", (drill?.students[0]?.mastery.ratio ?? 0) <= (drill?.students.at(-1)?.mastery.ratio ?? 1) || drill?.students.at(-1)?.mastery.status === "kurang_data");

  // ---------------------------------------------------------------------------
  console.log("\nProfil siswa: status & nilai");
  const row = asSuper.students.find((s) => s.lastScore != null)!;
  const view = await asUser(superAdmin, async (tx) => loadStudentView(tx, await ctxFor(tx), row.id));
  const mat = view!.subjects.find((s) => s.code === "MAT")!;
  const [lastScore] = await client<{ raw: string }[]>`
    select sc.raw_score::text as raw from public.tryout_scores sc join public.tryouts t on t.id = sc.tryout_id
      join public.subjects s on s.id = t.subject_id where s.code = 'MAT' and sc.student_id = ${row.id} and t.name like 'TO 4 %'`;
  check("nilai TO terakhir siswa = tabel sekolah", close(mat.scores.at(-1)?.score, Number(lastScore!.raw)) && close(row.lastScore, Number(lastScore!.raw)));
  const [subj] = await client<{ rA: number; rC: number; oA: number; oC: number }[]>`
    select count(*) filter (where t.date >= ${recentStart})::int as "rA", count(*) filter (where t.date >= ${recentStart} and r.is_correct)::int as "rC",
           count(*) filter (where t.date < ${recentStart})::int as "oA", count(*) filter (where t.date < ${recentStart} and r.is_correct)::int as "oC"
      from public.item_responses r join public.tryout_items i on i.id = r.item_id join public.tryouts t on t.id = r.tryout_id
      join public.subjects s on s.id = t.subject_id
     where s.code = 'MAT' and not i.is_voided and i.competency_id is not null and r.student_id = ${row.id}`;
  const [sp] = await client<{ rA: number; rC: number; oA: number; oC: number }[]>`
    select coalesce(sum(attempted) filter (where week_start >= ${recentStart}), 0)::int as "rA", coalesce(sum(correct) filter (where week_start >= ${recentStart}), 0)::int as "rC",
           coalesce(sum(attempted) filter (where week_start < ${recentStart}), 0)::int as "oA", coalesce(sum(correct) filter (where week_start < ${recentStart}), 0)::int as "oC"
      from public.practice_logs p join public.subjects s on s.id = p.subject_id
     where s.code = 'MAT' and p.competency_id is not null and p.student_id = ${row.id}`;
  check("penguasaan mapel Matematika siswa", close(mat.status.ratio, manualMastery(subj!, sp!)), `${mat.status.ratio} vs ${manualMastery(subj!, sp!)}`);
  check("rekomendasi berisi paling banyak 3 kompetensi, tanpa yang 'Mahir'", view!.recommendations.length <= 3 && view!.recommendations.every((r) => r.ratio < 0.85));

  // Total-only fallback: SDTJPKU TO 4 BIN has scores but no item responses.
  const [fallback] = await client<{ scores: number; responses: number }[]>`
    select (select count(*)::int from public.tryout_scores sc join public.schools s on s.id = sc.school_id
             join public.tryouts t on t.id = sc.tryout_id where s.school_code = 'SDTJPKU' and t.name = 'TO 4 Bahasa Indonesia SD' and sc.status = 'present') as scores,
           (select count(*)::int from public.item_responses r join public.schools s on s.id = r.school_id
             join public.tryouts t on t.id = r.tryout_id where s.school_code = 'SDTJPKU' and t.name = 'TO 4 Bahasa Indonesia SD') as responses`;
  const binNet = await asUser(superAdmin, async (tx) => loadNetworkView(tx, await ctxFor(tx, { mapel: "BIN" })));
  const pku = binNet.trend.find((t) => t.label === "SDTJPKU")!;
  check("nilai total saja tetap masuk tren (SDTJPKU TO 4 B. Indonesia)", fallback!.responses === 0 && pku.points.at(-1)?.n === fallback!.scores, `${pku.points.at(-1)?.n} vs ${fallback!.scores}`);

  // Period filter: semester 2 has no data yet -> empty but no crash.
  const s2 = await asUser(superAdmin, async (tx) => loadNetworkView(tx, await ctxFor(tx, { periode: "s2" })));
  check("periode tanpa data menghasilkan KPI kosong (bukan error)", s2.kpis.average === null && s2.kpis.practiceThisWeek === 0);

  console.log(`\n${passes} lulus, ${failures} gagal`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
