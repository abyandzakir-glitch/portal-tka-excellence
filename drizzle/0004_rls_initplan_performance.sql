-- =============================================================================
-- Fase 3 — RLS performance, same access rules.
--
-- The 0001 policies called app.can_read_school(school_id) etc. once PER ROW;
-- each call re-read public.profiles. On ~70k item responses the TKA dashboard
-- took 40–50 s. Here the user's role and school are read once per statement
-- via scalar sub-selects "(select app.current_role())", which Postgres runs as
-- an InitPlan (Supabase's recommended pattern). tryout_items no longer
-- re-evaluates the tryouts policy per row.
--
-- Semantics are unchanged (see 0001):
--   read : super_admin/viewer -> all; school_admin/teacher -> own school only
--   write: super_admin -> all; school_admin -> own school only
--   NULL school_id (network-wide rows): network roles only
-- Verified by tests/integration/rls.test.ts and import.test.ts.
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'classes','students','class_enrollments','tryout_scores','item_responses','practice_logs',
    'achievements','achievement_participants','import_batches','import_rows','mapping_profiles'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format($f$create policy %I on public.%I for select to authenticated using (
        (select app.current_role()) in ('super_admin', 'viewer')
        or ((select app.current_role()) in ('school_admin', 'teacher') and school_id = (select app.current_school_id())))$f$,
      t || '_select', t);
    execute format($f$create policy %I on public.%I for insert to authenticated with check (
        (select app.current_role()) = 'super_admin'
        or ((select app.current_role()) = 'school_admin' and school_id = (select app.current_school_id())))$f$,
      t || '_insert', t);
    execute format($f$create policy %I on public.%I for update to authenticated
        using ((select app.current_role()) = 'super_admin'
               or ((select app.current_role()) = 'school_admin' and school_id = (select app.current_school_id())))
        with check ((select app.current_role()) = 'super_admin'
               or ((select app.current_role()) = 'school_admin' and school_id = (select app.current_school_id())))$f$,
      t || '_update', t);
    execute format($f$create policy %I on public.%I for delete to authenticated using (
        (select app.current_role()) = 'super_admin'
        or ((select app.current_role()) = 'school_admin' and school_id = (select app.current_school_id())))$f$,
      t || '_delete', t);
  end loop;
end $$;
--> statement-breakpoint

-- Interventions: teachers of the school may also manage them.
drop policy if exists interventions_select on public.interventions;
drop policy if exists interventions_insert on public.interventions;
drop policy if exists interventions_update on public.interventions;
drop policy if exists interventions_delete on public.interventions;
--> statement-breakpoint
create policy interventions_select on public.interventions for select to authenticated using (
  (select app.current_role()) in ('super_admin', 'viewer')
  or ((select app.current_role()) in ('school_admin', 'teacher') and school_id = (select app.current_school_id())));
create policy interventions_insert on public.interventions for insert to authenticated with check (
  (select app.current_role()) = 'super_admin'
  or ((select app.current_role()) in ('school_admin', 'teacher') and school_id = (select app.current_school_id())));
create policy interventions_update on public.interventions for update to authenticated
  using ((select app.current_role()) = 'super_admin'
         or ((select app.current_role()) in ('school_admin', 'teacher') and school_id = (select app.current_school_id())))
  with check ((select app.current_role()) = 'super_admin'
         or ((select app.current_role()) in ('school_admin', 'teacher') and school_id = (select app.current_school_id())));
create policy interventions_delete on public.interventions for delete to authenticated using (
  (select app.current_role()) = 'super_admin'
  or ((select app.current_role()) in ('school_admin', 'teacher') and school_id = (select app.current_school_id())));
--> statement-breakpoint

-- Reference data: readable by any active user, writable by super_admin only.
do $$
declare t text;
begin
  foreach t in array array['schools','academic_years','subjects','competencies','settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select app.has_active_profile()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select app.is_super_admin()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select app.is_super_admin())) with check ((select app.is_super_admin()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select app.is_super_admin()))', t || '_delete', t);
  end loop;
end $$;
--> statement-breakpoint

-- Try-outs: network readers, the owner school, or schools sitting it.
-- (tryout_schools' select policy does not read tryouts, so no recursion.)
drop policy if exists tryouts_select on public.tryouts;
--> statement-breakpoint
create policy tryouts_select on public.tryouts for select to authenticated using (
  (select app.current_role()) in ('super_admin', 'viewer')
  or ((select app.current_role()) in ('school_admin', 'teacher')
      and (owner_school_id = (select app.current_school_id())
           or id in (select ts.tryout_id from public.tryout_schools ts where ts.school_id = (select app.current_school_id())))));
--> statement-breakpoint

drop policy if exists tryout_schools_select on public.tryout_schools;
--> statement-breakpoint
create policy tryout_schools_select on public.tryout_schools for select to authenticated using (
  (select app.current_role()) in ('super_admin', 'viewer')
  or ((select app.current_role()) in ('school_admin', 'teacher') and school_id = (select app.current_school_id())));
--> statement-breakpoint

-- Items follow their try-out: one uncorrelated (hashed) sub-select instead of a per-row EXISTS.
drop policy if exists tryout_items_select on public.tryout_items;
--> statement-breakpoint
create policy tryout_items_select on public.tryout_items for select to authenticated using (
  (select app.current_role()) in ('super_admin', 'viewer')
  or tryout_id in (select t.id from public.tryouts t));
