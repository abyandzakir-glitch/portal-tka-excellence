"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { schools, settings, subjects } from "@/lib/db/schema";
import { CATEGORIES, LEVELS, RANKS } from "@/lib/achievements/labels";
import { SETTING_KEYS } from "@/lib/settings/defaults";
import { minItemsSchema, riskSchema, targetSchema, thresholdsSchema, weightsSchema } from "@/lib/settings/tka";

export interface SettingsState {
  error?: string;
  message?: string;
}

const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim().replace(",", ".");
  return v === "" ? NaN : Number(v);
};

/** Saves the TKA settings (CLAUDE.md §7.3). Super Admin only — also enforced by RLS. */
export async function saveSettings(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const user = await requireUser(["super_admin"]);

  const thresholds = thresholdsSchema.safeParse({ berkembang: num(fd, "berkembang") / 100, cakap: num(fd, "cakap") / 100, mahir: num(fd, "mahir") / 100 });
  if (!thresholds.success) return { error: thresholds.error.issues[0]?.message.includes("naik") ? "Ambang harus naik: Berkembang < Cakap < Mahir, semuanya 0–100%." : "Ambang status harus berupa persen 0–100." };
  const toShare = num(fd, "bobotTo");
  const weights = weightsSchema.safeParse({
    tryout: toShare / 100,
    practice: (100 - toShare) / 100,
    recentWeeks: num(fd, "pekanTerkini"),
    recentMultiplier: num(fd, "pengaliTerkini"),
  });
  if (!weights.success) return { error: "Bobot tidak valid: bobot TO 0–100%, pekan terkini 1–26, pengali 1–10." };
  const minItems = minItemsSchema.safeParse(num(fd, "minButir"));
  if (!minItems.success) return { error: "Minimal butir harus bilangan bulat 1–100." };
  const risk = riskSchema.safeParse({ consecutiveBelowTarget: num(fd, "toBerturut"), maxDropPoints: num(fd, "turunMaks") });
  if (!risk.success) return { error: "Aturan siswa berisiko tidak valid: jumlah TO 1–10, penurunan 0–100 poin." };

  // Achievement points (§8.2): weight per level × weight per rank. NONE = unknown level / no standard rank.
  const pointWeights = { level: {} as Record<string, number>, rank: {} as Record<string, number> };
  for (const l of [...LEVELS, "NONE"]) pointWeights.level[l] = num(fd, `poinTingkat:${l}`);
  for (const r of [...RANKS, "NONE"]) pointWeights.rank[r] = num(fd, `poinPeringkat:${r}`);
  if ([...Object.values(pointWeights.level), ...Object.values(pointWeights.rank)].some((v) => !Number.isFinite(v) || v < 0 || v > 100)) {
    return { error: "Bobot Poin Prestasi harus angka 0–100." };
  }
  const academicGroup = fd.getAll("akademik").map(String).filter((v): v is (typeof CATEGORIES)[number] => (CATEGORIES as readonly string[]).includes(v));
  if (academicGroup.length === 0) return { error: "Pilih minimal satu kategori yang dihitung sebagai Akademik." };

  try {
    await queryAsUser(async (tx) => {
      const subjectRows = await tx.select({ id: subjects.id }).from(subjects);
      const schoolRows = await tx.select({ id: schools.id }).from(schools);

      const upsert = async (key: string, value: unknown, subjectId: string | null = null, schoolId: string | null = null) =>
        tx
          .insert(settings)
          .values({ key, valueJson: value, subjectId, schoolId, updatedBy: user.id })
          .onConflictDoUpdate({ target: [settings.key, settings.schoolId, settings.subjectId], set: { valueJson: value, updatedBy: user.id, updatedAt: new Date() } });

      await upsert(SETTING_KEYS.masteryThresholds, thresholds.data);
      await upsert(SETTING_KEYS.masteryWeights, weights.data);
      await upsert(SETTING_KEYS.masteryMinItems, minItems.data);
      await upsert(SETTING_KEYS.riskRules, risk.data);
      await upsert(SETTING_KEYS.aiExtraction, fd.get("ai") === "on");
      await upsert(SETTING_KEYS.achievementPoints, pointWeights);
      await upsert(SETTING_KEYS.achievementAcademicGroup, academicGroup);

      for (const s of subjectRows) {
        const global = targetSchema.safeParse(num(fd, `target:${s.id}`));
        if (!global.success) throw new UserError("Target nilai harus angka 0–100.");
        await upsert(SETTING_KEYS.tryoutTarget, global.data, s.id, null);
        for (const sc of schoolRows) {
          const raw = String(fd.get(`target:${s.id}:${sc.id}`) ?? "").trim();
          if (raw === "") {
            // Empty = follow the subject-wide target.
            await tx
              .delete(settings)
              .where(and(eq(settings.key, SETTING_KEYS.tryoutTarget), eq(settings.subjectId, s.id), eq(settings.schoolId, sc.id)));
            continue;
          }
          const v = targetSchema.safeParse(Number(raw.replace(",", ".")));
          if (!v.success) throw new UserError("Target per sekolah harus angka 0–100, atau kosong untuk mengikuti target mapel.");
          await upsert(SETTING_KEYS.tryoutTarget, v.data, s.id, sc.id);
        }
      }
    });
  } catch (e) {
    return { error: e instanceof UserError ? e.message : "Pengaturan belum bisa disimpan. Coba lagi." };
  }
  refresh();
  return { message: "Pengaturan tersimpan. Dashboard memakai nilai baru mulai sekarang." };
}

class UserError extends Error {}
