import { cn } from "@/lib/utils";

type Tone = "blue" | "red" | "sky";

const TONES: Record<Tone, { base: string; shade: string }> = {
  blue: { base: "var(--brand-blue)", shade: "var(--brand-blue-deeper)" },
  red: { base: "var(--brand-red)", shade: "var(--brand-red-dark)" },
  sky: { base: "var(--brand-sky)", shade: "var(--brand-sky-dark)" },
};

/**
 * Brand signature motif: a solid colour field cut by darker diagonal triangles
 * (as on the letterhead and banners, CLAUDE.md §5.4). Purely decorative.
 */
export function DiagonalMotif({
  tone = "blue",
  className,
  variant = "strip",
}: {
  tone?: Tone;
  className?: string;
  /** strip: thin band under the header; hero: large panel; corner: KPI card accent. */
  variant?: "strip" | "hero" | "corner";
}) {
  const { base, shade } = TONES[tone];

  if (variant === "corner") {
    return (
      <svg aria-hidden="true" viewBox="0 0 40 40" className={cn("pointer-events-none", className)}>
        <polygon points="40,0 40,40 0,0" fill={base} />
        <polygon points="40,0 40,22 18,0" fill={shade} />
      </svg>
    );
  }

  if (variant === "hero") {
    return (
      <svg aria-hidden="true" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" className={cn("pointer-events-none", className)}>
        <rect width="600" height="800" fill={base} />
        <polygon points="600,0 600,520 220,0" fill={shade} />
        <polygon points="0,800 0,520 300,800" fill={shade} />
        <polygon points="600,800 600,650 450,800" fill="var(--brand-sky)" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 1200 6" preserveAspectRatio="none" className={cn("pointer-events-none block h-1.5 w-full", className)}>
      <rect width="1200" height="6" fill={base} />
      <polygon points="780,0 1200,0 1200,6 800,6" fill={shade} />
      <polygon points="1060,0 1200,0 1200,6 1080,6" fill="var(--brand-sky)" />
    </svg>
  );
}
