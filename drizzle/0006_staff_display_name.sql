-- Fase 5: Pusat Input Pekanan shows "who uploaded last" to every signed-in role.
-- profiles RLS lets non-super-admins read only their own row, so expose ONLY the
-- display name (no email, role or school) through a security definer function,
-- and only to callers with an active profile.
create or replace function app.staff_name(target uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.full_name from public.profiles p
  where p.id = target and app.current_role() is not null
$$;
--> statement-breakpoint
revoke all on function app.staff_name(uuid) from public;
--> statement-breakpoint
grant execute on function app.staff_name(uuid) to authenticated;
