/**
 * Creates (invites) a Super Admin in the project of the given env file:
 *
 *   pnpm prod:admin --email nama@yayasan.sch.id --name "Nama Lengkap"
 *
 * Sends a Supabase invitation email (the person sets their own password) and
 * writes the profile row with role super_admin. Safe to re-run: an existing
 * account is reused and its profile is updated to super_admin.
 */
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { z } from "zod";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = z.email().safeParse(arg("email")?.trim().toLowerCase());
  const name = z.string().trim().min(2).safeParse(arg("name"));
  if (!email.success || !name.success) {
    console.error('✗ Pakai: pnpm prod:admin --email alamat@yayasan --name "Nama Lengkap"');
    process.exitCode = 1;
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const db = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url || !secret || !db) {
    console.error("✗ Berkas env belum lengkap (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL_DIRECT).");
    process.exitCode = 1;
    return;
  }
  console.log(`→ Project: ${new URL(url).hostname}`);

  const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  let userId: string | undefined;
  for (let page = 1; page < 20 && !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    userId = data.users.find((u) => u.email?.toLowerCase() === email.data)?.id;
    if (data.users.length < 1000) break;
  }
  if (userId) {
    console.log("✓ Akun sudah ada; profil diperbarui menjadi Super Admin.");
  } else {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email.data, { data: { full_name: name.data } });
    if (error || !data.user) throw new Error(error?.message ?? "undangan gagal");
    userId = data.user.id;
    console.log(`✓ Undangan dikirim ke ${email.data}.`);
  }

  const sql = postgres(db, { max: 1, prepare: Boolean(process.env.DATABASE_URL_DIRECT), onnotice: () => {} });
  try {
    await sql`
      insert into public.profiles (id, full_name, email, role, school_id, is_active)
      values (${userId}, ${name.data}, ${email.data}, 'super_admin', null, true)
      on conflict (id) do update set full_name = excluded.full_name, role = 'super_admin', school_id = null, is_active = true`;
  } finally {
    await sql.end();
  }
  console.log("✓ Profil Super Admin tersimpan. Buka tautan di email untuk membuat kata sandi.");
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
