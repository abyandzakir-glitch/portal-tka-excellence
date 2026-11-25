-- =============================================================================
-- One try-out per name: lookup across schools.
--
-- A school admin only sees try-outs their school sits (RLS), so before this
-- each SD admin could upload the same blueprint and create "TO 1 Matematika SD"
-- again. This SECURITY DEFINER lookup lets the app refuse a new TO whose name
-- (case/space-insensitive) already exists for the same subject and academic
-- year, without exposing anything but id, date, owner and whether the caller's
-- school participates.
-- =============================================================================

create or replace function app.normalize_tryout_name(p_name text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'))
$$;
--> statement-breakpoint
create or replace function app.find_tryouts_by_name(p_name text, p_subject uuid, p_year uuid)
returns table (id uuid, date date, owner_school_id uuid, is_participant boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, t.date, t.owner_school_id,
         app.current_role() in ('super_admin', 'viewer')
           or exists (select 1 from public.tryout_schools ts
                       where ts.tryout_id = t.id and ts.school_id = app.current_school_id())
    from public.tryouts t
   where app.has_active_profile()
     and t.subject_id = p_subject and t.academic_year_id = p_year
     and app.normalize_tryout_name(t.name) = app.normalize_tryout_name(p_name)
   order by t.date, t.created_at
$$;
--> statement-breakpoint
revoke all on function app.find_tryouts_by_name(text, uuid, uuid) from public;
--> statement-breakpoint
grant execute on function app.normalize_tryout_name(text) to authenticated;
--> statement-breakpoint
grant execute on function app.find_tryouts_by_name(text, uuid, uuid) to authenticated;
