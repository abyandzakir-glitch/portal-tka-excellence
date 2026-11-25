"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { ImportError } from "@/lib/import/db/config";
import { mergeTryouts, setTryoutSchools } from "@/lib/tka/tryouts";

export interface TryoutActionState {
  error?: string;
  message?: string;
}

async function run(fn: () => Promise<string>): Promise<TryoutActionState> {
  try {
    const message = await fn();
    refresh();
    return { message };
  } catch (e) {
    if (e instanceof ImportError) return { error: e.message };
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
    if (/row-level security|permission denied/i.test(cause)) return { error: "Anda tidak punya akses untuk mengubah try out ini." };
    console.error("[try-out]", e instanceof Error ? (e.cause ?? e.message) : e);
    return { error: "Perubahan belum bisa disimpan. Coba lagi." };
  }
}

const ids = z.array(z.uuid()).min(2).max(20);

/** Merges duplicate TOs into one network TO (Super Admin). */
export async function mergeTryoutGroup(tryoutIds: string[]): Promise<TryoutActionState> {
  await requireUser(["super_admin"]);
  const p = ids.safeParse(tryoutIds);
  if (!p.success) return { error: "Pilihan try out tidak valid." };
  return run(async () => {
    const r = await queryAsUser((tx) => mergeTryouts(tx, p.data));
    return `${r.removed + 1} try out digabung menjadi satu TO jaringan (${r.movedScores} nilai siswa dipindahkan).`;
  });
}

const schoolsSchema = z.object({ tryoutId: z.uuid(), schoolIds: z.array(z.uuid()).max(20) });

/** Sets which schools sit a TO (Super Admin). */
export async function saveTryoutSchools(_prev: TryoutActionState, fd: FormData): Promise<TryoutActionState> {
  await requireUser(["super_admin"]);
  const p = schoolsSchema.safeParse({ tryoutId: fd.get("tryoutId"), schoolIds: fd.getAll("sekolah") });
  if (!p.success) return { error: "Isian belum lengkap." };
  return run(async () => {
    await queryAsUser((tx) => setTryoutSchools(tx, p.data.tryoutId, p.data.schoolIds));
    return "Sekolah peserta tersimpan.";
  });
}
