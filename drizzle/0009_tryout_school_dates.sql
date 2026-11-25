-- =============================================================================
-- Per-school sitting date for a shared try-out.
--
-- One TO (one blueprint) is shared by every school that sits it, but schools
-- sit it on different days. tryout_schools.date holds the day each school sat
-- it; dashboards (trend, period filter, recency weighting, "latest TO") use
-- this date instead of tryouts.date, which stays the TO's reference date.
-- =============================================================================

alter table public.tryout_schools add column date date;
--> statement-breakpoint

-- Backfill. TOs merged from per-school twins keep each school's original date
-- in the blueprint upload that created the twin (repointed to the kept TO on
-- merge); everything else sat on the TO's own date.
update public.tryout_schools ts
   set date = coalesce(
         (select (b.mapping_json -> 'options' -> 'newTryout' ->> 'date')::date
            from public.import_batches b
           where b.type = 'tryout_blueprint' and b.tryout_id = ts.tryout_id and b.school_id = ts.school_id
             and b.mapping_json -> 'options' -> 'newTryout' ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
           order by b.created_at
           limit 1),
         (select t.date from public.tryouts t where t.id = ts.tryout_id));
--> statement-breakpoint
alter table public.tryout_schools alter column date set not null;
--> statement-breakpoint

-- A participant added without a date sits on the TO's date.
create or replace function app.tryout_school_default_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.date is null then
    select t.date into new.date from public.tryouts t where t.id = new.tryout_id;
  end if;
  return new;
end
$$;
--> statement-breakpoint
create trigger tryout_schools_default_date before insert on public.tryout_schools
  for each row execute function app.tryout_school_default_date();
--> statement-breakpoint

-- A school admin sets their own school's sitting date on a shared TO (they
-- cannot write tryout_schools of a network TO directly). The date must fall in
-- the TO's academic year.
create or replace function app.set_tryout_school_date(p_tryout uuid, p_school uuid, p_date date) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not app.can_write_school(p_school) then
    return false;
  end if;
  update public.tryout_schools ts
     set date = p_date
    from public.tryouts t
    join public.academic_years y on y.id = t.academic_year_id
   where ts.tryout_id = p_tryout and ts.school_id = p_school and t.id = ts.tryout_id
     and p_date between y.start_date and y.end_date;
  return found;
end
$$;
--> statement-breakpoint
revoke all on function app.set_tryout_school_date(uuid, uuid, date) from public;
--> statement-breakpoint
revoke all on function app.tryout_school_default_date() from public;
--> statement-breakpoint
grant execute on function app.set_tryout_school_date(uuid, uuid, date) to authenticated;
