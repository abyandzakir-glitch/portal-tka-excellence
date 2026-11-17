import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Shared PDF branding (CLAUDE.md §5): Cabin for headings and big numbers,
 * Albert Sans for body text. Static TTF instances from Google Fonts, SIL Open
 * Font License 1.1 (licence texts next to the files in lib/pdf/fonts/).
 * The files are bundled with the server functions via
 * `outputFileTracingIncludes` in next.config.ts.
 */
const FONT_DIR = path.join(process.cwd(), "lib", "pdf", "fonts");

let registered = false;
export function registerPdfFonts() {
  if (registered) return;
  Font.register({
    family: "Cabin",
    fonts: [
      { src: path.join(FONT_DIR, "Cabin-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "Cabin-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Albert Sans",
    fonts: [
      { src: path.join(FONT_DIR, "AlbertSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "AlbertSans-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "AlbertSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Keep words whole (react-pdf hyphenates English-style by default, wrong for Indonesian).
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

export const PDF_COLORS = {
  text: "#4D4D4F",
  muted: "#6B6B6E",
  border: "#E6E6E8",
  blue: "#0E4E96",
  blueDark: "#1E3F7C",
  red: "#ED1C24",
  sky: "#00A7E1",
  tint: "#F3F7FC",
} as const;

export const PDF_FONTS = {
  body: { fontFamily: "Albert Sans", fontWeight: 400 },
  bodyBold: { fontFamily: "Albert Sans", fontWeight: 600 },
  heading: { fontFamily: "Cabin", fontWeight: 700 },
  headingSemi: { fontFamily: "Cabin", fontWeight: 600 },
} as const;

/** Logo Master (PNG). Null when the file is missing; callers then show text only. */
export async function loadMasterLogo(): Promise<Buffer | null> {
  return readFile(path.join(process.cwd(), "public", "brand", "web", "logo-master-full.png")).catch(() => null);
}
