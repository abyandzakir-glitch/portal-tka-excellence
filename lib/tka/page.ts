import "server-only";
import { redirect } from "next/navigation";
import { isNetworkRole } from "@/lib/auth/roles";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { todayIso } from "@/lib/format/id";
import type { RlsTx } from "@/lib/db/rls";
import { filtersToQuery, parseTkaFilters, SUBJECT_LABEL } from "./filters";
import { loadContext, type TkaContext } from "./load";

type Params = Record<string, string | string[] | undefined>;

/**
 * Common entry for every TKA page: session, URL filters, context, and the
 * page's own loader — all inside one RLS transaction.
 */
export async function withTka<T>(rawParams: Params, fn: (tx: RlsTx, ctx: TkaContext) => Promise<T>) {
  const user = await requireUser();
  const filters = parseTkaFilters(rawParams);
  const result = await queryAsUser(async (tx) => {
    const ctx = await loadContext(tx, filters, todayIso());
    if (!ctx) return null;
    return { ctx, data: await fn(tx, ctx) };
  });
  if (!result) redirect("/");
  const { sekolah: _s, ...rest } = filters;
  void _s;
  return {
    user,
    isNetwork: isNetworkRole(user.role),
    ...result,
    /** Current filters (without school) as "?…" for links. */
    query: filtersToQuery(rest),
    subjectName: SUBJECT_LABEL[filters.mapel],
  };
}
