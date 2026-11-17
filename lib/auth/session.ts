import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { profiles, schools } from "@/lib/db/schema";
import { withRls, type JwtClaims, type RlsTx } from "@/lib/db/rls";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CurrentUser, Role } from "./roles";

/**
 * Verified JWT claims of the signed-in user, or null.
 * getClaims() validates the token signature (unlike getSession()).
 * Reads cookies, so callers must render inside <Suspense> (cacheComponents).
 */
export const getClaims = cache(async (): Promise<JwtClaims | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims as JwtClaims;
});

/** The signed-in user's active profile, or null (deduplicated per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await getClaims();
  if (!claims) return null;

  const rows = await withRls(claims, (tx) =>
    tx
      .select({
        id: profiles.id,
        email: profiles.email,
        fullName: profiles.fullName,
        role: profiles.role,
        isActive: profiles.isActive,
        schoolId: profiles.schoolId,
        schoolCode: schools.schoolCode,
        schoolName: schools.name,
      })
      .from(profiles)
      .leftJoin(schools, eq(schools.id, profiles.schoolId))
      .where(eq(profiles.id, claims.sub))
      .limit(1),
  );

  const row = rows[0];
  if (!row || !row.isActive) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    schoolId: row.schoolId,
    schoolCode: row.schoolCode,
    schoolName: row.schoolName,
  };
});

/** Use at the top of every protected page body, Server Action and Route Handler. */
export async function requireUser(allowed?: readonly Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (allowed && !allowed.includes(user.role)) redirect("/tidak-diizinkan");
  return user;
}

/** Runs a query as the signed-in user with RLS enforced. */
export async function queryAsUser<T>(fn: (tx: RlsTx) => Promise<T>): Promise<T> {
  const claims = await getClaims();
  if (!claims) redirect("/login");
  return withRls(claims, fn);
}
