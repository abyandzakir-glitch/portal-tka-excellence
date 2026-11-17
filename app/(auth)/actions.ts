"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
}

const loginSchema = z.object({
  email: z.email("Format email belum benar."),
  password: z.string().min(1, "Kata sandi wajib diisi."),
  next: z.string().optional(),
});

/** Only allow same-origin relative redirects ("/x", never "//evil.com"). */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data belum lengkap." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
  });
  if (error) {
    // Network/service failures are not wrong passwords: tell the user to retry instead.
    if (!error.status || error.status >= 500) {
      console.error("[auth] sign-in unavailable:", error.status ?? "-", error.code ?? error.name);
      return { error: "Layanan login sedang tidak dapat dihubungi. Periksa koneksi internet lalu coba lagi beberapa saat lagi." };
    }
    return { error: "Email atau kata sandi salah. Silakan coba lagi atau hubungi Super Admin yayasan." };
  }

  redirect(safeNext(parsed.data.next));
}

const passwordSchema = z
  .object({
    password: z.string().min(10, "Kata sandi minimal 10 karakter."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Konfirmasi kata sandi tidak sama.", path: ["confirm"] });

/** Used after accepting an invitation or a password-reset link. */
export async function setPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data belum lengkap." };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Tautan undangan sudah kedaluwarsa. Minta undangan baru ke Super Admin." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Kata sandi belum bisa disimpan. Coba kata sandi lain." };

  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
