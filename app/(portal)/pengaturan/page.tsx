import type { Metadata } from "next";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { schools, settings, subjects } from "@/lib/db/schema";
import { DEFAULT_AI_EXTRACTION_ENABLED, SETTING_KEYS } from "@/lib/settings/defaults";
import { loadTkaSettings } from "@/lib/settings/tka";
import { loadAchievementSettings } from "@/lib/achievements/load";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Pengaturan" };

export default function PengaturanPage() {
  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Ambang status penguasaan, bobot perhitungan, target nilai TO, aturan siswa berisiko, Poin Prestasi, dan saklar fitur AI. Perubahan langsung berlaku di semua dashboard dan tercatat di audit log."
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireUser(["super_admin"]);
  const { tka, subjectRows, schoolRows, targetRows, ai, achievement } = await queryAsUser(async (tx) => ({
    tka: await loadTkaSettings(tx),
    achievement: await loadAchievementSettings(tx),
    subjectRows: await tx.select().from(subjects).orderBy(asc(subjects.level), asc(subjects.sortOrder)),
    schoolRows: await tx.select().from(schools).orderBy(asc(schools.level), asc(schools.schoolCode)),
    targetRows: await tx.select().from(settings).where(eq(settings.key, SETTING_KEYS.tryoutTarget)),
    ai: (await tx.select().from(settings).where(eq(settings.key, SETTING_KEYS.aiExtraction)))[0]?.valueJson,
  }));
  const overrides: Record<string, number> = {};
  for (const r of targetRows) if (r.schoolId && r.subjectId && typeof r.valueJson === "number") overrides[`${r.subjectId}:${r.schoolId}`] = r.valueJson;

  return (
    <SettingsForm
      values={{
        thresholds: tka.mastery.thresholds,
        weights: tka.mastery.weights,
        minItems: tka.mastery.minItems,
        risk: tka.risk,
        ai: typeof ai === "boolean" ? ai : DEFAULT_AI_EXTRACTION_ENABLED,
        subjects: subjectRows.map((s) => ({ id: s.id, label: `${s.name} ${s.level.toUpperCase()}`, target: tka.targetFor(s.id, null) })),
        schools: schoolRows.map((s) => ({ id: s.id, name: s.name, level: s.level })),
        overrides,
        subjectLevels: Object.fromEntries(subjectRows.map((s) => [s.id, s.level])),
        points: achievement.weights as unknown as { level: Record<string, number>; rank: Record<string, number> },
        academicGroup: achievement.academicGroup,
      }}
    />
  );
}
