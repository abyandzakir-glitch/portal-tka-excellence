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
import { mergeTryouts } from "../../lib/tka/tryouts";
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
  // The seed already holds results for this TO, so the first upload replaces them too.
  await asUser(adminBdg, (tx) => commitBatch(tx, b1.id, adminBdg, { confirmReplace: true }));
  const after1 = await scoreState(to4!.id, SDTJBDG);
  check("nilai tersimpan untuk semua siswa", after1.n === roster.length, JSON.stringify(after1));
  const present = await one(client<{ n: number; avg: string }[]>`
    select count(*)::int as n, avg(raw_score)::text as avg from public.tryout_scores
     where tryout_id = ${to4!.id} and school_id = ${SDTJBDG} and status = 'present'`);
  check("20 siswa hadir dengan nilai 100", present.n === 20 && Number(present.avg) === 100, JSON.stringify(present));

  // Upload 2: everybody answers "A".
  const sheet2: Cell[][] = [header, ...roster.map((s) => [s.nis, s.full_name, ...items.map(() => "A")])];
  const b2 = await upload(adminBdg, "tryout_results", SDTJBDG, sheet2, { tryoutId: to4!.id });
  check("pratinjau menghitung siswa yang akan diganti", b2.config.replaceCount === roster.length, String(b2.config.replaceCount));
  const noConfirm = await expectError(() => asUser(adminBdg, (tx) => commitBatch(tx, b2.id, adminBdg)));
  check("penggantian tanpa konfirmasi ditolak", noConfirm !== null && /konfirmasi penggantian/.test(noConfirm), noConfirm ?? "berhasil");
  check("penolakan tidak mengubah data", JSON.stringify(await scoreState(to4!.id, SDTJBDG)) === JSON.stringify(after1));
  await asUser(adminBdg, (tx) => commitBatch(tx, b2.id, adminBdg, { confirmReplace: true }));
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
  console.log("\nHasil TO per kelas: file kedua menambah, bukan menggantikan");
  const half = Math.floor(roster.length / 2);
  const classA = roster.slice(0, half);
  const classB = roster.slice(half);
  const asSheet = (list: readonly { nis: string; full_name: string }[], answer: (i: { answer_key: string }) => string): Cell[][] => [header, ...list.map((s) => [s.nis, s.full_name, ...items.map(answer)])];
  const wipe = await upload(adminBdg, "tryout_results", SDTJBDG, asSheet(roster, (i) => i.answer_key), { tryoutId: to4!.id });
  await asUser(adminBdg, (tx) => commitBatch(tx, wipe.id, adminBdg, { confirmReplace: true }));
  // Two class files on top of a whole-school upload.
  const cA = await upload(adminBdg, "tryout_results", SDTJBDG, asSheet(classA, () => "A"), { tryoutId: to4!.id });
  await asUser(adminBdg, (tx) => commitBatch(tx, cA.id, adminBdg, { confirmReplace: true }));
  const cB = await upload(adminBdg, "tryout_results", SDTJBDG, asSheet(classB, () => "B"), { tryoutId: to4!.id });
  check("kelas B tidak mengganti siswa kelas A", cB.config.replaceCount === classB.length, String(cB.config.replaceCount));
  await asUser(adminBdg, (tx) => commitBatch(tx, cB.id, adminBdg, { confirmReplace: true }));
  const perClass = await one(client<{ a: number; b: number }[]>`
    select count(*) filter (where import_batch_id = ${cA.id})::int as a, count(*) filter (where import_batch_id = ${cB.id})::int as b
      from public.tryout_scores where tryout_id = ${to4!.id} and school_id = ${SDTJBDG}`);
  check("hasil kelas A dan kelas B tersimpan berdampingan", perClass.a === classA.length && perClass.b === classB.length, JSON.stringify(perClass));
  const statuses = await client<{ id: string; status: string }[]>`select id, status from public.import_batches where id in (${wipe.id}, ${cA.id}, ${cB.id})`;
  const st = (id: string) => statuses.find((s) => s.id === id)!.status;
  check("unggahan kelas A tetap aktif; unggahan yang seluruh siswanya diganti menjadi digantikan", st(cA.id) === "committed" && st(cB.id) === "committed" && st(wipe.id) === "superseded", JSON.stringify(statuses));

  // Class A again (correction): replaces class A only, after confirmation.
  const cA2 = await upload(adminBdg, "tryout_results", SDTJBDG, asSheet(classA, (i) => i.answer_key), { tryoutId: to4!.id });
  check("koreksi kelas A: hanya siswa kelas A yang akan diganti", cA2.config.replaceCount === classA.length);
  await asUser(adminBdg, (tx) => commitBatch(tx, cA2.id, adminBdg, { confirmReplace: true }));
  const afterFix = await one(client<{ a2: number; b: number }[]>`
    select count(*) filter (where import_batch_id = ${cA2.id})::int as a2, count(*) filter (where import_batch_id = ${cB.id})::int as b
      from public.tryout_scores where tryout_id = ${to4!.id} and school_id = ${SDTJBDG}`);
  check("koreksi kelas A tidak menyentuh kelas B", afterFix.a2 === classA.length && afterFix.b === classB.length, JSON.stringify(afterFix));
  const stA = await one(client<{ status: string }[]>`select status from public.import_batches where id = ${cA.id}`);
  check("unggahan kelas A lama menjadi digantikan", stA.status === "superseded");

  const outOfOrder = await expectError(() => asUser(superAdmin, (tx) => rollbackBatch(tx, cB.id, superAdmin)));
  check("unggahan kelas B baru bisa dibatalkan (tidak ada yang menggantinya)", outOfOrder === null, outOfOrder ?? "");
  const blockedWipe = await expectError(() => asUser(superAdmin, (tx) => rollbackBatch(tx, cA.id, superAdmin)));
  check("unggahan kelas A lama tidak bisa dibatalkan sebelum koreksinya", blockedWipe !== null && /digantikan|lebih baru/.test(blockedWipe), blockedWipe ?? "berhasil");

  // Undo newest first: everything returns to the seed.
  for (const b of [cA2, cA, wipe]) await asUser(superAdmin, (tx) => rollbackBatch(tx, b.id, superAdmin));
  check("membatalkan berurutan mengembalikan data seed", JSON.stringify(await scoreState(to4!.id, SDTJBDG)) === JSON.stringify(seeded), JSON.stringify(await scoreState(to4!.id, SDTJBDG)));

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
  await asUser(adminBdg, (tx) => commitBatch(tx, r1.id, adminBdg, { confirmReplace: true }));

  console.log("\nSatu TO per nama: tolak TO kembar, gabungkan yang terlanjur kembar");
  const tryNewTo = async (name: string) => {
    const d = await upload(adminBdg, "tryout_blueprint", SDTJBDG, blueprintRows, { newTryout: { ...newTo, name } });
    return expectError(() => asUser(adminBdg, (tx) => commitBatch(tx, d.id, adminBdg)));
  };
  const again = await tryNewTo("  to internal   UJI ");
  check("nama TO yang sama (beda huruf/spasi) ditolak", again !== null && /sudah ada/.test(again), again ?? "berhasil");
  // A twin created by another school before this rule existed (written directly, as old data would be).
  const SDTJCMH = school("SDTJCMH");
  const [twin] = await client<{ id: string }[]>`
    insert into public.tryouts (name, date, academic_year_id, level, subject_id, owner_school_id)
    select name, '2026-11-12', academic_year_id, level, subject_id, ${SDTJCMH} from public.tryouts where id = ${bpResult.tryoutId}
    returning id`;
  await client`insert into public.tryout_schools (tryout_id, school_id) values (${twin!.id}, ${SDTJCMH})`;
  await client`insert into public.tryout_items (tryout_id, number, competency_id, cognitive_level, difficulty, answer_key, is_voided)
    select ${twin!.id}, number, competency_id, cognitive_level, difficulty, answer_key, is_voided from public.tryout_items where tryout_id = ${bpResult.tryoutId}`;
  await client`update public.tryouts set name = 'TO Uji Sekolah Lain' where id = ${twin!.id}`;
  // Admin SDTJBDG cannot see SDTJCMH's TO (RLS); the lookup still finds it.
  const hidden = await tryNewTo("TO Uji Sekolah Lain");
  check("nama TO milik sekolah lain (tak terlihat) juga ditolak", hidden !== null && /sekolah lain atau yayasan/.test(hidden), hidden ?? "berhasil");
  await client`update public.tryouts set name = 'TO Internal Uji' where id = ${twin!.id}`;

  const cmhStudent = await one(client<{ nis: string }[]>`select nis from public.students where school_id = ${SDTJCMH} order by nis limit 1`);
  const rc = await upload(superAdmin, "tryout_results", SDTJCMH, [["NIS", "1", "2", "3", "4", "5"], [cmhStudent.nis, "A", "A", "A", "A", "A"]], { tryoutId: twin!.id });
  await asUser(superAdmin, (tx) => commitBatch(tx, rc.id, superAdmin));
  const merged = await asUser(superAdmin, (tx) => mergeTryouts(tx, [twin!.id, bpResult.tryoutId!]));
  check("TO paling awal dipertahankan", merged.keptId === bpResult.tryoutId && merged.removed === 1 && merged.movedScores === 1, JSON.stringify(merged));
  const after = await one(client<{ tos: number; owner: string | null; schools: number; scores: number; foreign: number; batch: string }[]>`
    select (select count(*)::int from public.tryouts where name = 'TO Internal Uji') as tos,
           (select owner_school_id from public.tryouts where id = ${bpResult.tryoutId}) as owner,
           (select count(*)::int from public.tryout_schools where tryout_id = ${bpResult.tryoutId}) as schools,
           (select count(*)::int from public.tryout_scores where tryout_id = ${bpResult.tryoutId}) as scores,
           (select count(*)::int from public.item_responses r join public.tryout_items i on i.id = r.item_id
             where r.tryout_id = ${bpResult.tryoutId} and i.tryout_id <> ${bpResult.tryoutId}) as foreign,
           (select tryout_id::text from public.import_batches where id = ${rc.id}) as batch`);
  check("satu TO jaringan dengan dua sekolah peserta dan nilai keduanya", after.tos === 1 && after.owner === null && after.schools === 2 && after.scores === 2, JSON.stringify(after));
  check("jawaban per soal menunjuk butir TO yang dipertahankan; riwayat unggahan ikut pindah", after.foreign === 0 && after.batch === bpResult.tryoutId);
  await asUser(superAdmin, (tx) => rollbackBatch(tx, rc.id, superAdmin));
  const cmhLeft = await one(client<{ n: number }[]>`select count(*)::int as n from public.tryout_scores where tryout_id = ${bpResult.tryoutId} and school_id = ${SDTJCMH}`);
  check("unggahan hasil dari TO kembar tetap bisa dibatalkan setelah digabung", cmhLeft.n === 0);
  const notSame = await expectError(() => asUser(superAdmin, (tx) => mergeTryouts(tx, [bpResult.tryoutId!, to4!.id])));
  check("TO dengan nama/kisi berbeda tidak bisa digabung", notSame !== null && /berbeda/.test(notSame), notSame ?? "berhasil");

  const blocked =await expectError(() => asUser(superAdmin, (tx) => rollbackBatch(tx, bp.id, superAdmin)));
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

  // ---------------------------------------------------------------------------
  console.log("\nPrestasi: rekap berantakan, unggah ulang kumulatif, isolasi, batalkan");
  const achState = async () =>
    one(client<{ a: number; p: number }[]>`
      select (select count(*)::int from public.achievements where school_id = ${SDTJBDG}) as a,
             (select count(*)::int from public.achievement_participants where school_id = ${SDTJBDG}) as p`);
  const achBefore = await achState();
  const [s1, s2, s3] = roster;
  const recap: Cell[][] = [
    ["REKAP PRESTASI SISWA (contoh anonim)"],
    [null],
    ["No", "TANGGAL", "NAMA SISWA", "KELAS", "NAMA PERLOMBAAN/ EVENT", "JENIS/BIDANG PERLOMBAAN", "TINGKAT, KOTA PERLOMBAAN", "HASIL PERLOMBAAN"],
    [1, "3 November 2026", s1!.full_name, "6A", "Olimpiade Sains Uji", "Matematika", "Nasional, Online", "Medali Perak"],
    [2, "14-15 November 2026", `${s2!.full_name}, ${s3!.full_name} dan Nama Panggilan`, "6A", "Lomba Cerdas Cermat Uji", "Cerdas Cermat", "Kota Bandung", "Juara 1 Kategori Umum"],
    [3, "Oktober", s1!.full_name, "6A", "Kejuaraan Renang Uji", "Renang 25 m", "Kecamatan", "Medali Partisipasi"],
  ];
  const a1 = await upload(adminBdg, "achievements", SDTJBDG, recap, {});
  check("pratinjau prestasi tanpa error", a1.config.summary.error === 0 && a1.config.summary.ok + a1.config.summary.warning === 3, JSON.stringify(a1.config.summary));
  await asUser(adminBdg, (tx) => commitBatch(tx, a1.id, adminBdg));
  const achAfter = await achState();
  // Participants: 1 + 3 (team incl. a nickname) + 1 = 5.
  check("3 prestasi & 5 peserta tersimpan (nama panggilan disimpan apa adanya)", achAfter.a === achBefore.a + 3 && achAfter.p === achBefore.p + 5, JSON.stringify({ achBefore, achAfter }));
  const [team] = await client<{ rank: string; level: string; category: string; notes: string; matched: number }[]>`
    select a.rank, a.level, a.category, a.notes,
           (select count(*)::int from public.achievement_participants p where p.achievement_id = a.id and p.student_id is not null) as matched
      from public.achievements a where a.import_batch_id = ${a1.id} and a.competition_name = 'Lomba Cerdas Cermat Uji'`;
  check("peringkat/tingkat/kategori dinormalkan, 2 dari 3 nama cocok ke master", team?.rank === "JUARA_1" && team.level === "KOTA_KABUPATEN" && team.category === "AKADEMIK" && team.matched === 2, JSON.stringify(team));
  check("tanggal perkiraan & hasil asli tercatat di Catatan", /Tanggal perkiraan/.test(team!.notes) && /Hasil asli: Juara 1 Kategori Umum/.test(team!.notes));

  const a2 = await upload(adminBdg, "achievements", SDTJBDG, recap, {});
  check("unggah ulang file yang sama: semua baris dilewati, tidak ada data ganda", a2.config.summary.skipped === 3 && a2.config.fileIssues.some((i) => /sudah tersimpan/.test(i.message)), JSON.stringify(a2.config));
  const noCommit = await expectError(() => asUser(adminBdg, (tx) => commitBatch(tx, a2.id, adminBdg)));
  check("…dan tidak ada yang bisa disimpan", noCommit !== null);

  const crossAch = await expectError(() =>
    upload(adminBdg, "achievements", null, [["Tanggal", "Sekolah", "Nama Siswa", "Nama Lomba"], ["1 November 2026", "SMPTJPKU", "X", "Lomba Y"]], {}),
  );
  check("admin sekolah tidak bisa membuat impor prestasi jaringan (tanpa sekolah)", crossAch !== null && /row-level security/i.test(crossAch), crossAch ?? "berhasil");

  await asUser(superAdmin, (tx) => rollbackBatch(tx, a1.id, superAdmin));
  check("batalkan → prestasi & peserta kembali seperti semula", JSON.stringify(await achState()) === JSON.stringify(achBefore));

  // ---------------------------------------------------------------------------
  console.log("\nData siswa: tambah, pindah kelas, kelas baru, batalkan");
  const stState = async () =>
    one(client<{ s: number; c: number; e: string }[]>`
      select (select count(*)::int from public.students where school_id = ${SDTJBDG}) as s,
             (select count(*)::int from public.classes where school_id = ${SDTJBDG}) as c,
             (select string_agg(st.nis || ':' || cl.name, ',' order by st.nis) from public.class_enrollments e
                join public.students st on st.id = e.student_id join public.classes cl on cl.id = e.class_id
               where e.school_id = ${SDTJBDG}) as e`);
  const stBefore = await stState();
  const moved = roster[0]!;
  const stFile: Cell[][] = [
    ["No. Induk", "Nama Lengkap", "JK", "Rombel"],
    [moved.nis, moved.full_name, "L", "6C"],
    ["2099001", "Siswa Baru Uji", "perempuan", "VI-C"],
  ];
  const sb = await upload(adminBdg, "students", SDTJBDG, stFile, {});
  check("pratinjau siswa: 1 baru + 1 pindah kelas, kelas 6C akan dibuat", sb.config.summary.error === 0 && sb.config.fileIssues.some((i) => /1 siswa baru akan ditambahkan dan 1 siswa diperbarui/.test(i.message)), JSON.stringify(sb.config));
  await asUser(adminBdg, (tx) => commitBatch(tx, sb.id, adminBdg));
  const stAfter = await stState();
  check("siswa bertambah 1 dan kelas 6C dibuat", stAfter.s === stBefore.s + 1 && stAfter.c === stBefore.c + 1, JSON.stringify({ stBefore: { s: stBefore.s, c: stBefore.c }, stAfter: { s: stAfter.s, c: stAfter.c } }));
  check("siswa lama pindah ke 6C, siswa baru di 6C", stAfter.e.includes(`${moved.nis}:6C`) && stAfter.e.includes("2099001:6C"));

  const [newStudent] = await client<{ id: string }[]>`select id from public.students where nis = '2099001' and school_id = ${SDTJBDG}`;
  await client`insert into public.achievements (id, school_id, achieved_on, competition_name) values ('00000000-0000-4000-8000-0000000000a1', ${SDTJBDG}, '2026-11-01', 'Lomba Pengaman Uji')`;
  await client`insert into public.achievement_participants (achievement_id, school_id, student_id, raw_name) values ('00000000-0000-4000-8000-0000000000a1', ${SDTJBDG}, ${newStudent!.id}, 'Siswa Baru Uji')`;
  const guarded = await expectError(() => asUser(superAdmin, (tx) => rollbackBatch(tx, sb.id, superAdmin)));
  check("batal ditolak bila siswa baru sudah punya prestasi (tidak ada data yang ikut terhapus)", guarded !== null && /tidak bisa dibatalkan/.test(guarded), guarded ?? "berhasil");
  await client`delete from public.achievements where id = '00000000-0000-4000-8000-0000000000a1'`;

  await asUser(superAdmin, (tx) => rollbackBatch(tx, sb.id, superAdmin));
  check("batalkan → siswa, kelas, dan penempatan kelas kembali seperti semula", JSON.stringify(await stState()) === JSON.stringify(stBefore), JSON.stringify({ now: await stState(), stBefore }));

  console.log(`\n${passes} lulus, ${failures} gagal`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
