"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { interventions, students } from "@/lib/db/schema";

export interface InterventionState {
  error?: string;
  message?: string;
}

const MANAGERS = ["super_admin", "school_admin", "teacher"] as const;
const optionalDate = z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid.").optional());

const addSchema = z.object({
  studentId: z.uuid(),
  competencyId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  action: z.string().trim().min(3, "Tuliskan tindakan intervensinya (minimal 3 karakter).").max(500),
  notes: z.string().trim().max(2000).optional(),
  status: z.enum(["planned", "in_progress", "done"]),
  startedAt: optionalDate,
});

/** Records an intervention note (§7.2c). RLS: only managers of the student's school. */
export async function addIntervention(_prev: InterventionState, formData: FormData): Promise<InterventionState> {
  const user = await requireUser(MANAGERS);
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const d = parsed.data;
  try {
    await queryAsUser(async (tx) => {
      const [st] = await tx.select({ schoolId: students.schoolId }).from(students).where(eq(students.id, d.studentId)).limit(1);
      if (!st) throw new Error("not found");
      await tx.insert(interventions).values({
        studentId: d.studentId,
        schoolId: st.schoolId,
        competencyId: d.competencyId ?? null,
        ownerUserId: user.id,
        action: d.action,
        notes: d.notes || null,
        status: d.status,
        startedAt: d.startedAt ?? null,
      });
    });
  } catch {
    return { error: "Catatan intervensi belum bisa disimpan. Pastikan siswa ini berada di sekolah Anda." };
  }
  refresh();
  return { message: "Catatan intervensi tersimpan." };
}

const updateSchema = z.object({
  id: z.uuid(),
  status: z.enum(["planned", "in_progress", "done"]),
  outcome: z.string().trim().max(2000).optional(),
});

export async function updateIntervention(_prev: InterventionState, formData: FormData): Promise<InterventionState> {
  await requireUser(MANAGERS);
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Perubahan tidak valid." };
  const d = parsed.data;
  try {
    const updated = await queryAsUser((tx) =>
      tx
        .update(interventions)
        .set({ status: d.status, outcome: d.outcome || null, endedAt: d.status === "done" ? new Date().toISOString().slice(0, 10) : null })
        .where(eq(interventions.id, d.id))
        .returning({ id: interventions.id }),
    );
    if (!updated.length) return { error: "Anda tidak punya akses untuk mengubah catatan ini." };
  } catch {
    return { error: "Perubahan belum bisa disimpan. Coba lagi." };
  }
  refresh();
  return { message: "Status intervensi diperbarui." };
}
