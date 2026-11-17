/**
 * Example import files for manual testing (Fase 2 acceptance), built from the
 * deterministic dummy seed — no real student data.
 *
 * Run by `pnpm verify:local` (throw-away database): writes one neat file (the
 * official template, filled in) and one messy file (titles, renamed columns,
 * other value formats) per import type to docs/contoh-impor/, then imports
 * each file through the real pipeline as the demo school admin and checks
 * that it validates without errors. Nothing is committed to the database.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as XLSX from "xlsx";
import * as schema from "../lib/db/schema";
import type { RlsTx } from "../lib/db/rls";
import type { BatchOptions } from "../lib/import/db/config";
import { loadCompetencies } from "../lib/import/db/context";
import { createDraftBatch } from "../lib/import/db/create";
import type { TkaImportKind } from "../lib/import/pipeline";
import { readTabularFile, type Cell } from "../lib/import/sheet";
import { buildBlueprintTemplate, buildPracticeTemplate, buildResultsTemplate } from "../lib/import/templates/tka";
import { COGNITIVE_LEVELS } from "../lib/tka/cognitive-levels";

const OUT = join(import.meta.dirname, "..", "docs", "contoh-impor");
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!;
const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

class Discard extends Error {}

/** Validates a file as the given user inside a transaction that is always rolled back. */
async function tryImport(userId: string, kind: TkaImportKind, schoolId: string | null, bytes: Uint8Array, filename: string, options: BatchOptions) {
  let summary = "";
  let errors = 0;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`);
      await tx.execute(sql`set local role authenticated`);
      const config = await createDraftBatch(tx as unknown as RlsTx, {
        id: randomUUID(),
        kind,
        schoolId,
        filename,
        filePath: null,
        sheets: readTabularFile(bytes, filename),
        options,
        userId,
      });
      const s = config.summary;
      errors = s.error + config.fileIssues.filter((i) => i.level === "error").length;
      summary = `${s.ok} siap, ${s.warning} perlu dicek, ${s.error} bermasalah, ${s.skipped} dilewati`;
      throw new Discard();
    });
  } catch (e) {
    if (!(e instanceof Discard)) throw e;
  }
  return { summary, errors };
}

function xlsx(sheets: { name: string; rows: Cell[][]; merges?: XLSX.Range[] }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.merges) ws["!merges"] = s.merges;
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

function fill(bytes: Uint8Array, sheet: string, rows: Cell[][]): Uint8Array {
  const wb = XLSX.read(bytes, { type: "array" });
  XLSX.utils.sheet_add_aoa(wb.Sheets[sheet]!, rows, { origin: "A2" });
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const [admin] = await client<{ id: string }[]>`select id from public.profiles where email like 'admin.sdtjbdg@%'`;
  const [school] = await client<{ id: string; name: string }[]>`select id, name from public.schools where school_code = 'SDTJBDG'`;
  const roster = await client<{ nis: string; nisn: string | null; full_name: string; class_name: string }[]>`
    select s.nis, s.nisn, s.full_name, c.name as class_name
      from public.students s join public.class_enrollments e on e.student_id = s.id
      join public.classes c on c.id = e.class_id
     where s.school_id = ${school!.id} order by c.name, s.full_name`;
  const students = roster.map((r) => ({ nis: r.nis, nisn: r.nisn, fullName: r.full_name, className: r.class_name }));
  const [to] = await client<{ id: string; name: string }[]>`select id, name from public.tryouts where name = 'TO 4 Matematika SD'`;
  const items = await client<{ number: number; answer_key: string }[]>`
    select number, answer_key from public.tryout_items where tryout_id = ${to!.id} order by number`;
  const [mat] = await client<{ id: string }[]>`select id from public.subjects where code = 'MAT' and level = 'sd'`;
  const [bin] = await client<{ id: string }[]>`select id from public.subjects where code = 'BIN' and level = 'sd'`;
  const comps = await db.transaction((tx) => loadCompetencies(tx as unknown as RlsTx, [mat!.id, bin!.id]));
  const matComps = comps.get(mat!.id)!;
  const binComps = comps.get(bin!.id)!;

  // Simple deterministic "answers": student i answers item j correctly unless (i + j) % 4 === 0; every 15th student absent.
  const answer = (i: number, j: number) => {
    if (i % 15 === 14) return null;
    const key = items[j]!.answer_key;
    return (i + j) % 4 === 0 ? (key === "A" ? "B" : "A") : key;
  };

  const files: { file: string; bytes: Uint8Array; kind: TkaImportKind; schoolId: string | null; options: BatchOptions }[] = [];

  // --- Hasil TO -------------------------------------------------------------
  files.push({
    file: "hasil-TO4-MAT-SD-SDTJBDG_template.xlsx",
    kind: "tryout_results",
    schoolId: school!.id,
    options: { tryoutId: to!.id },
    bytes: fill(
      buildResultsTemplate({ tryoutName: to!.name, schoolName: school!.name, itemNumbers: items.map((i) => i.number), students }),
      "Hasil TO",
      students.map((s, i) => [s.nis, s.nisn, s.fullName, s.className, ...items.map((_, j) => answer(i, j)), null]),
    ),
  });
  const csv = [
    "REKAP NILAI TRY OUT 4 MATEMATIKA;;;",
    `${school!.name};;;`,
    "",
    ["No", "No Induk", "Nama Peserta", "Rombel", ...items.map((i) => `S${i.number}`), "Skor"].join(";"),
    ...students.map((s, i) => {
      const bits = items.map((it, j) => {
        const a = answer(i, j);
        return a == null ? "" : a === it.answer_key ? "1" : "0";
      });
      return [i + 1, s.nis, s.fullName.toUpperCase(), s.className, ...bits, ""].join(";");
    }),
    ";;Rata-rata kelas;;",
  ].join("\r\n");
  files.push({
    file: "hasil-TO4-MAT-SD-SDTJBDG_berantakan.csv",
    kind: "tryout_results",
    schoolId: school!.id,
    options: { tryoutId: to!.id },
    bytes: new TextEncoder().encode(csv),
  });

  // --- Latihan pekanan ----------------------------------------------------------
  const week = "2026-11-16";
  const practice = students.slice(0, 20).map((s, i) => ({
    s,
    subject: i % 2 ? "Bahasa Indonesia" : "Matematika",
    comp: i % 3 === 0 ? null : (i % 2 ? binComps : matComps)[i % (i % 2 ? binComps : matComps).length]!,
    attempted: 10 + (i % 6),
    correct: 5 + (i % 5),
  }));
  files.push({
    file: "latihan-SDTJBDG_template.xlsx",
    kind: "practice_logs",
    schoolId: school!.id,
    options: {},
    bytes: fill(
      buildPracticeTemplate({ schoolName: school!.name, weekStart: week, subjects: [{ name: "Matematika" }, { name: "Bahasa Indonesia" }], competencies: [...matComps, ...binComps], students: [] }),
      "Latihan Pekanan",
      practice.map((p) => [p.s.nis, p.s.fullName, p.s.className, "16/11/2026", p.subject, p.comp?.name ?? null, p.attempted, p.correct]),
    ),
  });
  const dates = ["Senin, 16 Nov 2026", "17/11/26", "2026-11-16", "16 November 2026"];
  files.push({
    file: "latihan-SDTJBDG_berantakan.xlsx",
    kind: "practice_logs",
    schoolId: school!.id,
    options: {},
    bytes: xlsx([
      { name: "Petunjuk guru", rows: [["Isi setiap Jumat"], ["Hubungi wali kelas bila ada kendala"]] },
      {
        name: "Rekap Pekan Ini",
        rows: [
          ["LAPORAN LATIHAN SOAL — PEKAN 16–22 NOV 2026", null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null],
          ["Rombel", "No.", "No. Induk", "Nama Lengkap", "Tgl", "Mata Pelajaran", "Kode Kompetensi", "Jml Soal", "Salah"],
          ...practice.map((p, i) => [
            p.s.className,
            i + 1,
            Number(p.s.nis),
            p.s.fullName,
            dates[i % dates.length]!,
            p.subject === "Matematika" ? "MTK" : "B. Indo",
            p.comp?.code ?? null,
            p.attempted,
            p.attempted - p.correct,
          ]),
        ],
        merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }],
      },
    ]),
  });

  // --- Kisi-kisi (TO baru milik SDTJBDG) -------------------------------------------
  const levels = COGNITIVE_LEVELS.sd.MAT!;
  const blueprint = Array.from({ length: 20 }, (_, i) => ({
    n: i + 1,
    comp: matComps[i % matComps.length]!,
    level: levels[i % levels.length]!,
    diff: ["Mudah", "Sedang", "Sulit"][i % 3]!,
    key: "ABCD"[i % 4]!,
  }));
  const newTryout = { name: "TO Internal Contoh", date: "2026-11-14", level: "sd" as const, subjectId: mat!.id, ownerSchoolId: school!.id, schoolIds: [school!.id] };
  files.push({
    file: "kisi-MAT-SD_template.xlsx",
    kind: "tryout_blueprint",
    schoolId: school!.id,
    options: { newTryout },
    bytes: fill(
      buildBlueprintTemplate({ subjectName: "Matematika", levelLabel: "SD", competencies: matComps, cognitiveLevels: levels, itemCount: 20 }),
      "Kisi-kisi",
      blueprint.map((b) => [b.n, "Matematika", null, b.comp.name, b.level, b.diff, b.key, null]),
    ),
  });
  files.push({
    file: "kisi-MAT-SD_berantakan.xlsx",
    kind: "tryout_blueprint",
    schoolId: school!.id,
    options: { newTryout },
    bytes: xlsx([
      {
        name: "KISI2",
        rows: [
          ["KISI-KISI TRY OUT INTERNAL — MATEMATIKA KELAS 6", null, null, null, null, null],
          [null, null, null, null, null, null],
          ["No. Butir", "Kunci Jwb", "Materi", "Submateri", "Dimensi", "Tingkat Kesukaran"],
          ...blueprint.map((b, i) => [
            b.n,
            b.key.toLowerCase(),
            b.comp.elementName,
            i % 2 ? b.comp.code : b.comp.name.toUpperCase(),
            b.level.toLowerCase(),
            ["easy", "medium", "hard"][i % 3]!,
          ]),
          [null, null, null, null, null, null],
          ["Disusun oleh: Tim Kurikulum", null, null, null, null, null],
        ],
        merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }],
      },
    ]),
  });

  let failed = 0;
  for (const f of files) {
    writeFileSync(join(OUT, f.file), f.bytes);
    const res = await tryImport(admin!.id, f.kind, f.schoolId, f.bytes, f.file, f.options);
    const ok = res.errors === 0;
    if (!ok) failed++;
    console.log(`  ${ok ? "✓" : "✗"} ${f.file}: ${res.summary}`);
  }
  console.log(`\nFile contoh ditulis ke docs/contoh-impor/ (${files.length} file).`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
