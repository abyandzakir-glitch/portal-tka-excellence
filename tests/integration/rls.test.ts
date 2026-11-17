/**
 * Row Level Security isolation test — Fase 1 acceptance criterion:
 * "admin sekolah A tidak bisa melihat data sekolah B (diuji)".
 *
 *   pnpm db:seed --reset   (once)
 *   pnpm test:rls
 *
 * Layer 1 (always): impersonates each role directly in Postgres
 *   (request.jwt.claims + role authenticated) and checks reads/writes.
 *   Every write test runs in a transaction that is rolled back.
 * Layer 2 (if SEED_DEMO_PASSWORD is set): signs in through Supabase Auth and
 *   queries via the Data API, proving the same isolation end-to-end.
 */
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const direct = process.env.DATABASE_URL_DIRECT;
const url = direct ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_DIRECT / DATABASE_URL belum diisi di .env.local");
// Named prepared statements only on a direct/session connection (not the 6543 pooler).
const sql = postgres(url, { prepare: Boolean(direct), max: 1, onnotice: () => {} });

const DEMO = "demo.talentajuara.test";
let failures = 0;
let passes = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

class Rollback extends Error {}

/** Runs fn as the given user (or anon) inside a transaction that is always rolled back. */
async function asUser<T>(userId: string | null, fn: (q: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await sql.begin(async (q) => {
      if (userId) {
        await q`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
        await q`set local role authenticated`;
      } else {
        await q`set local role anon`;
      }
      result = await fn(q);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return result;
}

/** Returns the Postgres error message, or null if the statement succeeded. */
async function attempt(q: postgres.TransactionSql, fn: () => Promise<unknown>): Promise<string | null> {
  await q`savepoint attempt`;
  try {
    await fn();
    await q`release savepoint attempt`;
    return null;
  } catch (e) {
    await q`rollback to savepoint attempt`;
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const users = await sql<{ id: string; email: string; school_id: string | null }[]>`
    select id, email, school_id from public.profiles where email like ${`%@${DEMO}`}`;
  const byEmail = (local: string) => {
    const u = users.find((x) => x.email === `${local}@${DEMO}`);
    if (!u) throw new Error(`Akun demo ${local}@${DEMO} tidak ditemukan. Jalankan pnpm db:seed --reset dulu.`);
    return u;
  };
  const superAdmin = byEmail("superadmin");
  const viewer = byEmail("manajemen");
  const adminSdBdg = byEmail("admin.sdtjbdg");
  const adminSmpPku = byEmail("admin.smptjpku");
  const teacher = byEmail("guru.sdtjbdg");

  const schools = await sql<{ id: string; school_code: string }[]>`select id, school_code from public.schools`;
  const schoolId = (code: string) => schools.find((s) => s.school_code === code)!.id;
  const SDTJBDG = schoolId("SDTJBDG");
  const SMPTJPKU = schoolId("SMPTJPKU");

  const [{ total: totalStudents }] = await sql<{ total: number }[]>`select count(*)::int as total from public.students`;
  const [{ id: foreignStudent }] = await sql<{ id: string }[]>`select id from public.students where school_id = ${SMPTJPKU} limit 1`;
  const [{ id: ownStudent }] = await sql<{ id: string }[]>`select id from public.students where school_id = ${SDTJBDG} limit 1`;

  const schoolScoped = ["students", "classes", "class_enrollments", "tryout_scores", "item_responses", "practice_logs", "achievements", "achievement_participants"];

  // ---------------------------------------------------------------------------
  console.log("\nAdmin Sekolah SDTJBDG");
  await asUser(adminSdBdg.id, async (q) => {
    for (const table of schoolScoped) {
      const rows = await q<{ school_id: string; n: number }[]>`
        select school_id, count(*)::int as n from ${q(`public.${table}`)} group by school_id`;
      const foreign = rows.filter((r) => r.school_id !== SDTJBDG);
      check(`${table}: hanya melihat data sekolahnya`, rows.length > 0 && foreign.length === 0,
        `terlihat sekolah lain: ${foreign.map((f) => f.school_id).join(", ")}`);
    }
    const [{ n: foreignVisible }] = await q<{ n: number }[]>`select count(*)::int as n from public.students where id = ${foreignStudent}`;
    check("tidak bisa membaca siswa sekolah lain berdasarkan ID", foreignVisible === 0);

    const insertErr = await attempt(q, () => q`insert into public.students (school_id, nis, full_name) values (${SMPTJPKU}, 'X-RLS-1', 'Uji RLS')`);
    check("tidak bisa menambah siswa ke sekolah lain", insertErr !== null && /row-level security/i.test(insertErr), insertErr ?? "insert berhasil");

    const ownInsertErr = await attempt(q, () => q`insert into public.students (school_id, nis, full_name) values (${SDTJBDG}, 'X-RLS-2', 'Uji RLS')`);
    check("bisa menambah siswa ke sekolahnya sendiri", ownInsertErr === null, ownInsertErr ?? "");

    const updated = await q`update public.students set full_name = 'Diubah' where id = ${foreignStudent}`;
    check("tidak bisa mengubah siswa sekolah lain (0 baris)", updated.count === 0);

    const moveErr = await attempt(q, () => q`update public.students set school_id = ${SMPTJPKU} where id = ${ownStudent}`);
    check("tidak bisa memindahkan siswanya ke sekolah lain", moveErr !== null, "update berhasil");

    const [{ n: audit }] = await q<{ n: number }[]>`select count(*)::int as n from public.audit_logs`;
    check("tidak bisa membaca audit log", audit === 0);

    const [{ n: profileCount }] = await q<{ n: number }[]>`select count(*)::int as n from public.profiles`;
    check("hanya melihat profilnya sendiri", profileCount === 1);

    const roleErr = await attempt(q, () => q`update public.profiles set role = 'super_admin' where id = ${adminSdBdg.id}`);
    const [{ role }] = await q<{ role: string }[]>`select role from public.profiles where id = ${adminSdBdg.id}`;
    check("tidak bisa menaikkan perannya sendiri", role === "school_admin", roleErr ?? "");

    const settingsUpdated = await q`update public.settings set value_json = '0' where true`;
    check("tidak bisa mengubah pengaturan", settingsUpdated.count === 0);

    const [{ n: schoolsSeen }] = await q<{ n: number }[]>`select count(*)::int as n from public.schools`;
    check("tetap bisa membaca daftar sekolah (master)", schoolsSeen === 5);

    // Master data (Fase 5).
    const [{ id: activeYear }] = await q<{ id: string }[]>`select id from public.academic_years where is_active limit 1`;
    const ownClassErr = await attempt(q, () => q`insert into public.classes (school_id, academic_year_id, name, grade) values (${SDTJBDG}, ${activeYear}, '6Z', 6)`);
    check("bisa menambah kelas di sekolahnya", ownClassErr === null, ownClassErr ?? "");
    const foreignClassErr = await attempt(q, () => q`insert into public.classes (school_id, academic_year_id, name, grade) values (${SMPTJPKU}, ${activeYear}, '9Z', 9)`);
    check("tidak bisa menambah kelas di sekolah lain", foreignClassErr !== null);
    const yearErr = await attempt(q, () => q`insert into public.academic_years (label, start_date, end_date, is_active) values ('2099/2100', '2099-07-01', '2100-06-30', false)`);
    check("tidak bisa menambah tahun ajaran", yearErr !== null);
    const compUpd = await q`update public.competencies set name = 'X' where true`;
    check("tidak bisa mengubah kompetensi", compUpd.count === 0);

    const tryoutErr = await attempt(q, () => q`update public.tryouts set name = 'X' where owner_school_id is null`);
    const [{ n: renamed }] = await q<{ n: number }[]>`select count(*)::int as n from public.tryouts where name = 'X'`;
    check("tidak bisa mengubah TO jaringan milik yayasan", renamed === 0, tryoutErr ?? "");
  });

  console.log("\nAdmin Sekolah SMPTJPKU (arah sebaliknya)");
  await asUser(adminSmpPku.id, async (q) => {
    const rows = await q<{ school_id: string }[]>`select distinct school_id from public.students`;
    check("hanya melihat siswa SMPTJPKU", rows.length === 1 && rows[0]!.school_id === SMPTJPKU);
    const [{ n }] = await q<{ n: number }[]>`select count(*)::int as n from public.achievements where school_id = ${SDTJBDG}`;
    check("tidak melihat prestasi SDTJBDG", n === 0);
  });

  console.log("\nManajemen (viewer)");
  await asUser(viewer.id, async (q) => {
    const [{ n }] = await q<{ n: number }[]>`select count(*)::int as n from public.students`;
    check("melihat siswa kelima sekolah", n === totalStudents, `${n} dari ${totalStudents}`);
    const err = await attempt(q, () => q`insert into public.students (school_id, nis, full_name) values (${SDTJBDG}, 'X-RLS-3', 'Uji RLS')`);
    check("tidak bisa menambah data", err !== null);
    const upd = await q`update public.achievements set notes = 'x' where true`;
    check("tidak bisa mengubah prestasi", upd.count === 0);
  });

  console.log("\nGuru SDTJBDG");
  await asUser(teacher.id, async (q) => {
    const rows = await q<{ school_id: string }[]>`select distinct school_id from public.students`;
    check("hanya melihat siswa sekolahnya", rows.length === 1 && rows[0]!.school_id === SDTJBDG);
    const err = await attempt(q, () => q`insert into public.students (school_id, nis, full_name) values (${SDTJBDG}, 'X-RLS-4', 'Uji RLS')`);
    check("tidak bisa menambah siswa", err !== null);
    const ok = await attempt(q, () => q`insert into public.interventions (student_id, school_id, action) values (${ownStudent}, ${SDTJBDG}, 'Remedial')`);
    check("bisa mencatat intervensi di sekolahnya", ok === null, ok ?? "");
    const bad = await attempt(q, () => q`insert into public.interventions (student_id, school_id, action) values (${foreignStudent}, ${SMPTJPKU}, 'Remedial')`);
    check("tidak bisa mencatat intervensi di sekolah lain", bad !== null);
  });

  console.log("\nSuper Admin");
  await asUser(superAdmin.id, async (q) => {
    const [{ n }] = await q<{ n: number }[]>`select count(*)::int as n from public.students`;
    check("melihat semua siswa", n === totalStudents);
    const err = await attempt(q, () => q`insert into public.students (school_id, nis, full_name) values (${SMPTJPKU}, 'X-RLS-5', 'Uji RLS')`);
    check("bisa menambah siswa di sekolah mana pun", err === null, err ?? "");
    const [{ n: audit }] = await q<{ n: number }[]>`select count(*)::int as n from public.audit_logs where entity = 'students' and diff_json -> 'new' ->> 'nis' = 'X-RLS-5'`;
    check("perubahan tercatat di audit log", audit === 1);
    const yearErr = await attempt(q, () => q`insert into public.academic_years (label, start_date, end_date, is_active) values ('2099/2100', '2099-07-01', '2100-06-30', false)`);
    check("bisa menambah tahun ajaran", yearErr === null, yearErr ?? "");
    const [{ id: anyComp }] = await q<{ id: string }[]>`select id from public.competencies where parent_id is not null limit 1`;
    const compUpd = await q`update public.competencies set name = name || ' (uji)' where id = ${anyComp}`;
    check("bisa mengubah nama kompetensi", compUpd.count === 1);
  });

  console.log("\nTanpa login (anon) & pengguna tanpa profil");
  await asUser(null, async (q) => {
    const err = await attempt(q, () => q`select 1 from public.students limit 1`);
    check("anon ditolak membaca siswa", err !== null && /permission denied/i.test(err), err ?? "berhasil membaca");
  });
  await asUser("00000000-0000-4000-8000-000000000000", async (q) => {
    const [{ n }] = await q<{ n: number }[]>`select count(*)::int as n from public.students`;
    const [{ m }] = await q<{ m: number }[]>`select count(*)::int as m from public.schools`;
    check("akun tanpa profil aktif tidak melihat apa pun", n === 0 && m === 0);
  });

  // ---------------------------------------------------------------------------
  const password = process.env.SEED_DEMO_PASSWORD;
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (password && apiUrl && apiKey) {
    console.log("\nLewat Supabase Auth + Data API (end-to-end)");
    const client = createClient(apiUrl, apiKey, { auth: { persistSession: false } });
    const { error: loginError } = await client.auth.signInWithPassword({ email: adminSdBdg.email, password });
    check("login admin SDTJBDG berhasil", !loginError, loginError?.message);
    if (!loginError) {
      const { data, error } = await client.from("students").select("school_id").limit(1000);
      const foreign = (data ?? []).filter((r) => r.school_id !== SDTJBDG);
      check("Data API hanya mengembalikan siswa SDTJBDG", !error && (data?.length ?? 0) > 0 && foreign.length === 0, error?.message);
      const { data: other } = await client.from("achievements").select("id").eq("school_id", SMPTJPKU);
      check("Data API tidak mengembalikan prestasi SMPTJPKU", (other?.length ?? 0) === 0);
      await client.auth.signOut();
    }
    const anon = createClient(apiUrl, apiKey, { auth: { persistSession: false } });
    const { data: anonData } = await anon.from("students").select("id").limit(1);
    check("Data API tanpa login tidak mengembalikan siswa", (anonData?.length ?? 0) === 0);
  } else {
    console.log("\n(Lapisan Data API dilewati: isi SEED_DEMO_PASSWORD untuk menjalankannya.)");
  }

  console.log(`\n${passes} lulus, ${failures} gagal`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
