import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Role } from "@/lib/auth/roles";
import { profiles, schools } from "@/lib/db/schema";
import type { RlsTx } from "@/lib/db/rls";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type AccountStatus = "active" | "invited" | "inactive";

export const STATUS_BADGE: Record<AccountStatus, { label: string; variant: "secondary" | "outline" }> = {
  active: { label: "Aktif", variant: "secondary" },
  invited: { label: "Menunggu undangan diterima", variant: "outline" },
  inactive: { label: "Nonaktif", variant: "outline" },
};

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  schoolId: string | null;
  schoolName: string | null;
  isActive: boolean;
  status: AccountStatus;
  lastSignInAt: string | null;
  invitedAt: string | null;
}

/** Profiles (via RLS: Super Admin sees all) merged with sign-in info from Supabase Auth. */
export async function listUsers(tx: RlsTx, onlyId?: string): Promise<UserRow[]> {
  const base = tx
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      email: profiles.email,
      role: profiles.role,
      schoolId: profiles.schoolId,
      schoolName: schools.name,
      isActive: profiles.isActive,
    })
    .from(profiles)
    .leftJoin(schools, eq(schools.id, profiles.schoolId))
    .orderBy(asc(profiles.role), asc(profiles.fullName));
  const rows = onlyId ? await base.where(eq(profiles.id, onlyId)) : await base;

  const auth = new Map<string, { last: string | null; invited: string | null }>();
  try {
    const admin = createSupabaseAdminClient();
    if (onlyId) {
      const { data } = await admin.auth.admin.getUserById(onlyId);
      if (data.user) auth.set(data.user.id, { last: data.user.last_sign_in_at ?? null, invited: data.user.invited_at ?? null });
    } else {
      for (let page = 1; page < 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) break;
        for (const u of data.users) auth.set(u.id, { last: u.last_sign_in_at ?? null, invited: u.invited_at ?? null });
        if (data.users.length < 1000) break;
      }
    }
  } catch (e) {
    // Sign-in info is a convenience; the list still works without it.
    console.error("[users] auth info unavailable:", e instanceof Error ? e.message : e);
  }

  return rows.map((r) => {
    const a = auth.get(r.id);
    const status: AccountStatus = !r.isActive ? "inactive" : a && !a.last && a.invited ? "invited" : "active";
    return { ...r, status, lastSignInAt: a?.last ?? null, invitedAt: a?.invited ?? null };
  });
}
