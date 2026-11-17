/**
 * Series colours for TKA charts. Schools use their brand visuals (colour +
 * dash + marker, lib/brand/schools.ts). Classes use a separate categorical
 * palette, validated with the dataviz palette validator (light mode: lightness
 * band, chroma floor, CVD ΔE ≥ 11.9, normal-vision ΔE ≥ 25.8, contrast ≥ 3:1).
 * Colours follow the entity (sorted class name), never its rank in a filter.
 */
import { isSchoolCode, SCHOOL_VISUALS } from "@/lib/brand/schools";

export interface SeriesStyle {
  color: string;
  dash: string;
  marker: "circle" | "square" | "triangle" | "diamond" | "cross";
}

const CLASS_PALETTE = ["#1E5FA8", "#C2410C", "#008C76", "#7A3E9D"] as const;
const CLASS_MARKERS: SeriesStyle["marker"][] = ["circle", "square", "triangle", "diamond"];
const CLASS_DASH = ["", "6 3", "2 3", "8 3 2 3"];
/** Beyond four classes: neutral gray, still identified by legend, marker and table. */
const OVERFLOW = "#6B6B6E";

export function schoolStyle(code: string): SeriesStyle {
  if (isSchoolCode(code)) {
    const v = SCHOOL_VISUALS[code];
    return { color: v.color, dash: v.dash, marker: v.marker };
  }
  return { color: OVERFLOW, dash: "", marker: "circle" };
}

/** Stable style for the i-th class of a school (classes sorted by name). */
export function classStyle(index: number): SeriesStyle {
  return {
    color: CLASS_PALETTE[index] ?? OVERFLOW,
    dash: CLASS_DASH[index % CLASS_DASH.length]!,
    marker: CLASS_MARKERS[index % CLASS_MARKERS.length]!,
  };
}

/** Single-series charts (one student): brand blue. */
export const SINGLE_SERIES = "#0E4E96";
