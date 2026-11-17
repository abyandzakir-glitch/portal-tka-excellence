"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { profiles } from "@/lib/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * User management (Fase 5, DECISIONS.md "akun lewat undangan email").
 * Super Admin only. Auth accounts are managed with the admin API (secret key);
 * the profile row (role + school) is written through RLS as the Super Admin,
 * so the change is audited like any other.
 */

export interface UserState {
  error?: string;
  message?: string;
}

/** Roles that can be assigned now; the teacher role is deferred (DECISIONS.md). */
const ASSIGNABLE = ["super_admin", "viewer", "school_admin"] as const;

const BAN_FOREVER = "876000h"; // ~100 years; Supabase has no "permanent" value

const roleSchema = z
  .object({
    peran: z.enum(ASSIGNABLE, { error: "Pilih peran." }),
    sekolah: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
  })
  .refine((d) => (d.peran === "school_admin") === (d.sekolah !== null), {
    error: "Admin Sekolah wajib dipilihkan sekolahnya; peran lain tidak terikat sekolah.",
  });

const inviteSchema = z.object({
  email: z.email("Alamat email tidak valid.").trim().toLowerCase(),
  nama: z.string().trim().min(2, "Nama minimal 2 karakter.").max(200),
});

async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : undefined;
}

function friendlyAuthError(message: string): string {
  if (/already been registered|already exists|email_exists/i.test(message)) return "Email ini sudah terdaftar sebagai pengguna.";
  if (/rate limit/i.test(message)) return "Batas pengiriman email tercapai. Coba lagi dalam satu jam, atau pasang SMTP sendiri (lihat README).";
  console.error("[pengguna] auth:", message);
  return "Layanan akun belum bisa dihubungi. Coba lagi.";
}

export async function inviteUser(_prev: UserState, fd: FormData): Promise<UserState> {
  await requireUser(["super_admin"]);
  const base = inviteSchema.safeParse(Object.fromEntries(fd));
  if (!base.success) return { error: base.error.issues[0]?.message ?? "Isian belum lengkap." };
  const role = roleSchema.safeParse(Object.fromEntries(fd));
  if (!role.success) return { error: role.error.issues[0]?.message ?? "Peran tidak valid." };

  const admin = createSupabaseAdminClient();
  const origin = await siteUrl();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(base.data.email, {
    data: { full_name: base.data.nama },
    redirectTo: origin ? `${origin}/auth/set-password` : undefined,
  });
  if (error || !data.user) return { error: friendlyAuthError(error?.message ?? "") };

  try {
    await queryAsUser((tx) =>
      tx.insert(profiles).values({
        id: data.user.id,
        email: base.data.email,
        fullName: base.data.nama,
        role: role.data.peran,
        schoolId: role.data.sekolah,
      }),
    );
  } catch (e) {
    // Keep auth and profiles consistent: an account without a profile cannot use the portal anyway.
    await admin.auth.admin.deleteUser(data.user.id);
    console.error("[pengguna] profile:", e instanceof Error ? (e.cause ?? e.message) : e);
    return { error: "Profil pengguna belum bisa disimpan, undangan dibatalkan. Coba lagi." };
  }
  refresh();
  return { message: `Undangan terkirim ke ${base.data.email}. Tautan di email berlaku 24 jam.` };
}

export async function updateUser(_prev: UserState, fd: FormData): Promise<UserState> {
  const me = await requireUser(["super_admin"]);
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Data tidak valid." };
  const role = roleSchema.safeParse(Object.fromEntries(fd));
  if (!role.success) return { error: role.error.issues[0]?.message ?? "Peran tidak valid." };
  if (id.data === me.id && role.data.peran !== "super_admin") {
    return { error: "Anda tidak bisa menurunkan peran akun sendiri. Minta Super Admin lain melakukannya." };
  }
  const nama = z.string().trim().min(2).max(200).safeParse(fd.get("nama"));
  if (!nama.success) return { error: "Nama minimal 2 karakter." };

  const rows = await queryAsUser((tx) =>
    tx
      .update(profiles)
      .set({ fullName: nama.data, role: role.data.peran, schoolId: role.data.sekolah, updatedAt: new Date() })
      .where(eq(profiles.id, id.data))
      .returning({ id: profiles.id }),
  );
  if (!rows.length) return { error: "Pengguna tidak ditemukan." };
  refresh();
  return { message: "Perubahan tersimpan. Berlaku saat pengguna membuka halaman berikutnya." };
}

export async function setUserActive(_prev: UserState, fd: FormData): Promise<UserState> {
  const me = await requireUser(["super_admin"]);
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Data tidak valid." };
  const active = fd.get("aktif") === "1";
  if (id.data === me.id && !active) return { error: "Anda tidak bisa menonaktifkan akun sendiri." };

  const rows = await queryAsUser((tx) =>
    tx.update(profiles).set({ isActive: active, updatedAt: new Date() }).where(eq(profiles.id, id.data)).returning({ id: profiles.id }),
  );
  if (!rows.length) return { error: "Pengguna tidak ditemukan." };
  // Also block sign-in at the auth layer so existing sessions cannot be refreshed.
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(id.data, { ban_duration: active ? "none" : BAN_FOREVER });
  if (error) console.error("[pengguna] ban:", error.message);
  refresh();
  return {
    message: active ? "Akun diaktifkan kembali." : "Akun dinonaktifkan. Pengguna tidak bisa masuk lagi; riwayat unggahannya tetap tersimpan.",
  };
}

/** Pending invitation → resend invite; active account → send a password-reset link. */
export async function resendAccess(_prev: UserState, fd: FormData): Promise<UserState> {
  await requireUser(["super_admin"]);
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Data tidak valid." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(id.data);
  if (error || !data.user?.email) return { error: "Akun tidak ditemukan." };
  const origin = await siteUrl();
  if (!data.user.last_sign_in_at) {
    const r = await admin.auth.admin.inviteUserByEmail(data.user.email, { redirectTo: origin ? `${origin}/auth/set-password` : undefined });
    if (r.error) return { error: friendlyAuthError(r.error.message) };
    return { message: `Undangan dikirim ulang ke ${data.user.email}.` };
  }
  const r = await admin.auth.resetPasswordForEmail(data.user.email, { redirectTo: origin ? `${origin}/auth/set-password` : undefined });
  if (r.error) return { error: friendlyAuthError(r.error.message) };
  return { message: `Tautan atur ulang kata sandi dikirim ke ${data.user.email}.` };
}
