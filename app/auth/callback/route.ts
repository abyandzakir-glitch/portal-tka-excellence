import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing route for invitation and password-recovery emails.
 * Configure the Supabase email templates to link to:
 *   {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite   (Invite user)
 *   {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery (Reset password)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const fail = new URL("/login", request.url);
  if (!tokenHash || (type !== "invite" && type !== "recovery")) return NextResponse.redirect(fail);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(fail);

  return NextResponse.redirect(new URL("/auth/set-password", request.url));
}
