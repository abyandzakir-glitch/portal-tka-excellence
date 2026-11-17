-- =============================================================================
-- Row Level Security, helper functions, audit triggers, updated_at triggers.
--
-- Access model (CLAUDE.md §6):
--   super_admin  : read/write everything
--   viewer       : read everything, write nothing
--   school_admin : read/write only rows of their own school
--   teacher      : read own school, manage interventions of own school
-- The service role / table owner (migrations, seed) bypasses RLS.
-- =============================================================================

create schema if not exists app;
--> statement-breakpoint
grant usage on schema app to authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so they can read profiles without
-- recursing into profiles' own RLS policies. search_path pinned for safety.
-- ---------------------------------------------------------------------------
create or replace function app.current_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;
--> statement-breakpoint
create or replace function app.current_school_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.school_id from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;
--> statement-breakpoint
create or replace function app.has_active_profile() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.current_role() is not null
$$;
--> statement-breakpoint
create or replace function app.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.current_role() = 'super_admin', false)
$$;
--> statement-breakpoint
create or replace function app.can_read_school(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.current_role() in ('super_admin', 'viewer')
    or (app.current_role() in ('school_admin', 'teacher')
        and target is not null and target = app.current_school_id()),
    false)
$$;
--> statement-breakpoint
-- A null target means a network-wide (foundation) record: only super_admin may write it.
create or replace function app.can_write_school(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.current_role() = 'super_admin'
    or (app.current_role() = 'school_admin'
        and target is not null and target = app.current_school_id()),
    false)
$$;
--> statement-breakpoint
create or replace function app.can_manage_interventions(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.can_write_school(target)
    or (app.current_role() = 'teacher' and target = app.current_school_id()),
    false)
$$;
--> statement-breakpoint
grant execute on all functions in schema app to authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Enable RLS on every table; anon gets nothing (no public pages, §6).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'schools','academic_years','classes','students','class_enrollments','subjects','competencies',
    'profiles','import_batches','import_rows','mapping_profiles','tryouts','tryout_schools',
    'tryout_items','tryout_scores','item_responses','practice_logs','interventions',
    'achievements','achievement_participants','settings','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
--> statement-breakpoint

-- Reference data: readable by any active user, writable by super_admin only.
do $$
declare t text;
begin
  foreach t in array array['schools','academic_years','subjects','competencies','settings'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.has_active_profile())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.is_super_admin())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.is_super_admin()) with check (app.is_super_admin())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.is_super_admin())', t || '_delete', t);
  end loop;
end $$;
--> statement-breakpoint

-- School-scoped data: read per can_read_school, write per can_write_school.
do $$
declare t text;
begin
  foreach t in array array[
    'classes','students','class_enrollments','tryout_scores','item_responses','practice_logs',
    'achievements','achievement_participants','import_batches','import_rows','mapping_profiles'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.can_read_school(school_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.can_write_school(school_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.can_write_school(school_id)) with check (app.can_write_school(school_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.can_write_school(school_id))', t || '_delete', t);
  end loop;
end $$;
--> statement-breakpoint

-- Interventions: teachers of the school may also manage them.
create policy interventions_select on public.interventions for select to authenticated
  using (app.can_read_school(school_id));
create policy interventions_insert on public.interventions for insert to authenticated
  with check (app.can_manage_interventions(school_id));
create policy interventions_update on public.interventions for update to authenticated
  using (app.can_manage_interventions(school_id)) with check (app.can_manage_interventions(school_id));
create policy interventions_delete on public.interventions for delete to authenticated
  using (app.can_manage_interventions(school_id));
--> statement-breakpoint

-- Tryouts: visible to network readers, the owner school, or schools sitting it.
-- Writable by super_admin (network-wide TO) or the owning school's admin.
create policy tryouts_select on public.tryouts for select to authenticated
  using (
    app.current_role() in ('super_admin', 'viewer')
    or app.can_read_school(owner_school_id)
    or exists (select 1 from public.tryout_schools ts
               where ts.tryout_id = tryouts.id and app.can_read_school(ts.school_id))
  );
create policy tryouts_insert on public.tryouts for insert to authenticated
  with check (app.can_write_school(owner_school_id));
create policy tryouts_update on public.tryouts for update to authenticated
  using (app.can_write_school(owner_school_id)) with check (app.can_write_school(owner_school_id));
create policy tryouts_delete on public.tryouts for delete to authenticated
  using (app.can_write_school(owner_school_id));
--> statement-breakpoint

create policy tryout_schools_select on public.tryout_schools for select to authenticated
  using (app.can_read_school(school_id));
-- Write policies are split per command (never FOR ALL): a FOR ALL policy also
-- applies to SELECT, and since it reads tryouts (whose policy reads
-- tryout_schools) that would recurse infinitely.
create or replace function app.can_write_tryout_school(p_tryout uuid, p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tryouts t where t.id = p_tryout
                 and app.can_write_school(t.owner_school_id)
                 and (t.owner_school_id is null or t.owner_school_id = p_school))
$$;
grant execute on function app.can_write_tryout_school(uuid, uuid) to authenticated;
create policy tryout_schools_insert on public.tryout_schools for insert to authenticated
  with check (app.can_write_tryout_school(tryout_id, school_id));
create policy tryout_schools_update on public.tryout_schools for update to authenticated
  using (app.can_write_tryout_school(tryout_id, school_id))
  with check (app.can_write_tryout_school(tryout_id, school_id));
create policy tryout_schools_delete on public.tryout_schools for delete to authenticated
  using (app.can_write_tryout_school(tryout_id, school_id));
--> statement-breakpoint

-- Items follow their tryout (the tryouts select policy applies inside the subquery).
create policy tryout_items_select on public.tryout_items for select to authenticated
  using (exists (select 1 from public.tryouts t where t.id = tryout_id));
create or replace function app.can_write_tryout(p_tryout uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tryouts t where t.id = p_tryout
                 and app.can_write_school(t.owner_school_id))
$$;
grant execute on function app.can_write_tryout(uuid) to authenticated;
create policy tryout_items_insert on public.tryout_items for insert to authenticated
  with check (app.can_write_tryout(tryout_id));
create policy tryout_items_update on public.tryout_items for update to authenticated
  using (app.can_write_tryout(tryout_id)) with check (app.can_write_tryout(tryout_id));
create policy tryout_items_delete on public.tryout_items for delete to authenticated
  using (app.can_write_tryout(tryout_id));
--> statement-breakpoint

-- Profiles: users see themselves; super_admin manages everyone. Nobody edits their own role.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.is_super_admin());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (app.is_super_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());
create policy profiles_delete on public.profiles for delete to authenticated
  using (app.is_super_admin());
--> statement-breakpoint

-- Audit log: read by super_admin only; rows are written exclusively by triggers.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (app.is_super_admin());
revoke insert, update, delete on public.audit_logs from authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
--> statement-breakpoint
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Audit triggers
--   * Row-level for master data, achievements, interventions, settings, users.
--     Updates store only the changed columns.
--   * Statement-level for high-volume tables (one audit row per statement with
--     the row count and batch ids), so a TO import does not create thousands
--     of audit rows.
--   * import_rows (staging) is not audited; its batch is.
-- ---------------------------------------------------------------------------
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_rec jsonb := coalesce(v_new, v_old);
  v_diff jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_build_object(
             'old', coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb),
             'new', coalesce(jsonb_object_agg(o.key, v_new -> o.key), '{}'::jsonb))
      into v_diff
      from jsonb_each(v_old) o
     where o.key <> 'updated_at' and (v_new -> o.key) is distinct from o.value;
    if v_diff -> 'old' = '{}'::jsonb then
      return new; -- nothing meaningful changed
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := jsonb_build_object('new', v_new);
  else
    v_diff := jsonb_build_object('old', v_old);
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, school_id, diff_json)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_rec ->> 'id', v_rec ->> 'tryout_id'),
    coalesce(v_rec ->> 'school_id', v_rec ->> 'owner_school_id')::uuid,
    v_diff
  );
  return coalesce(new, old);
end $$;
--> statement-breakpoint
create or replace function app.audit_bulk() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_count bigint;
  v_batches jsonb;
  v_schools uuid[];
begin
  if tg_op = 'DELETE' then
    select count(*), jsonb_agg(distinct import_batch_id) filter (where import_batch_id is not null),
           array_agg(distinct school_id)
      into v_count, v_batches, v_schools from old_rows;
  else
    select count(*), jsonb_agg(distinct import_batch_id) filter (where import_batch_id is not null),
           array_agg(distinct school_id)
      into v_count, v_batches, v_schools from new_rows;
  end if;

  if v_count = 0 then
    return null;
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, school_id, diff_json)
  values (
    auth.uid(),
    'bulk_' || lower(tg_op),
    tg_table_name,
    null,
    case when array_length(v_schools, 1) = 1 then v_schools[1] end,
    jsonb_build_object('row_count', v_count, 'import_batch_ids', coalesce(v_batches, '[]'::jsonb),
                       'school_ids', to_jsonb(v_schools))
  );
  return null;
end $$;
--> statement-breakpoint
do $$
declare t text;
begin
  foreach t in array array[
    'schools','academic_years','classes','students','class_enrollments','subjects','competencies',
    'profiles','import_batches','mapping_profiles','tryouts','tryout_schools','tryout_items',
    'interventions','achievements','achievement_participants','settings'
  ] loop
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function app.audit_row()', t);
  end loop;

  foreach t in array array['tryout_scores','item_responses','practice_logs'] loop
    execute format('create trigger audit_bulk_ins after insert on public.%I referencing new table as new_rows for each statement execute function app.audit_bulk()', t);
    execute format('create trigger audit_bulk_upd after update on public.%I referencing new table as new_rows for each statement execute function app.audit_bulk()', t);
    execute format('create trigger audit_bulk_del after delete on public.%I referencing old table as old_rows for each statement execute function app.audit_bulk()', t);
  end loop;
end $$;
