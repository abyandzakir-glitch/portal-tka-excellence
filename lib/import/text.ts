/**
 * Text helpers for matching messy spreadsheet input against known values
 * (column headers, student names, competency names). Pure functions.
 */

/** Lowercase, strip diacritics and punctuation, collapse whitespace. "Nama  Siswa." -> "nama siswa" */
export function normalizeText(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Same as normalizeText but without spaces: "N I S" / "n.i.s" -> "nis". */
export function compactText(value: unknown): string {
  return normalizeText(value).replace(/ /g, "");
}

/** Levenshtein edit distance (iterative, two rows). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/**
 * Similarity 0..1 between two strings after normalisation. Takes the best of
 * character-level (edit distance) and word-level (token overlap) similarity,
 * so both typos ("Mtematika") and reordered words ("Siti Aminah" vs
 * "Aminah Siti") score high.
 */
export function similarity(a: unknown, b: unknown): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const charSim = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  const tx = new Set(x.split(" "));
  const ty = new Set(y.split(" "));
  let shared = 0;
  for (const t of tx) if (ty.has(t)) shared++;
  const tokenSim = (2 * shared) / (tx.size + ty.size);
  return Math.max(charSim, tokenSim);
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/** Candidates sorted by similarity to `query` (highest first), above `min`. */
export function rankBySimilarity<T>(query: unknown, items: readonly T[], label: (item: T) => unknown, min = 0): Ranked<T>[] {
  return items
    .map((item) => ({ item, score: similarity(query, label(item)) }))
    .filter((r) => r.score >= min)
    .sort((p, q) => q.score - p.score);
}
