import { cn } from "@/lib/utils";

type Tone = "blue" | "red" | "sky";

/** base = solid field, shade = darker diagonal cut, tip = small accent at the end of the strip. */
const TONES: Record<Tone, { base: string; shade: string; tip: string }> = {
  blue: { base: "var(--brand-blue)", shade: "var(--brand-blue-deeper)", tip: "var(--brand-sky)" },
  red: { base: "var(--brand-red)", shade: "var(--brand-red-dark)", tip: "var(--brand-sky)" },
  // Institutional (Master Logo) colour — the portal-wide default.
  sky: { base: "var(--brand-sky)", shade: "var(--brand-sky-deep)", tip: "var(--brand-sky-deeper)" },
};

/**
 * Brand signature motif: a solid colour field cut by darker diagonal triangles
 * (as on the letterhead and banners, CLAUDE.md §5.4). Purely decorative.
 */
export function DiagonalMotif({
  tone = "sky",
  className,
  variant = "strip",
}: {
  tone?: Tone;
  className?: string;
  /** strip: thin band under the header; hero: large panel; corner: KPI card accent. */
  variant?: "strip" | "hero" | "corner";
}) {
  const { base, shade, tip } = TONES[tone];

  if (variant === "corner") {
    return (
      <svg aria-hidden="true" viewBox="0 0 40 40" className={cn("pointer-events-none", className)}>
        <polygon points="40,0 40,40 0,0" fill={base} />
        <polygon points="40,0 40,22 18,0" fill={shade} />
      </svg>
    );
  }

  if (variant === "hero") {
    // The hero carries white text (tagline + description), so its field is the
    // deep sky (#0079A8, 4.9:1 with white); bright sky (#00A7E1, only 2.8:1)
    // appears as triangles kept clear of the logo and text. Same layout for
    // every tone, with that tone's colours.
    const field = tone === "sky" ? "var(--brand-sky-deep)" : base;
    const light = tone === "sky" ? "var(--brand-sky)" : shade;
    const dark = tone === "sky" ? "var(--brand-sky-deeper)" : shade;
    return (
      <svg aria-hidden="true" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" className={cn("pointer-events-none", className)}>
        <rect width="600" height="800" fill={field} />
        <polygon points="600,0 600,500 280,0" fill={light} />
        <polygon points="0,800 0,520 300,800" fill={dark} />
        <polygon points="600,800 600,650 450,800" fill={light} />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 1200 6" preserveAspectRatio="none" className={cn("pointer-events-none block h-1.5 w-full", className)}>
      <rect width="1200" height="6" fill={base} />
      <polygon points="780,0 1200,0 1200,6 800,6" fill={shade} />
      <polygon points="1060,0 1200,0 1200,6 1080,6" fill={tip} />
    </svg>
  );
}
