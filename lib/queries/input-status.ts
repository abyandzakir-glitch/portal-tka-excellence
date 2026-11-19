import { sql } from "drizzle-orm";
import type { RlsTx } from "@/lib/db/rls";
import {
  overallStatus,
  practiceStatus,
  tryoutDueWindow,
  tryoutStatus,
  type InputStatus,
} from "@/lib/metrics/input-status";

/** TKA is taken in the final grade of each level. */
export const TKA_GRADE = { sd: 6, smp: 9 } as const;

export interface LastUpload {
  by: string | null;
  at: string;
}

export interface SchoolWeekStatus {
  schoolId: string;
  code: string;
  name: string;
  level: "sd" | "smp";
  expected: number;
  overall: InputStatus | null;
  practice: { status: InputStatus; students: number; last: LastUpload | null };
  tryouts: { id: string; name: string; subject: string; date: string; status: InputStatus; scored: number; totalsOnly: number }[];
  tryoutLast: LastUpload | null;
  /** Newest of the TO-result and practice uploads ("Diperbarui …"). */
  lastUpload: LastUpload | null;
}

type Row = Record<string, unknown>;

/**
 * Completeness of the weekly input for every school the user can see (RLS),
 * for the week starting `weekStart` (Monday, Asia/Jakarta).
 */
export async function loadWeekStatus(tx: RlsTx, weekStart: string): Promise<SchoolWeekStatus[]> {
  const due = tryoutDueWindow(weekStart);

  const schoolRows = await tx.execute<{ id: string; code: string; name: string; level: "sd" | "smp"; expected: number } & Row>(sql`
    select s.id, s.school_code as code, s.name, s.level,
      (select count(distinct st.id)::int
         from public.students st
         join public.class_enrollments ce on ce.student_id = st.id
         join public.classes c on c.id = ce.class_id
         join public.academic_years y on y.id = ce.academic_year_id and y.is_active
        where st.school_id = s.id and st.is_active
          and c.grade = case s.level when 'sd' then ${TKA_GRADE.sd}::int else ${TKA_GRADE.smp}::int end) as expected
    from public.schools s
    -- schools is readable by every role (master data); scope school-bound users to their own school.
    where (select app.current_school_id()) is null or s.id = (select app.current_school_id())
    order by s.level, s.school_code`);

  const practice = await tx.execute<{ school_id: string; n: number } & Row>(sql`
    select school_id, count(distinct student_id)::int as n
    from public.practice_logs where week_start = ${weekStart}::date
    group by school_id`);

  const tryoutRows = await tx.execute<{ school_id: string; id: string; name: string; subject: string; date: string; scored: number; totals_only: number } & Row>(sql`
    with due as (
      select t.id, t.name, sub.name as subject, t.date::text as date, sc.id as school_id
      from public.tryouts t
      join public.subjects sub on sub.id = t.subject_id
      join public.schools sc on sc.level = t.level
      where t.date between ${due.from}::date and ${due.to}::date
        and (t.owner_school_id = sc.id
             or exists (select 1 from public.tryout_schools ts where ts.tryout_id = t.id and ts.school_id = sc.id))
    )
    select d.school_id, d.id, d.name, d.subject, d.date,
      count(s.id)::int as scored,
      count(s.id) filter (where s.status = 'present' and not s.has_item_detail)::int as totals_only
    from due d
    left join public.tryout_scores s on s.tryout_id = d.id and s.school_id = d.school_id
    group by d.school_id, d.id, d.name, d.subject, d.date
    order by d.date, d.subject, d.name`);

  // Latest committed upload per school and kind (any week): "siapa yang terakhir mengunggah".
  // Achievements are managed from the Prestasi dashboard and are not part of the weekly checklist.
  const lastRows = await tx.execute<{ school_id: string; type: string; at: string; by: string | null } & Row>(sql`
    select distinct on (b.school_id, b.type) b.school_id, b.type::text as type, b.created_at::text as at, app.staff_name(b.created_by) as by
    from public.import_batches b
    where b.status = 'committed' and b.school_id is not null and b.type in ('tryout_results', 'practice_logs')
    order by b.school_id, b.type, b.created_at desc`);

  const practiceBy = new Map(practice.map((r) => [r.school_id, r.n]));
  const lastBy = new Map(lastRows.map((r) => [`${r.school_id}|${r.type}`, { by: r.by, at: r.at }]));

  return schoolRows.map((s) => {
    const students = practiceBy.get(s.id) ?? 0;
    const pStatus = practiceStatus(students, s.expected);
    const tos = tryoutRows
      .filter((t) => t.school_id === s.id)
      .map((t) => ({ id: t.id, name: t.name, subject: t.subject, date: t.date, scored: t.scored, totalsOnly: t.totals_only, status: tryoutStatus({ scored: t.scored, totalsOnly: t.totals_only }, s.expected) }));
    const tryoutLast = lastBy.get(`${s.id}|tryout_results`) ?? null;
    const practiceLast = lastBy.get(`${s.id}|practice_logs`) ?? null;
    return {
      schoolId: s.id,
      code: s.code,
      name: s.name,
      level: s.level,
      expected: s.expected,
      overall: overallStatus([pStatus, ...tos.map((t) => t.status)]),
      practice: { status: pStatus, students, last: practiceLast },
      tryouts: tos,
      tryoutLast,
      lastUpload: [tryoutLast, practiceLast].reduce<LastUpload | null>((a, b) => (b && (!a || b.at > a.at) ? b : a), null),
    };
  });
}
