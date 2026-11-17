import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";
import { TableSkeleton } from "./page";

/**
 * Renders children only for the allowed roles (others are redirected).
 * Wrapped in Suspense because it reads the session cookie.
 * UI guard only — the database still enforces RLS on every query.
 */
export function RoleGuard({ roles, children }: { roles: readonly Role[]; children: React.ReactNode }) {
  return (
    <Suspense fallback={<TableSkeleton rows={4} />}>
      <Guarded roles={roles}>{children}</Guarded>
    </Suspense>
  );
}

async function Guarded({ roles, children }: { roles: readonly Role[]; children: React.ReactNode }) {
  await requireUser(roles);
  return <>{children}</>;
}
