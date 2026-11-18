import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseConfig } from "@/lib/supabase/config";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  if (!isSupabaseConfigured()) return response;
  const { url, key } = supabaseConfig();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  // Authorization is checked again inside protected pages and APIs.
  try { await client.auth.getClaims(); } catch { /* The page/API reports transient Auth failures. */ }
  return response;
}
export const config = { matcher: ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/confirm", "/api/:path*"] };
