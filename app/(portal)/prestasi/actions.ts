"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { achievementParticipants, achievements, schools } from "@/lib/db/schema";
import { CATEGORIES, LEVELS, RANKS } from "@/lib/achievements/labels";
import { dedupKey, fieldFromNotes } from "@/lib/import/achievements/validate";

export interface AchievementFormState {
  error?: string;
}

const WRITERS = ["super_admin", "school_admin"] as const;
const optional = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s.optional());

const schema = z.object({
  id: optional(z.uuid()),
  sekolah: z.uuid("Pilih sekolah."),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Isi tanggal prestasi."),
  lomba: z.string().trim().min(3, "Isi nama lomba (minimal 3 karakter).").max(300),
  kategori: optional(z.enum(CATEGORIES)),
  tingkat: optional(z.enum(LEVELS)),
  peringkat: optional(z.enum(RANKS)),
  penyelenggara: optional(z.string().trim().max(300)),
  bukti: optional(z.url({ protocol: /^https?$/, message: "Link bukti harus alamat web (http/https)." })),
  catatan: optional(z.string().trim().max(2000)),
  peserta: z.string(),
});

const participantsSchema = z
  .array(z.object({ studentId: z.uuid().nullable(), rawName: z.string().trim().min(2).max(200) }))
  .max(50, "Maksimal 50 peserta.");

/** Create or correct one achievement (CLAUDE.md §9.4). RLS limits writes to the user's own school. */
export async function saveAchievement(_prev: AchievementFormState, formData: FormData): Promise<AchievementFormState> {
  const user = await requireUser(WRITERS);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const d = parsed.data;
  const people = participantsSchema.safeParse(JSON.parse(d.peserta || "[]"));
  if (!people.success) return { error: "Daftar peserta tidak valid." };
  if (user.schoolId && d.sekolah !== user.schoolId) return { error: "Anda hanya dapat mengisi prestasi sekolah Anda sendiri." };

  let id = d.id ?? null;
  try {
    await queryAsUser(async (tx) => {
      const [school] = await tx.select({ id: schools.id }).from(schools).where(eq(schools.id, d.sekolah)).limit(1);
      if (!school) throw new FormError("Sekolah tidak ditemukan.");

      // Same student(s) + competition + date already stored -> refuse a duplicate.
      const key = dedupKey({ schoolId: d.sekolah, achievedOn: d.tanggal, competitionName: d.lomba, field: fieldFromNotes(d.catatan ?? null), names: people.data.map((p) => p.rawName) });
      const sameDay = await tx
        .select({ id: achievements.id, notes: achievements.notes, competitionName: achievements.competitionName })
        .from(achievements)
        .where(and(eq(achievements.schoolId, d.sekolah), eq(achievements.achievedOn, d.tanggal), id ? ne(achievements.id, id) : undefined));
      for (const other of sameDay) {
        const names = await tx.select({ n: achievementParticipants.rawName }).from(achievementParticipants).where(eq(achievementParticipants.achievementId, other.id));
        if (dedupKey({ schoolId: d.sekolah, achievedOn: d.tanggal, competitionName: other.competitionName, field: fieldFromNotes(other.notes), names: names.map((x) => x.n) }) === key) {
          throw new FormError("Prestasi yang sama (siswa, lomba, dan tanggal) sudah tersimpan.");
        }
      }

      const values = {
        schoolId: d.sekolah,
        achievedOn: d.tanggal,
        competitionName: d.lomba,
        category: d.kategori ?? null,
        level: d.tingkat ?? null,
        rank: d.peringkat ?? null,
        organizer: d.penyelenggara ?? null,
        evidenceUrl: d.bukti ?? null,
        notes: d.catatan ?? null,
      };
      if (id) {
        const updated = await tx.update(achievements).set(values).where(eq(achievements.id, id)).returning({ id: achievements.id });
        if (!updated.length) throw new FormError("Prestasi tidak ditemukan atau Anda tidak punya akses.");
        await tx.delete(achievementParticipants).where(eq(achievementParticipants.achievementId, id));
      } else {
        const [row] = await tx.insert(achievements).values({ ...values, createdBy: user.id }).returning({ id: achievements.id });
        id = row!.id;
      }
      if (people.data.length) {
        await tx.insert(achievementParticipants).values(people.data.map((p) => ({ achievementId: id!, schoolId: d.sekolah, studentId: p.studentId, rawName: p.rawName })));
      }
    });
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    console.error("[prestasi] save failed:", e instanceof Error ? (e.cause ?? e.message) : e);
    return { error: "Prestasi belum bisa disimpan. Pastikan sekolahnya benar, lalu coba lagi." };
  }
  // Show the saved record: the list filtered to its date.
  redirect(`/prestasi/daftar?periode=rentang&dari=${d.tanggal}&sampai=${d.tanggal}`);
}

export async function deleteAchievement(_prev: AchievementFormState, formData: FormData): Promise<AchievementFormState> {
  await requireUser(WRITERS);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Data tidak valid." };
  const deleted = await queryAsUser((tx) => tx.delete(achievements).where(eq(achievements.id, id.data)).returning({ id: achievements.id }));
  if (!deleted.length) return { error: "Prestasi tidak ditemukan atau Anda tidak punya akses." };
  redirect("/prestasi/daftar");
}

class FormError extends Error {}
