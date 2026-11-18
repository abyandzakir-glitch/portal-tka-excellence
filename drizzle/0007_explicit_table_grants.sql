-- Explicit table privileges.
-- Supabase projects created from late 2026 no longer grant table privileges to
-- anon/authenticated/service_role by default, so the app (which runs queries as
-- `authenticated` under RLS) got "permission denied". State them here instead
-- of relying on platform defaults. RLS still decides which rows are visible.

grant usage on schema public to authenticated, service_role;--> statement-breakpoint

-- Signed-in users: read/write, filtered by RLS policies.
grant select, insert, update, delete on all tables in schema public to authenticated;--> statement-breakpoint
grant usage, select on all sequences in schema public to authenticated;--> statement-breakpoint

-- Audit log stays append-only through triggers (see 0001).
revoke insert, update, delete on public.audit_logs from authenticated;--> statement-breakpoint

-- Server-side admin key.
grant all on all tables in schema public to service_role;--> statement-breakpoint
grant usage, select on all sequences in schema public to service_role;--> statement-breakpoint

-- Not signed in: no table access at all (every route requires login).
revoke all on all tables in schema public from anon;--> statement-breakpoint
revoke all on all sequences in schema public from anon;--> statement-breakpoint

-- TRUNCATE bypasses RLS and is never used by the app.
revoke truncate on all tables in schema public from authenticated;
