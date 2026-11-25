/**
 * Dummy data seed (CLAUDE.md §11 Fase 1). NO real student data — every name,
 * NIS and NISN is generated. NISNs start with "99" to mark them as dummy.
 *
 *   pnpm db:seed            # refuses to run if data already exists
 *   pnpm db:seed --reset    # wipes ALL portal data first (asks nothing!)
 *   pnpm db:seed --production  # master data only (schools, years, subjects, competencies, settings);
 *                              # no dummy students/scores/accounts. Empty database only, never resets.
 *
 * Deterministic: the same seed produces the same data, so dashboard numbers can
 * be checked against manual calculations in Fase 3.
 *
 * Requires in .env.local: DATABASE_URL_DIRECT (or DATABASE_URL),
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, and optionally
 * SEED_DEMO_PASSWORD (min. 10 chars) for the demo accounts.
 */
import { randomBytes } from "node:crypto";
import { fakerID_ID as faker } from "@faker-js/faker";
import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { SCHOOL_VISUALS, SCHOOL_CODES, type SchoolCode } from "../../lib/brand/schools";
import * as t from "../../lib/db/schema";
import {
  DEFAULT_ACADEMIC_GROUP,
  DEFAULT_ACHIEVEMENT_POINTS,
  DEFAULT_AI_EXTRACTION_ENABLED,
  DEFAULT_MASTERY_MIN_ITEMS,
  DEFAULT_MASTERY_THRESHOLDS,
  DEFAULT_MASTERY_WEIGHTS,
  DEFAULT_RISK_RULES,
  DEFAULT_TRYOUT_TARGETS,
  SETTING_KEYS,
} from "../../lib/settings/defaults";
import { COGNITIVE_LEVELS, elementCode, subCode, SUBJECTS, type Level } from "./competencies";
import { buildAchievements } from "./achievements";

const SEED = 20261117;
faker.seed(SEED);
const rand = () => faker.number.float({ min: 0, max: 1 });
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const normal = (mean = 0, sd = 1) => {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// Configuration of the simulated cohort
// ---------------------------------------------------------------------------
const STUDENTS_PER_CLASS = 30;
const CLASS_SUFFIXES = ["A", "B"];
const FINAL_GRADE: Record<Level, number> = { sd: 6, smp: 9 };
/** Per-school ability offset so schools differ visibly on the dashboard. */
const SCHOOL_ABILITY: Record<SchoolCode, number> = {
  SDTJBDG: 0.35,
  SDTJCMH: -0.15,
  SDTJPKU: 0.05,
  SMPTJBDG: 0.25,
  SMPTJPKU: -0.25,
};
const TRYOUT_DATES = ["2026-08-15", "2026-09-19", "2026-10-17", "2026-11-14"];
const ITEMS_PER_TRYOUT = 30;
const VOIDED_ITEM = { tryoutIndex: 2, number: 7 }; // TO 3, item 7 is annulled in every TO-3
/** Total-score-only fallback example (§7.1): SDTJPKU, TO 4, Bahasa Indonesia. */
const TOTAL_ONLY = { school: "SDTJPKU" as SchoolCode, tryoutIndex: 3, subject: "BIN" };
const PRACTICE_WEEKS = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"];
const SUBJECT_BASE: Record<"MAT" | "BIN", number> = { MAT: 0.75, BIN: 1.25 };
const DIFFICULTY = [
  { label: "mudah", b: -0.9 },
  { label: "sedang", b: 0 },
  { label: "sulit", b: 0.9 },
];

const DEMO_DOMAIN = "demo.talentajuara.test"; // .test is reserved: never a real mailbox

// ---------------------------------------------------------------------------

function env(name: string, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error(`Variabel ${name} belum diisi di .env.local`);
  return v;
}

async function chunkedInsert<T>(rows: T[], size: number, insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

async function main() {
  const production = process.argv.includes("--production");
  const reset = process.argv.includes("--reset");
  if (production && reset) {
    console.error("✗ --production tidak bisa digabung dengan --reset (data produksi tidak pernah dihapus oleh seed).");
    process.exitCode = 1;
    return;
  }
  const direct = env("DATABASE_URL_DIRECT", false);
  const url = direct ?? env("DATABASE_URL")!;
  const client = postgres(url, {
    // Named prepared statements are fine on a direct/session connection; the
    // transaction-mode pooler (DATABASE_URL, port 6543) does not support them.
    prepare: Boolean(direct),
    max: 1,
    onnotice: () => {},
    // SEED_SQL_DEBUG=1 prints every statement (first 120 chars) for troubleshooting.
    debug: process.env.SEED_SQL_DEBUG ? (_conn, query) => console.log(`  sql> ${query.replace(/\s+/g, " ").slice(0, 120)}`) : undefined,
  });
  const db = drizzle(client, { schema: t });

  try {
    const host = new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname;
    console.log(`→ Target database: ${host}`);

    const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from public.schools`);
    if (n > 0 && !reset) {
      console.error("✗ Database sudah berisi data. Jalankan `pnpm db:seed --reset` untuk menghapus dan mengisi ulang.");
      process.exitCode = 1;
      return;
    }

    const users = production
      ? []
      : process.env.SEED_AUTH_MODE === "local"
        ? await prepareLocalAuthUsers(client)
        : await prepareAuthUsers();

    await db.transaction(async (tx) => {
      if (reset) {
        console.log("→ Menghapus data lama…");
        await tx.execute(sql`truncate table
          public.audit_logs, public.achievement_participants, public.achievements, public.interventions,
          public.practice_logs, public.item_responses, public.tryout_scores, public.tryout_items,
          public.tryout_schools, public.tryouts, public.import_rows, public.mapping_profiles,
          public.import_batches, public.settings, public.class_enrollments, public.students,
          public.classes, public.competencies, public.subjects, public.profiles,
          public.academic_years, public.schools
          restart identity cascade`);
      }

      // --- Schools -----------------------------------------------------------
      const schoolRows = await tx
        .insert(t.schools)
        .values(
          SCHOOL_CODES.map((code) => {
            const v = SCHOOL_VISUALS[code];
            return { schoolCode: code, name: v.defaultName, level: v.level, city: v.city, brandColor: v.color, logoPath: v.logo };
          }),
        )
        .returning();
      const schoolByCode = new Map(schoolRows.map((s) => [s.schoolCode as SchoolCode, s]));
      console.log(`✓ ${schoolRows.length} sekolah`);

      // --- Academic years ----------------------------------------------------
      const [, activeYear] = await tx
        .insert(t.academicYears)
        .values([
          { label: "2025/2026", startDate: "2025-07-01", endDate: "2026-06-30", isActive: false },
          { label: "2026/2027", startDate: "2026-07-01", endDate: "2027-06-30", isActive: true },
        ])
        .returning();

      // --- Subjects & competencies --------------------------------------------
      const subjectRows = await tx
        .insert(t.subjects)
        .values(SUBJECTS.map((s) => ({ code: s.code, name: s.name, level: s.level, sortOrder: s.sortOrder })))
        .returning();
      const subjectKey = (level: Level, code: string) => `${level}:${code}`;
      const subjectId = new Map(subjectRows.map((s) => [subjectKey(s.level, s.code), s.id]));

      /** level:subject -> list of sub-competency ids */
      const subsBySubject = new Map<string, string[]>();
      for (const s of SUBJECTS) {
        const sid = subjectId.get(subjectKey(s.level, s.code))!;
        const subs: string[] = [];
        for (const [ei, el] of s.elements.entries()) {
          const [element] = await tx
            .insert(t.competencies)
            .values({ subjectId: sid, code: elementCode(s, el), name: el.name, depth: 1, sortOrder: ei + 1 })
            .returning();
          const children = await tx
            .insert(t.competencies)
            .values(
              el.subs.map((name, si) => ({
                subjectId: sid,
                parentId: element!.id,
                code: subCode(s, el, si),
                name,
                depth: 2,
                sortOrder: si + 1,
              })),
            )
            .returning();
          subs.push(...children.map((c) => c.id));
        }
        subsBySubject.set(subjectKey(s.level, s.code), subs);
      }
      const totalSubs = [...subsBySubject.values()].reduce((a, b) => a + b.length, 0);
      console.log(`✓ ${subjectRows.length} mapel, ${totalSubs} sub-kompetensi`);

      // Everything from here to the settings is dummy data: skipped in production mode.
      if (!production) {
      // --- Classes & students --------------------------------------------------
      interface SimStudent {
        id: string;
        schoolCode: SchoolCode;
        level: Level;
        className: string;
        ability: number;
        /** competency id -> individual strength offset */
        compOffset: Map<string, number>;
      }
      const sim: SimStudent[] = [];
      let nisnSeq = 0;
      for (const [schoolIndex, code] of SCHOOL_CODES.entries()) {
        const school = schoolByCode.get(code)!;
        const level = school.level;
        const grade = FINAL_GRADE[level];
        const classRows = await tx
          .insert(t.classes)
          .values(CLASS_SUFFIXES.map((sfx) => ({ schoolId: school.id, academicYearId: activeYear!.id, name: `${grade}${sfx}`, grade })))
          .returning();

        let seq = 0;
        for (const cls of classRows) {
          const studentValues = Array.from({ length: STUDENTS_PER_CLASS }, () => {
            seq += 1;
            nisnSeq += 1;
            const sex = rand() < 0.5 ? "male" : "female";
            return {
              schoolId: school.id,
              nis: `${level === "sd" ? 2021 : 2024}${schoolIndex + 1}${String(seq).padStart(3, "0")}`,
              nisn: `99${String(10_000_000 + nisnSeq * 7919).slice(-8)}`,
              fullName: faker.person.fullName({ sex }),
              gender: (sex === "male" ? "L" : "P") as "L" | "P",
            };
          });
          const inserted = await tx.insert(t.students).values(studentValues).returning({ id: t.students.id });
          await tx.insert(t.classEnrollments).values(
            inserted.map((st) => ({ studentId: st.id, classId: cls.id, academicYearId: activeYear!.id, schoolId: school.id })),
          );
          const classOffset = cls.name.endsWith("A") ? 0.1 : -0.1;
          for (const st of inserted) {
            const compOffset = new Map<string, number>();
            for (const subjectCode of ["MAT", "BIN"]) {
              for (const cid of subsBySubject.get(subjectKey(level, subjectCode))!) compOffset.set(cid, normal(0, 0.55));
            }
            sim.push({
              id: st.id,
              schoolCode: code,
              level,
              className: cls.name,
              ability: normal(SCHOOL_ABILITY[code] + classOffset, 0.75),
              compOffset,
            });
          }
        }
      }
      console.log(`✓ ${sim.length} siswa (${STUDENTS_PER_CLASS * CLASS_SUFFIXES.length} per sekolah)`);

      // A network-wide "hard competency" per subject so the heatmap shows a clear weak spot.
      const hardComp = new Map<string, string>();
      for (const [key, subs] of subsBySubject) hardComp.set(key, subs[subs.length > 2 ? 1 : 0]!);

      // --- Try outs ---------------------------------------------------------------
      let responseCount = 0;
      let scoreCount = 0;
      for (const level of ["sd", "smp"] as const) {
        const levelSchools = schoolRows.filter((s) => s.level === level);
        const levelStudents = sim.filter((s) => s.level === level);
        for (const subjectCode of ["MAT", "BIN"] as const) {
          const key = subjectKey(level, subjectCode);
          const subs = subsBySubject.get(key)!;
          const cognitive = COGNITIVE_LEVELS[level][subjectCode];
          const subjectName = subjectCode === "MAT" ? "Matematika" : "Bahasa Indonesia";

          for (const [k, date] of TRYOUT_DATES.entries()) {
            const [tryout] = await tx
              .insert(t.tryouts)
              .values({
                name: `TO ${k + 1} ${subjectName} ${level.toUpperCase()}`,
                date,
                academicYearId: activeYear!.id,
                level,
                subjectId: subjectId.get(key)!,
                ownerSchoolId: null,
              })
              .returning();
            await tx.insert(t.tryoutSchools).values(levelSchools.map((s) => ({ tryoutId: tryout!.id, schoolId: s.id, date })));

            const items = await tx
              .insert(t.tryoutItems)
              .values(
                Array.from({ length: ITEMS_PER_TRYOUT }, (_, i) => {
                  const diff = DIFFICULTY[i % 3]!;
                  return {
                    tryoutId: tryout!.id,
                    number: i + 1,
                    competencyId: subs[i % subs.length]!,
                    cognitiveLevel: cognitive.length ? cognitive[i % cognitive.length]! : null,
                    difficulty: diff.label,
                    answerKey: pick(["A", "B", "C", "D"]),
                    isVoided: k === VOIDED_ITEM.tryoutIndex && i + 1 === VOIDED_ITEM.number,
                  };
                }),
              )
              .returning();
            const validItems = items.filter((it) => !it.isVoided).length;

            const scores: (typeof t.tryoutScores.$inferInsert)[] = [];
            const responses: (typeof t.itemResponses.$inferInsert)[] = [];
            for (const st of levelStudents) {
              const schoolId = schoolByCode.get(st.schoolCode)!.id;
              if (rand() < 0.03) {
                scores.push({ tryoutId: tryout!.id, studentId: st.id, schoolId, status: "absent", hasItemDetail: false });
                continue;
              }
              const totalOnly =
                st.schoolCode === TOTAL_ONLY.school && k === TOTAL_ONLY.tryoutIndex && subjectCode === TOTAL_ONLY.subject;
              let correct = 0;
              const studentResponses: (typeof t.itemResponses.$inferInsert)[] = [];
              for (const it of items) {
                const b = DIFFICULTY.find((d) => d.label === it.difficulty)!.b;
                const hard = it.competencyId === hardComp.get(key) ? -1.1 : 0;
                const theta = SUBJECT_BASE[subjectCode] + st.ability + (st.compOffset.get(it.competencyId!) ?? 0) + hard + 0.18 * k;
                const skipped = rand() < 0.02;
                const isCorrect = skipped ? null : rand() < sigmoid(theta - b);
                if (isCorrect && !it.isVoided) correct += 1;
                const wrong = ["A", "B", "C", "D"].filter((x) => x !== it.answerKey);
                studentResponses.push({
                  tryoutId: tryout!.id,
                  itemId: it.id,
                  studentId: st.id,
                  schoolId,
                  answer: skipped ? null : isCorrect ? it.answerKey : pick(wrong),
                  isCorrect,
                });
              }
              scores.push({
                tryoutId: tryout!.id,
                studentId: st.id,
                schoolId,
                rawScore: round2((correct / validItems) * 100),
                status: "present",
                hasItemDetail: !totalOnly,
              });
              if (!totalOnly) responses.push(...studentResponses);
            }
            await chunkedInsert(scores, 1000, (c) => tx.insert(t.tryoutScores).values(c));
            await chunkedInsert(responses, 2000, (c) => tx.insert(t.itemResponses).values(c));
            scoreCount += scores.length;
            responseCount += responses.length;
          }
        }
      }
      console.log(`✓ 16 try out, ${scoreCount} nilai, ${responseCount} jawaban per butir`);

      // --- Weekly practice logs -------------------------------------------------
      const logs: (typeof t.practiceLogs.$inferInsert)[] = [];
      for (const st of sim) {
        const schoolId = schoolByCode.get(st.schoolCode)!.id;
        for (const [w, weekStart] of PRACTICE_WEEKS.entries()) {
          for (const subjectCode of ["MAT", "BIN"] as const) {
            if (rand() < 0.15) continue; // did not practise this subject this week
            const key = subjectKey(st.level, subjectCode);
            const subs = faker.helpers.arrayElements(subsBySubject.get(key)!, 2);
            for (const cid of subs) {
              const hard = cid === hardComp.get(key) ? -1.1 : 0;
              const p = sigmoid(SUBJECT_BASE[subjectCode] + st.ability + (st.compOffset.get(cid) ?? 0) + hard + 0.05 * w);
              const attempted = faker.number.int({ min: 5, max: 15 });
              let correct = 0;
              for (let i = 0; i < attempted; i++) if (rand() < p) correct += 1;
              logs.push({ studentId: st.id, schoolId, weekStart, subjectId: subjectId.get(key)!, competencyId: cid, attempted, correct });
            }
            if (rand() < 0.3) {
              // Mixed practice without a competency: counts for volume/accuracy only.
              const attempted = faker.number.int({ min: 10, max: 25 });
              const p = sigmoid(SUBJECT_BASE[subjectCode] + st.ability);
              let correct = 0;
              for (let i = 0; i < attempted; i++) if (rand() < p) correct += 1;
              logs.push({ studentId: st.id, schoolId, weekStart, subjectId: subjectId.get(key)!, competencyId: null, attempted, correct });
            }
          }
        }
      }
      await chunkedInsert(logs, 2000, (c) => tx.insert(t.practiceLogs).values(c));
      console.log(`✓ ${logs.length} log latihan pekanan (${PRACTICE_WEEKS.length} pekan)`);

      // --- Achievements -----------------------------------------------------------
      const studentsBySchool = new Map<SchoolCode, { id: string; name: string; className: string }[]>();
      const names = await tx.select({ id: t.students.id, fullName: t.students.fullName }).from(t.students);
      const nameById = new Map(names.map((r) => [r.id, r.fullName]));
      for (const st of sim) {
        const list = studentsBySchool.get(st.schoolCode) ?? [];
        list.push({ id: st.id, name: nameById.get(st.id)!, className: st.className });
        studentsBySchool.set(st.schoolCode, list);
      }
      const achievements = buildAchievements({ faker, rand, pick, studentsBySchool });
      for (const a of achievements) {
        const [row] = await tx
          .insert(t.achievements)
          .values({
            schoolId: schoolByCode.get(a.schoolCode)!.id,
            achievedOn: a.achievedOn,
            competitionName: a.competitionName,
            organizer: a.organizer,
            category: a.category,
            level: a.level,
            rank: a.rank,
            evidenceUrl: a.evidenceUrl,
            notes: a.notes,
          })
          .returning({ id: t.achievements.id });
        await tx.insert(t.achievementParticipants).values(
          a.participants.map((p) => ({
            achievementId: row!.id,
            schoolId: schoolByCode.get(a.schoolCode)!.id,
            studentId: p.studentId,
            rawName: p.name,
          })),
        );
      }
      console.log(`✓ ${achievements.length} prestasi`);
      } // end dummy data

      // --- Settings -----------------------------------------------------------------
      const settingRows: (typeof t.settings.$inferInsert)[] = [
        { key: SETTING_KEYS.masteryThresholds, valueJson: DEFAULT_MASTERY_THRESHOLDS },
        { key: SETTING_KEYS.masteryWeights, valueJson: DEFAULT_MASTERY_WEIGHTS },
        { key: SETTING_KEYS.masteryMinItems, valueJson: DEFAULT_MASTERY_MIN_ITEMS },
        { key: SETTING_KEYS.riskRules, valueJson: DEFAULT_RISK_RULES },
        { key: SETTING_KEYS.achievementPoints, valueJson: DEFAULT_ACHIEVEMENT_POINTS },
        { key: SETTING_KEYS.achievementAcademicGroup, valueJson: DEFAULT_ACADEMIC_GROUP },
        { key: SETTING_KEYS.aiExtraction, valueJson: DEFAULT_AI_EXTRACTION_ENABLED },
      ];
      for (const s of subjectRows) {
        settingRows.push({
          key: SETTING_KEYS.tryoutTarget,
          subjectId: s.id,
          valueJson: DEFAULT_TRYOUT_TARGETS[s.code as "MAT" | "BIN"],
        });
      }
      await tx.insert(t.settings).values(settingRows);
      console.log(`✓ ${settingRows.length} pengaturan default`);

      // --- Profiles for demo users -------------------------------------------------
      if (users.length) await tx.insert(t.profiles).values(
        users.map((u) => ({
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          role: u.role,
          schoolId: u.schoolCode ? schoolByCode.get(u.schoolCode)!.id : null,
        })),
      );
      console.log(`✓ ${users.length} akun demo`);
    });

    if (production) {
      console.log("\nSelesai (mode produksi: hanya data master). Buat akun Super Admin pertama sesuai README → Deploy.");
      return;
    }
    console.log("\nSelesai. Akun demo (kata sandi sama untuk semua akun):");
    for (const u of users) console.log(`  ${u.role.padEnd(13)} ${u.email}`);
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Demo users in Supabase Auth (created/updated via the admin API)
// ---------------------------------------------------------------------------
interface DemoUser {
  id: string;
  email: string;
  fullName: string;
  role: "super_admin" | "viewer" | "school_admin" | "teacher";
  schoolCode: SchoolCode | null;
}

const DEMO_USERS: Omit<DemoUser, "id">[] = [
  { email: `superadmin@${DEMO_DOMAIN}`, fullName: "Demo Super Admin", role: "super_admin", schoolCode: null },
  { email: `manajemen@${DEMO_DOMAIN}`, fullName: "Demo Manajemen", role: "viewer", schoolCode: null },
  { email: `admin.sdtjbdg@${DEMO_DOMAIN}`, fullName: "Demo Admin SD Bandung", role: "school_admin", schoolCode: "SDTJBDG" },
  { email: `admin.smptjpku@${DEMO_DOMAIN}`, fullName: "Demo Admin SMP Pekanbaru", role: "school_admin", schoolCode: "SMPTJPKU" },
  { email: `guru.sdtjbdg@${DEMO_DOMAIN}`, fullName: "Demo Guru SD Bandung", role: "teacher", schoolCode: "SDTJBDG" },
];

/**
 * Local verification only (scripts/verify-local.ts): writes the demo users
 * straight into a stub auth.users table instead of calling Supabase Auth.
 */
async function prepareLocalAuthUsers(client: postgres.Sql): Promise<DemoUser[]> {
  const result: DemoUser[] = [];
  for (const w of DEMO_USERS) {
    const [row] = await client<{ id: string }[]>`
      insert into auth.users (email) values (${w.email})
      on conflict (email) do update set email = excluded.email
      returning id`;
    result.push({ ...w, id: row!.id });
  }
  return result;
}

async function prepareAuthUsers(): Promise<DemoUser[]> {
  const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL")!, env("SUPABASE_SECRET_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let password = process.env.SEED_DEMO_PASSWORD;
  if (!password) {
    password = randomBytes(12).toString("base64url");
    console.log(`→ SEED_DEMO_PASSWORD tidak diisi; kata sandi acak untuk akun demo: ${password}`);
  } else if (password.length < 10) {
    throw new Error("SEED_DEMO_PASSWORD minimal 10 karakter.");
  }

  const wanted = DEMO_USERS;

  const existing = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Gagal membaca pengguna Supabase: ${error.message}`);
    for (const u of data.users) if (u.email) existing.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }

  const result: DemoUser[] = [];
  for (const w of wanted) {
    let id = existing.get(w.email);
    if (id) {
      const { error } = await supabase.auth.admin.updateUserById(id, { password, email_confirm: true });
      if (error) throw new Error(`Gagal memperbarui ${w.email}: ${error.message}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({ email: w.email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`Gagal membuat ${w.email}: ${error?.message}`);
      id = data.user.id;
    }
    result.push({ ...w, id });
  }
  return result;
}

main().catch((err) => {
  console.error(`✗ Seed gagal: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
