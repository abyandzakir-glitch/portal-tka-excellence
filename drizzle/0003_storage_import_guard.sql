-- =============================================================================
-- Fase 2 — import batches: audit size, rollback guard, Storage bucket.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Audit rows must not copy whole uploaded files: drop the large JSON columns
-- (parsed file cells, rollback snapshot) from the audit diff.
-- ---------------------------------------------------------------------------
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'source_json' - 'snapshot_json' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'source_json' - 'snapshot_json' end;
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

-- ---------------------------------------------------------------------------
-- Only Super Admin may roll back a batch (CLAUDE.md §9.3 step 8). Enforced in
-- the database, not only in the UI. Seed/migrations (table owner) are exempt.
-- ---------------------------------------------------------------------------
create or replace function app.guard_import_batch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'rolled_back' and old.status is distinct from 'rolled_back'
     and current_user = 'authenticated' and not app.is_super_admin() then
    raise exception 'Hanya Super Admin yang dapat membatalkan batch impor.' using errcode = '42501';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger guard_import_batch before update on public.import_batches
  for each row execute function app.guard_import_batch();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Storage: private bucket "imports" for original uploaded files.
-- Path convention: <school_id>/<batch_id>/<file>  or  network/<batch_id>/<file>
-- ---------------------------------------------------------------------------
create or replace function app.can_access_import_path(p_path text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_prefix text := split_part(p_path, '/', 1);
begin
  if v_prefix = 'network' then
    return case when p_write then app.is_super_admin() else coalesce(app.current_role() in ('super_admin', 'viewer'), false) end;
  end if;
  if v_prefix !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return case when p_write then app.can_write_school(v_prefix::uuid) else app.can_read_school(v_prefix::uuid) end;
end $$;
--> statement-breakpoint
grant execute on function app.can_access_import_path(text, boolean) to authenticated;
--> statement-breakpoint

-- Supabase only: the local verification database has no storage schema.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('imports', 'imports', false, 10485760)
    on conflict (id) do nothing;

    execute $p$create policy imports_select on storage.objects for select to authenticated
      using (bucket_id = 'imports' and app.can_access_import_path(name, false))$p$;
    execute $p$create policy imports_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'imports' and app.can_access_import_path(name, true))$p$;
    -- No update/delete policies: original files are kept as evidence of each batch.
  end if;
end $$;
