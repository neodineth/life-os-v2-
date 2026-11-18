export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment settings are missing.");
  return { url, key };
}
export function isSupabaseConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export function siteOrigin(requestURL: string) {
  const request = new URL(requestURL);
  if (["localhost", "127.0.0.1"].includes(request.hostname)) return request.origin;
  return new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://time-management-beryl.vercel.app").origin;
}
