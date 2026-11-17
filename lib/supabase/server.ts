import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Supabase client bound to the current user's session cookies.
 * Setting cookies only works inside Server Actions / Route Handlers; during
 * Server Component rendering the write is ignored (the proxy refreshes tokens).
 */
export async function createSupabaseServerClient() {
  // Read cookies first: during prerendering this marks the boundary as dynamic
  // before any env validation can throw.
  const cookieStore = await cookies();
  const env = publicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: safe to ignore, proxy.ts refreshes the session.
        }
      },
    },
  });
}

/** Admin client (secret key). Bypasses RLS — only for user management, never for data reads. */
export function createSupabaseAdminClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
