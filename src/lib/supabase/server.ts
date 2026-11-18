import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";
export async function createClient() {
  const { url, key } = supabaseConfig();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        // Server Components cannot write cookies; Proxy refreshes them instead.
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      },
    },
  });
}
