import { authSchema } from "@/lib/cloud-model";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/supabase/config";
import { requestOrigin } from "@/lib/request-origin";
import { AppError, authenticatedClient, failure, json, readBody } from "@/lib/server-api";

export async function POST(request: Request) {
  try {
    const input = authSchema.parse(await readBody(request));
    const client = await createClient();
    const origin = siteOrigin(requestOrigin(request));
    let error;
    if (input.action === "login") {
      ({ error } = await client.auth.signInWithPassword({ email: input.email, password: input.password }));
    } else if (input.action === "signup") {
      const result = await client.auth.signUp({ email: input.email, password: input.password, options: {
        data: { player_name: input.playerName || "Player one" }, emailRedirectTo: `${origin}/auth/confirm?next=/`,
      } });
      error = result.error;
      // Confirmation is an invariant, even if the project is misconfigured.
      if (!error && result.data.session) {
        await client.auth.signOut({ scope: "local" });
        throw new AppError(503,"confirmation_setup","Enable email confirmation in Supabase before signing up.");
      }
      if (!error) return json({ message: "Check your email to confirm your account." });
    } else if (input.action === "recover") {
      ({ error } = await client.auth.resetPasswordForEmail(input.email, { redirectTo: `${origin}/auth/confirm?next=/reset-password` }));
      if (!error) return json({ message: "If the account exists, a reset link is on its way." });
    } else if (input.action === "reset") {
      const verified = await authenticatedClient();
      ({ error } = await verified.client.auth.updateUser({ password: input.password }));
    } else {
      ({ error } = await client.auth.signOut({ scope: "local" }));
    }
    if (error) {
      if (error.status === 429 || /rate_limit/.test(error.code || "")) throw new AppError(429,"rate_limit","Too many attempts. Please wait before trying again.");
      if (error.code === "email_not_confirmed") throw new AppError(400,"email_not_confirmed","Confirm your email before logging in.");
      if (error.code === "invalid_credentials") throw new AppError(400,"credentials","Email or password is incorrect.");
      if (error.code === "email_address_not_authorized" || /email.*sending|smtp/i.test(error.message)) throw new AppError(503,"email_setup","Email delivery is not ready. Contact the workspace owner.");
      if (error.status === 0 || error.name === "AuthRetryableFetchError" || (error.status || 0) >= 500) throw new AppError(503,"auth_unavailable","Cannot connect to the sign-in service. Check your connection and try again.");
      throw new AppError(400,"auth","Could not complete this request. Check your details and try again.");
    }
    return json({ success: true });
  } catch (error) { return failure(error); }
}
