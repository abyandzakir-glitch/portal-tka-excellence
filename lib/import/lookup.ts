/**
 * Matching imported values against master data (CLAUDE.md §9.3 step 6):
 * students (NIS/NISN, then fuzzy name within the same school), subjects and
 * competencies. Fuzzy matches are returned with a warning so the user confirms
 * them in the preview; nothing uncertain is silently accepted.
 */
import { normalizeText, rankBySimilarity } from "./text";

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export interface RosterStudent {
  id: string;
  nis: string;
  nisn: string | null;
  fullName: string;
  className: string | null;
}

export type StudentMatch =
  | { status: "matched"; student: RosterStudent; warning?: string }
  | { status: "not_found"; message: string; suggestions: RosterStudent[] };

const NAME_CONFIDENT = 0.88;
const NAME_MARGIN = 0.06;
const NAME_SUGGEST = 0.6;

export class Roster {
  private byNis = new Map<string, RosterStudent>();
  private byNisn = new Map<string, RosterStudent>();
  private byName = new Map<string, RosterStudent[]>();

  constructor(readonly students: readonly RosterStudent[]) {
    for (const s of students) {
      this.byNis.set(s.nis.toUpperCase(), s);
      if (s.nisn) this.byNisn.set(s.nisn.toUpperCase(), s);
      const key = normalizeText(s.fullName);
      this.byName.set(key, [...(this.byName.get(key) ?? []), s]);
    }
  }

  private suggest(name: string | null): RosterStudent[] {
    if (!name) return [];
    return rankBySimilarity(name, this.students, (s) => s.fullName, NAME_SUGGEST)
      .slice(0, 3)
      .map((r) => r.item);
  }

  match(input: { nis?: string | null; nisn?: string | null; name?: string | null }): StudentMatch {
    const name = input.name?.trim() || null;
    const nameKey = name ? normalizeText(name) : "";

    const byId =
      (input.nis ? this.byNis.get(input.nis.toUpperCase()) : undefined) ??
      (input.nisn ? this.byNisn.get(input.nisn.toUpperCase()) : undefined) ??
      // People sometimes type the NISN into the NIS column and vice versa.
      (input.nis ? this.byNisn.get(input.nis.toUpperCase()) : undefined) ??
      (input.nisn ? this.byNis.get(input.nisn.toUpperCase()) : undefined);

    if (byId) {
      if (name && rankBySimilarity(name, [byId], (s) => s.fullName)[0]!.score < 0.5) {
        return {
          status: "matched",
          student: byId,
          warning: `Nama di file ("${name}") berbeda dengan data master ("${byId.fullName}"). Periksa apakah NIS-nya benar.`,
        };
      }
      return { status: "matched", student: byId };
    }

    const idLabel = input.nis ? `NIS ${input.nis}` : input.nisn ? `NISN ${input.nisn}` : null;

    if (name) {
      const exact = this.byName.get(nameKey) ?? [];
      if (exact.length === 1) {
        return {
          status: "matched",
          student: exact[0]!,
          warning: idLabel ? `${idLabel} tidak ditemukan; dicocokkan berdasarkan nama.` : undefined,
        };
      }
      if (exact.length > 1) {
        return {
          status: "not_found",
          message: `Ada ${exact.length} siswa bernama "${name}". Isi NIS agar tidak tertukar.`,
          suggestions: exact.slice(0, 3),
        };
      }
      const ranked = rankBySimilarity(name, this.students, (s) => s.fullName, NAME_SUGGEST);
      const [first, second] = ranked;
      if (first && first.score >= NAME_CONFIDENT && (!second || first.score - second.score >= NAME_MARGIN)) {
        return {
          status: "matched",
          student: first.item,
          warning: `${idLabel ? `${idLabel} tidak ditemukan. ` : ""}"${name}" dicocokkan dengan "${first.item.fullName}" (nama mirip). Pastikan benar.`,
        };
      }
    }

    return {
      status: "not_found",
      message: idLabel
        ? `${idLabel}${name ? ` (${name})` : ""} tidak ditemukan di data siswa sekolah ini.`
        : name
          ? `Siswa "${name}" tidak ditemukan di data siswa sekolah ini.`
          : "NIS dan nama siswa kosong.",
      suggestions: this.suggest(name),
    };
  }
}

export function describeSuggestions(list: readonly RosterStudent[]): string {
  if (!list.length) return "";
  return ` Mungkin maksudnya: ${list.map((s) => `${s.fullName} (NIS ${s.nis})`).join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export interface SubjectRef {
  id: string;
  code: string;
  name: string;
}

/** Common ways schools write subject names. Keys are subject codes. */
const SUBJECT_ALIASES: Record<string, readonly string[]> = {
  MAT: ["mtk", "mat", "math", "maths", "matematika", "mathematics", "matematik"],
  BIN: ["bin", "bindo", "b indo", "b indonesia", "bhs indonesia", "bahasa indonesia", "bi", "bhs indo", "indonesia"],
};

export function matchSubject(value: string, subjects: readonly SubjectRef[]): SubjectRef | null {
  const key = normalizeText(value);
  if (!key) return null;
  for (const s of subjects) {
    if (normalizeText(s.code) === key || normalizeText(s.name) === key) return s;
    if (SUBJECT_ALIASES[s.code]?.some((a) => normalizeText(a) === key)) return s;
  }
  const best = rankBySimilarity(value, subjects, (s) => s.name, 0.8)[0];
  return best?.item ?? null;
}

// ---------------------------------------------------------------------------
// Competencies (sub-competencies of one subject)
// ---------------------------------------------------------------------------

export interface CompetencyRef {
  id: string;
  code: string;
  name: string;
  elementName: string | null;
}

export type CompetencyMatch =
  | { status: "matched"; competency: CompetencyRef; warning?: string }
  | { status: "not_found"; message: string };

const COMP_CONFIDENT = 0.85;

/**
 * Accepts a competency code ("MAT-SMP-ALJ-02"), the exact sub-competency name,
 * "Elemen - Sub" / "Elemen: Sub" combinations, or a close fuzzy match.
 */
export function matchCompetency(value: string, list: readonly CompetencyRef[]): CompetencyMatch {
  const raw = value.trim();
  if (!raw) return { status: "not_found", message: "Sub-kompetensi kosong." };
  const key = normalizeText(raw);

  const byCode = list.find((c) => normalizeText(c.code) === key);
  if (byCode) return { status: "matched", competency: byCode };

  const byName = list.filter((c) => normalizeText(c.name) === key);
  if (byName.length === 1) return { status: "matched", competency: byName[0]! };

  // "Aljabar - Fungsi", "Aljabar: Fungsi", "Aljabar / Fungsi"
  const parts = raw.split(/\s*[-–:>|/]\s+|\s+[-–:>|/]\s*/);
  if (parts.length >= 2) {
    const subKey = normalizeText(parts.slice(1).join(" "));
    const elKey = normalizeText(parts[0]);
    const combo = list.filter((c) => normalizeText(c.name) === subKey && (!c.elementName || normalizeText(c.elementName) === elKey));
    if (combo.length === 1) return { status: "matched", competency: combo[0]! };
  }

  const ranked = rankBySimilarity(raw, list, (c) => c.name, 0.55);
  const [first, second] = ranked;
  if (first && first.score >= COMP_CONFIDENT && (!second || first.score - second.score >= 0.05)) {
    return {
      status: "matched",
      competency: first.item,
      warning: `"${raw}" dicocokkan dengan sub-kompetensi "${first.item.name}". Pastikan benar.`,
    };
  }
  const hint = ranked.length ? ` Mungkin maksudnya: ${ranked.slice(0, 2).map((r) => `"${r.item.name}"`).join(" atau ")}.` : "";
  return { status: "not_found", message: `Sub-kompetensi "${raw}" tidak dikenali untuk mapel ini.${hint}` };
}
