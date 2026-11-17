/**
 * Achievement import (CLAUDE.md §8.1, §9.3): maps any school's recap onto the
 * canonical 10-column structure, matches participants to the student master
 * (by name — none of the schools' recaps carry NIS) and flags everything that
 * needs a human decision. Approved rules: DECISIONS.md Fase 4.
 */
import type { Category, Level, Rank } from "@/lib/achievements/labels";
import type { Roster } from "../lookup";
import type { FieldSet } from "../mapping";
import { normalizeText, rankBySimilarity } from "../text";
import { type Issue, type RowInput, statusOf, type ValidationResult, type ValidatedRow } from "../types";
import { cellToString, isBlank } from "../values";
import { isExampleRow, normalizeAchievementDate, normalizeCategory, normalizeLevel, normalizeRank, splitParticipants } from "./normalize";

export const ACHIEVEMENT_FIELDS: FieldSet = {
  fields: [
    { key: "date", label: "Tanggal", required: true, synonyms: ["tanggal", "tgl", "tanggal lomba", "tanggal pelaksanaan", "waktu", "waktu pelaksanaan", "date"] },
    { key: "school", label: "Sekolah", hint: "Kode sekolah, mis. SDTJBDG", synonyms: ["sekolah", "kode sekolah", "unit", "school", "nama sekolah", "asal sekolah"] },
    {
      key: "participants",
      label: "Nama Siswa/Tim",
      hint: "Beberapa nama dipisah koma untuk tim",
      synonyms: ["nama siswa tim", "nama siswa", "nama", "nama peserta", "peserta", "siswa", "nama tim", "nama lengkap", "peserta didik", "student"],
    },
    { key: "class", label: "Kelas", hint: "Dicatat di Catatan", synonyms: ["kelas", "rombel", "class"] },
    {
      key: "competition",
      label: "Nama Lomba",
      required: true,
      synonyms: [
        "nama lomba", "nama perlombaan", "nama perlombaan event", "nama kegiatan", "kegiatan", "event", "kompetisi", "nama kompetisi",
        "perlombaan", "lomba", "nama event", "competition",
      ],
    },
    {
      key: "field",
      label: "Bidang / Jenis Lomba",
      hint: "Dipakai untuk menebak kategori",
      synonyms: ["bidang", "jenis perlombaan", "jenis bidang perlombaan", "jenis lomba", "cabang", "cabang lomba", "mata lomba", "bidang lomba", "jenis"],
    },
    { key: "category", label: "Kategori", synonyms: ["kategori", "category", "kategori prestasi"] },
    {
      key: "level",
      label: "Tingkat",
      synonyms: ["tingkat", "level", "skala", "tingkatan", "skala tingkatan perlombaan", "tingkat kota perlombaan", "tingkat lomba", "jenjang lomba"],
    },
    {
      key: "rank",
      label: "Peringkat",
      synonyms: ["peringkat", "juara", "hasil", "capaian", "hasil perlombaan", "hasil lomba", "prestasi", "penghargaan", "predikat", "medali"],
    },
    { key: "organizer", label: "Penyelenggara", synonyms: ["penyelenggara", "penyelenggara lomba", "panitia", "organizer", "pelaksana"] },
    { key: "evidence", label: "Link Bukti", synonyms: ["link bukti", "bukti", "link", "tautan", "sertifikat", "dokumentasi", "url", "link sertifikat"] },
    { key: "notes", label: "Catatan", synonyms: ["catatan", "keterangan", "ket", "notes"] },
  ],
};

export interface AchievementParticipant {
  studentId: string | null;
  rawName: string;
}

export interface AchievementRow {
  schoolId: string;
  achievedOn: string;
  competitionName: string;
  organizer: string | null;
  category: Category | null;
  level: Level | null;
  rank: Rank | null;
  evidenceUrl: string | null;
  notes: string | null;
  participants: AchievementParticipant[];
}

export interface AchievementContext {
  schools: readonly { id: string; code: string; name: string }[];
  /** School chosen at upload; null = network-wide file with a Sekolah column (Super Admin). */
  batchSchoolId: string | null;
  rosters: ReadonlyMap<string, Roster>;
  academicYear: { startYear: number };
  today: string;
  /** dedupKey() of achievements already stored for the schools concerned. */
  existingKeys: ReadonlySet<string>;
}

/**
 * Duplicate identity: school + date + competition + event/field + participants.
 * The field matters: one student often enters two events of the same
 * championship on the same day (e.g. two swimming strokes) — not a duplicate.
 */
export function dedupKey(a: { schoolId: string; achievedOn: string; competitionName: string; field?: string | null; names: readonly string[] }): string {
  const names = [...a.names].map(normalizeText).filter(Boolean).sort().join(",");
  return `${a.schoolId}|${a.achievedOn}|${normalizeText(a.competitionName)}|${normalizeText(a.field ?? "")}|${names}`;
}

/** The field/event part of a stored achievement, recovered from its notes ("Bidang: …"). */
export function fieldFromNotes(notes: string | null): string {
  return /(?:^|; )Bidang: ([^;]+)/.exec(notes ?? "")?.[1]?.trim() ?? "";
}

const FOOTER = /^(total|jumlah|mengetahui|kepala sekolah|catatan)\b/;

function matchSchool(text: string, schools: AchievementContext["schools"]) {
  const key = normalizeText(text).replace(/ /g, "");
  return (
    schools.find((s) => s.code.toLowerCase() === key) ??
    schools.find((s) => normalizeText(s.name) === normalizeText(text)) ??
    rankBySimilarity(text, schools, (s) => s.name, 0.85)[0]?.item ??
    null
  );
}

export function validateAchievements(rows: readonly RowInput[], ctx: AchievementContext): ValidationResult<AchievementRow> {
  const fileIssues: Issue[] = [];
  const out: ValidatedRow<AchievementRow>[] = [];
  const seen = new Map<string, number>();
  let alreadyStored = 0;

  for (const { rowNumber, values } of rows) {
    const issues: Issue[] = [];
    const notes: string[] = [];
    const competitionText = cellToString(values.competition);
    const fieldText = cellToString(values.field);

    const meaningful = ["competition", "field", "participants", "rank", "level"].some((k) => !isBlank(values[k]));
    if (!meaningful || isExampleRow(values) || FOOTER.test(normalizeText(values.competition ?? values.participants))) {
      out.push({ rowNumber, status: "skipped", data: null, issues: [] });
      continue;
    }

    // School: the row's own column wins; otherwise the school chosen at upload.
    let schoolId: string | null = ctx.batchSchoolId;
    const schoolText = cellToString(values.school);
    if (schoolText) {
      const s = matchSchool(schoolText, ctx.schools);
      if (!s) issues.push({ level: "error", field: "school", message: `Sekolah "${schoolText}" tidak dikenali. Gunakan kode sekolah, mis. SDTJBDG.` });
      else if (ctx.batchSchoolId && s.id !== ctx.batchSchoolId) {
        issues.push({ level: "error", field: "school", message: `Baris ini milik ${s.code}, bukan sekolah yang dipilih saat unggah. Unggah terpisah untuk sekolah tersebut.` });
      } else schoolId = s.id;
    } else if (!schoolId) {
      issues.push({ level: "error", field: "school", message: "Kolom Sekolah kosong. Isi kode sekolah, atau pilih sekolah saat mengunggah." });
    }

    // Date (required; estimates are kept in Catatan).
    const d = normalizeAchievementDate(values.date, ctx.academicYear);
    if (!d.date) {
      issues.push({
        level: "error",
        field: "date",
        message: isBlank(values.date) ? "Tanggal kosong. Isi tanggal prestasi." : `Tanggal "${cellToString(values.date)}" tidak dikenali. Tulis mis. 12 November 2026.`,
      });
    } else {
      if (d.approximate) notes.push(`Tanggal perkiraan (asli: ${d.approximate})`);
      if (d.date > ctx.today) issues.push({ level: "warning", field: "date", message: `Tanggal ${d.date} belum terjadi. Periksa tahunnya.` });
    }

    // Competition name (bidang as fallback).
    let competitionName = competitionText;
    /** Field text kept for the duplicate key (only when it differs from the competition name). */
    let keyField = "";
    if (!competitionName && fieldText) {
      competitionName = fieldText;
      issues.push({ level: "warning", field: "competition", message: "Nama lomba kosong; sementara memakai bidang lomba. Lengkapi bila ada." });
    } else if (fieldText && normalizeText(fieldText) !== normalizeText(competitionName)) {
      notes.push(`Bidang: ${fieldText}`);
      keyField = fieldText;
    }
    if (!competitionName) issues.push({ level: "error", field: "competition", message: "Nama lomba kosong." });

    // Participants: matched by name within the school; unknown names are kept as written.
    const names = splitParticipants(values.participants);
    const participants: AchievementParticipant[] = [];
    const roster = schoolId ? ctx.rosters.get(schoolId) : undefined;
    const unknown: string[] = [];
    for (const name of names) {
      const m = roster?.match({ name });
      if (m?.status === "matched") {
        participants.push({ studentId: m.student.id, rawName: name });
        if (m.warning) issues.push({ level: "warning", field: "participants", message: m.warning });
      } else {
        participants.push({ studentId: null, rawName: name });
        unknown.push(name);
      }
    }
    if (unknown.length) {
      issues.push({
        level: "warning",
        field: "participants",
        message: `${unknown.length === 1 ? `"${unknown[0]}" tidak` : `${unknown.length} nama tidak`} ditemukan di data siswa; disimpan sesuai tulisan (tetap dihitung). Lengkapi nama bila itu nama panggilan.`,
      });
    }
    if (!names.length) {
      issues.push({ level: "warning", field: "participants", message: "Nama siswa kosong. Prestasi tetap dihitung, tetapi belum masuk jumlah siswa berprestasi." });
    }
    const cls = cellToString(values.class);
    if (cls) notes.push(`Kelas: ${cls}`);

    // Taxonomy.
    const category = normalizeCategory(values.category, fieldText, competitionName);
    if (category.note) notes.push(category.note);
    if (category.flag) issues.push({ level: "warning", field: "category", message: "Kategori belum dikenali. Pilih kategori lewat tombol Ubah." });
    const level = normalizeLevel(values.level);
    if (level.note) notes.push(level.note);
    if (level.flag) issues.push({ level: "warning", field: "level", message: `Tingkat "${cellToString(values.level)}" tidak ada di daftar baku; dikosongkan dan dicatat di Catatan.` });
    const rank = normalizeRank(values.rank);
    if (rank.note) notes.push(rank.note);
    if (rank.flag) issues.push({ level: "warning", field: "rank", message: `Hasil "${cellToString(values.rank)}" tidak punya padanan peringkat baku; peringkat dikosongkan dan hasil asli dicatat.` });

    let evidenceUrl: string | null = null;
    const ev = cellToString(values.evidence);
    if (ev) {
      if (/^https?:\/\/\S+$/i.test(ev)) evidenceUrl = ev;
      else {
        notes.push(`Bukti: ${ev}`);
        issues.push({ level: "warning", field: "evidence", message: "Link bukti bukan alamat web (http…); dipindah ke Catatan." });
      }
    }
    const userNotes = cellToString(values.notes);
    if (userNotes) notes.unshift(userNotes);

    let status = statusOf(issues);
    let data: AchievementRow | null = null;
    if (status !== "error" && schoolId && d.date && competitionName) {
      data = {
        schoolId,
        achievedOn: d.date,
        competitionName,
        organizer: cellToString(values.organizer) || null,
        category: category.value,
        level: level.value,
        rank: rank.value,
        evidenceUrl,
        notes: notes.length ? notes.join("; ") : null,
        participants,
      };
      const key = dedupKey({ schoolId, achievedOn: d.date, competitionName, field: keyField, names });
      const prev = seen.get(key);
      if (prev != null) {
        issues.push({ level: "error", message: `Duplikat dengan baris ${prev} (siswa, lomba, dan tanggal sama).` });
        data = null;
      } else {
        seen.set(key, rowNumber);
        if (ctx.existingKeys.has(key)) {
          alreadyStored++;
          out.push({ rowNumber, status: "skipped", data: null, issues: [{ level: "warning", message: "Sudah tersimpan sebelumnya; baris dilewati." }] });
          continue;
        }
      }
      status = statusOf(issues);
    }
    out.push({ rowNumber, status, data: status === "error" ? null : data, issues });
  }

  if (!out.some((r) => r.status !== "skipped")) {
    fileIssues.push(
      alreadyStored
        ? { level: "warning", message: `Semua ${alreadyStored} prestasi di file ini sudah tersimpan sebelumnya. Tidak ada data baru.` }
        : { level: "error", message: "Tidak ada baris prestasi yang bisa dibaca di file ini. Periksa baris judul dan pemetaan kolom." },
    );
  } else if (alreadyStored) {
    fileIssues.push({ level: "warning", message: `${alreadyStored} prestasi sudah tersimpan sebelumnya dan dilewati; hanya baris baru yang akan disimpan.` });
  }
  return { rows: out, fileIssues };
}
