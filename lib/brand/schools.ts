/**
 * Static brand facts about the five schools (CLAUDE.md §2, §5).
 * The database `schools` table is the source of truth for names; this file
 * only provides visual identity (colour + dash pattern + marker) so charts stay
 * readable without relying on colour alone (§5.2).
 */
export type SchoolLevel = "sd" | "smp";

export type SchoolCode = "SDTJBDG" | "SDTJCMH" | "SDTJPKU" | "SMPTJBDG" | "SMPTJPKU";

export interface SchoolVisual {
  code: SchoolCode;
  level: SchoolLevel;
  defaultName: string;
  city: string;
  color: string;
  /** SVG stroke-dasharray for line charts ("" = solid). */
  dash: string;
  marker: "circle" | "square" | "triangle" | "diamond" | "cross";
  logo: string;
}

export const SCHOOL_VISUALS: Record<SchoolCode, SchoolVisual> = {
  SDTJBDG: {
    code: "SDTJBDG",
    level: "sd",
    defaultName: "SD Talenta Juara Bandung",
    city: "Kota Bandung",
    color: "#ED1C24",
    dash: "",
    marker: "circle",
    logo: "/brand/web/logo-sd-full.png",
  },
  SDTJCMH: {
    code: "SDTJCMH",
    level: "sd",
    defaultName: "SD Talenta Juara Cimahi",
    city: "Kota Cimahi",
    color: "#9E1F26",
    dash: "6 3",
    marker: "square",
    logo: "/brand/web/logo-sd-full.png",
  },
  SDTJPKU: {
    code: "SDTJPKU",
    level: "sd",
    defaultName: "SD Talenta Juara Pekanbaru",
    city: "Kota Pekanbaru",
    color: "#F2777B",
    dash: "2 3",
    marker: "triangle",
    logo: "/brand/web/logo-sd-full.png",
  },
  SMPTJBDG: {
    code: "SMPTJBDG",
    level: "smp",
    defaultName: "SMP Talenta Juara Bandung",
    city: "Kota Bandung",
    color: "#0E4E96",
    dash: "",
    marker: "diamond",
    logo: "/brand/web/logo-smp-full.png",
  },
  SMPTJPKU: {
    code: "SMPTJPKU",
    level: "smp",
    defaultName: "SMP Talenta Juara Pekanbaru",
    city: "Kota Pekanbaru",
    color: "#5B8FD1",
    dash: "6 3",
    marker: "cross",
    logo: "/brand/web/logo-smp-full.png",
  },
};

export const SCHOOL_CODES = Object.keys(SCHOOL_VISUALS) as SchoolCode[];

export function isSchoolCode(value: string): value is SchoolCode {
  return value in SCHOOL_VISUALS;
}

export const LEVEL_LABEL: Record<SchoolLevel, string> = { sd: "SD", smp: "SMP" };

export const TAGLINE = "Developing Capable Muslim Leaders";
