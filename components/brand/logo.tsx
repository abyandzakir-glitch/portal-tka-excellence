import Image from "next/image";
import { cn } from "@/lib/utils";
import { BRANCH_LOGO_RATIO, SCHOOL_VISUALS, branchLogoPath, type SchoolCode } from "@/lib/brand/schools";

/**
 * Brand PNGs trimmed of transparent padding by scripts/trim-logos.ps1
 * (crop + uniform scale only). Full logos are 657x240, symbols 240x240.
 */
const FULL_RATIO = 657 / 240;

/**
 * Master logo (symbol + logotype, never separated — CLAUDE.md §5.1).
 * The wrapper padding provides the mandatory clear space of 1/3 of the symbol
 * height on all four sides. Never add borders, shadows, rotation or recolouring.
 */
export function MasterLogo({
  className,
  negative = false,
  height = 40,
  priority = false,
}: {
  className?: string;
  negative?: boolean;
  height?: number;
  priority?: boolean;
}) {
  const src = negative ? "/brand/web/logo-master-negative-white.png" : "/brand/web/logo-master-full.png";
  return (
    <span className={cn("inline-flex shrink-0", className)} style={{ padding: Math.ceil(height / 3) }}>
      <Image
        src={src}
        alt="Sekolah Talenta Juara"
        width={Math.round(height * FULL_RATIO)}
        height={height}
        priority={priority}
        unoptimized
      />
    </span>
  );
}

/** Master symbol only — for tight spots (collapsed sidebar, favicon). */
export function MasterSymbol({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/web/logo-master-symbol.png"
      alt="Sekolah Talenta Juara"
      width={size}
      height={size}
      className={className}
      unoptimized
    />
  );
}

/**
 * Full branch logo (symbol + logotype incl. city) — the logo already names the
 * school, so no separate text. Use at >= 40px height; the 4-line logotype is
 * illegible smaller, where SchoolBadge fits instead. The symbol spans the full
 * height, so the wrapper padding of height/3 is the mandatory clear space (§5.1).
 */
export function SchoolLogo({
  code,
  name,
  height = 48,
  negative = false,
  className,
}: {
  code: SchoolCode;
  name?: string;
  height?: number;
  negative?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0", className)} style={{ padding: Math.ceil(height / 3) }}>
      <Image
        src={branchLogoPath(code, negative)}
        alt={name ?? SCHOOL_VISUALS[code].defaultName}
        width={Math.round(height * BRANCH_LOGO_RATIO)}
        height={height}
        unoptimized
      />
    </span>
  );
}

/** School identity badge: level symbol (SD red / SMP dark blue) + school name as separate text (§5.1). */
export function SchoolBadge({ code, name, size = 20 }: { code: SchoolCode; name?: string; size?: number }) {
  const visual = SCHOOL_VISUALS[code];
  const symbol = visual.level === "sd" ? "/brand/web/logo-sd-symbol.png" : "/brand/web/logo-smp-symbol.png";
  return (
    <span className="inline-flex items-center gap-2">
      <Image src={symbol} alt="" aria-hidden="true" width={size} height={size} unoptimized />
      <span className="text-sm font-medium text-brand-gray">{name ?? visual.defaultName}</span>
    </span>
  );
}
