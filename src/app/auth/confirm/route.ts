import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/supabase/config";
import { safeNext } from "@/lib/cloud-model";
import { requestOrigin } from "@/lib/request-origin";
export async function GET(request: NextRequest) {
  const origin = siteOrigin(requestOrigin(request));
  const type = request.nextUrl.searchParams.get("type");
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const code = request.nextUrl.searchParams.get("code");
  const next = type === "recovery" ? "/reset-password" : safeNext(request.nextUrl.searchParams.get("next"));
  try {
    const client = await createClient();
    const result = token_hash && (type === "email" || type === "recovery")
      ? await client.auth.verifyOtp({ token_hash, type })
      : code ? await client.auth.exchangeCodeForSession(code) : { error: true };
    if (!result.error) return NextResponse.redirect(new URL(next,origin), { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch { /* Never include token values in messages or logs. */ }
  return NextResponse.redirect(new URL("/login?error=link_expired",origin), { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
