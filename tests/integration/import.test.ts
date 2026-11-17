/**
 * Import commit / supersede / rollback integration test (Fase 2).
 *
 * WRITES DATA. Runs only against the throw-away database of `pnpm verify:local`
 * (which sets IMPORT_TEST_ALLOW_WRITE=1), never against a real project.
 *
 * Every step runs as a real portal user (role `authenticated` + JWT claims), so
 * RLS and the rollback guard trigger are exercised exactly as in the app.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as XLSX from "xlsx";
import * as schema from "../../lib/db/schema";
import type { RlsTx } from "../../lib/db/rls";
import { commitBatch, rollbackBatch } from "../../lib/import/db/commit";
import { createDraftBatch } from "../../lib/import/db/create";
import type { BatchOptions } from "../../lib/import/db/config";
import type { TkaImportKind } from "../../lib/import/pipeline";
import { readTabularFile, type Cell } from "../../lib/import/sheet";

if (process.env.IMPORT_TEST_ALLOW_WRITE !== "1") {
  console.error("✗ Uji impor menulis data dan hanya boleh dijalankan lewat `pnpm verify:local`.");
  process.exit(1);
}

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!;
const client = postgres(url, { max: 1, onnotice: () => {} });
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

/** Runs fn as the given user in a committed transaction (RLS enforced). */
async function asUser<T>(userId: string, fn: (tx: RlsTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx as unknown as RlsTx);
  });
}

async function expectError(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    // Drizzle wraps Postgres errors ("Failed query: …"); the database message is in `cause`.
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
    return cause || (e instanceof Error ? e.message : String(e));
  }
}

function xlsx(rows: Cell[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Data");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

async function upload(userId: string, kind: TkaImportKind, schoolId: string | null, rows: Cell[][], options: BatchOptions) {
  const id = randomUUID();
  const config = await asUser(userId, (tx) =>
    createDraftBatch(tx, { id, kind, schoolId, filename: "uji.xlsx", filePath: null, sheets: readTabularFile(xlsx(rows), "uji.xlsx"), options, userId }),
  );
  return { id, config };
}

const one = async <T>(q: Promise<T[]>) => (await q)[0]!;

async function main() {
  const users = await client<{ id: string; email: string }[]>`select id, email from public.profiles`;
  const user = (local: string) => users.find((u) => u.email.startsWith(`${local}@`))!.id;
  const superAdmin = user("superadmin");
  const adminBdg = user("admin.sdtjbdg");

  const schools = await client<{ id: string; school_code: string }[]>`select id, school_code from public.schools`;
  const school = (code: string) => schools.find((s) => s.school_code === code)!.id;
  const SDTJBDG = school("SDTJBDG");
  const SMPTJPKU = school("SMPTJPKU");

  const roster = await client<{ id: string; nis: string; full_name: string }[]>`
    select id, nis, full_name from public.students where school_id = ${SDTJBDG} order by nis`;
  const [to4] = await client<{ id: string; subject_id: string }[]>`
    select t.id, t.subject_id from public.tryouts t join public.subjects s on s.id = t.subject_id
     where t.name = 'TO 4 Matematika SD'`;
  const items = await client<{ id: string; number: number; answer_key: string }[]>`
    select id, number, answer_key from public.tryout_items where tryout_id = ${to4!.id} order by number`;

  const scoreState = async (tryoutId: string, schoolId: string) =>
    one(client<{ n: number; total: string | null; responses: number }[]>`
      select count(*)::int as n, sum(raw_score)::text as total,
             (select count(*)::int from public.item_responses where tryout_id = ${tryoutId} and school_id = ${schoolId}) as responses
        from public.tryout_scores where tryout_id = ${tryoutId} and school_id = ${schoolId}`);
  const seeded = await scoreState(to4!.id, SDTJBDG);

  // ---------------------------------------------------------------------------
  console.log("\nHasil TO: unggah, unggah ulang (menggantikan), batalkan");
  // Upload 1: first 20 students answer everything correctly; the rest leave everything blank (absent).
  const header = ["NIS", "Nama Siswa", ...items.map((i) => String(i.number))];
  const sheet1: Cell[][] = [header, ...roster.map((s, idx) => [s.nis, s.full_name, ...items.map((i) => (idx < 20 ? i.answer_key : null))])];
  const b1 = await upload(adminBdg, "tryout_results", SDTJBDG, sheet1, { tryoutId: to4!.id });
  check("pratinjau tanpa error", b1.config.summary.error === 0 && b1.config.summary.total === roster.length, JSON.stringify(b1.config.summary));
  check("jawaban dibaca sebagai huruf", b1.config.answerMode === "letter");
  await asUser(adminBdg, (tx) => commitBatch(tx, b1.id, adminBdg));
  const after1 = await scoreState(to4!.id, SDTJBDG);
  check("nilai tersimpan untuk semua siswa", after1.n === roster.length, JSON.stringify(after1));
  const present = await one(client<{ n: number; avg: string }[]>`
    select count(*)::int as n, avg(raw_score)::text as avg from public.tryout_scores
     where tryout_id = ${to4!.id} and school_id = ${SDTJBDG} and status = 'present'`);
  check("20 siswa hadir dengan nilai 100", present.n === 20 && Number(present.avg) === 100, JSON.stringify(present));

  // Upload 2: everybody answers "A".
  const sheet2: Cell[][] = [header, ...roster.map((s) => [s.nis, s.full_name, ...items.map(() => "A")])];
  const b2 = await upload(adminBdg, "tryout_results", SDTJBDG, sheet2, { tryoutId: to4!.id });
  await asUser(adminBdg, (tx) => commitBatch(tx, b2.id, adminBdg));
  const status1 = await one(client<{ status: string; superseded_by: string }[]>`select status, superseded_by from public.import_batches where id = ${b1.id}`);
  check("unggahan pertama ditandai digantikan", status1.status === "superseded" && status1.superseded_by === b2.id, JSON.stringify(status1));
  const after2 = await scoreState(to4!.id, SDTJBDG);
  check("data unggahan kedua menggantikan seluruh data", after2.n === roster.length && after2.responses === roster.length * items.length);

  const denied = await expectError(() => asUser(adminBdg, (tx) => rollbackBatch(tx, b2.id, adminBdg)));
  check("admin sekolah tidak bisa membatalkan batch (dijaga database)", denied !== null && /Hanya Super Admin/.test(denied), denied ?? "berhasil");
  check("percobaan gagal tidak mengubah data", JSON.stringify(await scoreState(to4!.id, SDTJBDG)) === JSON.stringify(after2));

  const supersededErr = await expectError(() => asUser(superAdmin, (tx) => rollbackBatch(tx, b1.id, superAdmin)));
  check("batch yang sudah digantikan tidak bisa dibatalkan langsung", supersededErr !== null && /digantikan/.test(supersededErr));

  await asUser(superAdmin, (tx) => rollbackBatch(tx, b2.id, superAdmin));
  check("batalkan unggahan kedua → data unggahan pertama kembali", JSON.stringify(await scoreState(to4!.id, SDTJBDG)) === JSON.stringify(after1));
  const status1b = await one(client<{ status: string }[]>`select status from public.import_batches where id = ${b1.id}`);
  check("unggahan pertama aktif lagi", status1b.status === "committed");

  await asUser(superAdmin, (tx) => rollbackBatch(tx, b1.id, superAdmin));
  check("batalkan unggahan pertama → data seed kembali utuh", JSON.stringify(await scoreState(to4!.id, SDTJBDG)) === JSON.stringify(seeded), `${JSON.stringify(await scoreState(to4!.id, SDTJBDG))} vs ${JSON.stringify(seeded)}`);

  // ---------------------------------------------------------------------------
  console.log("\nIsolasi sekolah");
  const crossErr = await expectError(() => upload(adminBdg, "tryout_results", SMPTJPKU, sheet1, { tryoutId: to4!.id }));
  check("admin SDTJBDG tidak bisa membuat impor untuk SMPTJPKU", crossErr !== null && /row-level security/i.test(crossErr), crossErr ?? "berhasil");
  const audit = await one(client<{ n: number }[]>`
    select count(*)::int as n from public.audit_logs where entity = 'import_batches' and (diff_json::text like '%source_json%' or diff_json::text like '%snapshot_json%')`);
  check("audit log tidak menyalin isi file/snapshot", audit.n === 0);

  // ---------------------------------------------------------------------------
  console.log("\nLatihan pekanan: menggantikan data yang sama, lalu dibatalkan");
  const week = "2026-11-16";
  const practiceState = async () =>
    one(client<{ n: number; attempted: string }[]>`
      select count(*)::int as n, sum(attempted)::text as attempted from public.practice_logs where school_id = ${SDTJBDG}`);
  const beforePractice = await practiceState();
  const sample = await client<{ nis: string; full_name: string; subject: string; competency: string | null }[]>`
    select st.nis, st.full_name, s.name as subject, c.name as competency
      from public.practice_logs p join public.students st on st.id = p.student_id
      join public.subjects s on s.id = p.subject_id left join public.competencies c on c.id = p.competency_id
     where p.school_id = ${SDTJBDG} and p.week_start = ${week} order by st.nis, s.name, c.name nulls first limit 10`;
  const practiceRows: Cell[][] = [
    ["NIS", "Nama", "Tanggal", "Mapel", "Sub-kompetensi", "Jumlah Soal", "Benar"],
    ...sample.map((r) => [r.nis, r.full_name, "16/11/2026", r.subject, r.competency, 50, 25]),
  ];
  const p1 = await upload(adminBdg, "practice_logs", SDTJBDG, practiceRows, {});
  check("pratinjau mengenali data yang akan diganti", p1.config.fileIssues.some((i) => /akan menggantikan/.test(i.message)), JSON.stringify(p1.config.fileIssues));
  await asUser(adminBdg, (tx) => commitBatch(tx, p1.id, adminBdg));
  const afterPractice = await practiceState();
  check("jumlah baris tetap (data diganti, bukan ditambah)", afterPractice.n === beforePractice.n, `${afterPractice.n} vs ${beforePractice.n}`);
  await asUser(superAdmin, (tx) => rollbackBatch(tx, p1.id, superAdmin));
  check("batalkan → log latihan kembali seperti semula", JSON.stringify(await practiceState()) === JSON.stringify(beforePractice));

  // ---------------------------------------------------------------------------
  console.log("\nKisi-kisi: TO baru milik sekolah, dan perubahan kisi TO yang sudah ada");
  const comps = await client<{ name: string }[]>`
    select c.name from public.competencies c where c.subject_id = ${to4!.subject_id} and c.depth = 2 order by c.code`;
  const blueprintRows: Cell[][] = [["No", "Sub-kompetensi", "Kunci"], ...[1, 2, 3, 4, 5].map((n) => [n, comps[n % comps.length]!.name, "ABCDA"[n - 1]!])];
  const newTo = {
    name: "TO Internal Uji",
    date: "2026-11-10",
    level: "sd" as const,
    subjectId: to4!.subject_id,
    ownerSchoolId: SDTJBDG,
    schoolIds: [SDTJBDG],
  };
  const bp = await upload(adminBdg, "tryout_blueprint", SDTJBDG, blueprintRows, { newTryout: newTo });
  check("kisi-kisi valid", bp.config.summary.error === 0 && bp.config.summary.ok === 5, JSON.stringify(bp.config.summary));
  const bpResult = await asUser(adminBdg, (tx) => commitBatch(tx, bp.id, adminBdg));
  const createdItems = await one(client<{ n: number }[]>`select count(*)::int as n from public.tryout_items where tryout_id = ${bpResult.tryoutId}`);
  check("admin sekolah bisa membuat TO sekolahnya beserta 5 butir", createdItems.n === 5);

  const r1 = await upload(adminBdg, "tryout_results", SDTJBDG, [["NIS", "1", "2", "3", "4", "5"], [roster[0]!.nis, "A", "B", "C", "D", "A"]], { tryoutId: bpResult.tryoutId });
  await asUser(adminBdg, (tx) => commitBatch(tx, r1.id, adminBdg));
  const blocked = await expectError(() => asUser(superAdmin, (tx) => rollbackBatch(tx, bp.id, superAdmin)));
  check("kisi-kisi TO yang sudah punya hasil tidak bisa dibatalkan", blocked !== null && /sudah punya hasil/.test(blocked), blocked ?? "berhasil");
  await asUser(superAdmin, (tx) => rollbackBatch(tx, r1.id, superAdmin));
  await asUser(superAdmin, (tx) => rollbackBatch(tx, bp.id, superAdmin));
  const gone = await one(client<{ n: number }[]>`select count(*)::int as n from public.tryouts where id = ${bpResult.tryoutId}`);
  check("setelah hasil dibatalkan, TO hasil kisi-kisi ikut terhapus", gone.n === 0);

  // Super Admin voids item 1 and changes the key of item 2 on the network TO -> scores recomputed.
  const scoresBefore = await scoreState(to4!.id, SDTJBDG);
  const sdComps = await client<{ id: string; name: string }[]>`
    select c.id, c.name from public.tryout_items i join public.competencies c on c.id = i.competency_id
     where i.tryout_id = ${to4!.id} order by i.number`;
  const newKey2 = items[1]!.answer_key === "A" ? "B" : "A";
  const editRows: Cell[][] = [
    ["Nomor Soal", "Sub-kompetensi", "Kunci Jawaban", "Dianulir"],
    ...items.map((it, i) => [it.number, sdComps[i]!.name, i === 1 ? newKey2 : it.answer_key, i === 0 ? "Ya" : null]),
  ];
  const be = await upload(superAdmin, "tryout_blueprint", null, editRows, { tryoutId: to4!.id });
  check("perubahan kisi-kisi valid", be.config.summary.error === 0, JSON.stringify(be.config.fileIssues));
  await asUser(superAdmin, (tx) => commitBatch(tx, be.id, superAdmin));
  const scoresEdited = await scoreState(to4!.id, SDTJBDG);
  check("nilai dihitung ulang setelah butir dianulir & kunci diubah", scoresEdited.total !== scoresBefore.total);
  const manual = await one(client<{ ok: boolean }[]>`
    select bool_and(abs(s.raw_score - x.expected) < 0.01) as ok
      from public.tryout_scores s
      join (select r.student_id,
                   round(100.0 * count(*) filter (where r.is_correct and not i.is_voided)
                         / (select count(*) from public.tryout_items where tryout_id = ${to4!.id} and not is_voided), 2) as expected
              from public.item_responses r join public.tryout_items i on i.id = r.item_id
             where r.tryout_id = ${to4!.id} group by r.student_id) x on x.student_id = s.student_id
     where s.tryout_id = ${to4!.id} and s.status = 'present' and s.has_item_detail`);
  check("nilai baru cocok dengan perhitungan manual", manual.ok === true);
  await asUser(superAdmin, (tx) => rollbackBatch(tx, be.id, superAdmin));
  check("batalkan perubahan kisi → nilai kembali seperti semula", JSON.stringify(await scoreState(to4!.id, SDTJBDG)) === JSON.stringify(scoresBefore));

  console.log(`\n${passes} lulus, ${failures} gagal`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
