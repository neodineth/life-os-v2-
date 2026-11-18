# Accounts setup and production rollout

The code is ready for the Supabase project `oqirshvqgtpzdhkdgxxm`. Applying SQL and changing Supabase/Vercel settings require the project owner's dashboard access. A publishable key cannot perform those operations.

## 1. Apply the database migration

In Supabase -> SQL Editor -> New query, paste the **entire** contents of:

`supabase/migrations/202610250001_accounts.sql`

Run it once. It is transactional and safe to rerun. It creates only the namespaced `lifeos_profiles`, `lifeos_workspaces`, `lifeos_tasks`, and `lifeos_imports` tables plus constrained RPC functions. It does not remove or modify unrelated tables. The old `supabase/schema.sql` proposal should not be used.

The migration enables row-level security on all four tables. Authenticated users may select only their own rows; direct writes are revoked. The RPC functions derive the owner from the verified Supabase JWT, fix their search path, validate tasks, and only operate on that owner. Tasks use `(user_id,id)` identity, so old `sample-*` IDs can be safely imported by different accounts.

No service-role key is used by this application.

## 2. Configure email authentication

In Supabase -> Authentication -> Sign In / Providers -> Email:

- Enable email/password signup.
- Keep **Confirm email** enabled.
- Use a password minimum of at least 8 characters.

In Authentication -> URL Configuration:

**Site URL**

```text
https://time-management-beryl.vercel.app
```

**Redirect URLs** (the final `**` permits the callback's query string):

```text
https://time-management-beryl.vercel.app/auth/confirm**
http://localhost:3000/auth/confirm**
```

The application only accepts `/` and `/reset-password` as callback destinations. Production and preview deployments send emails back to the configured production origin; localhost development uses its own origin.

## 3. Update the email templates

In Authentication -> Email Templates, replace the relevant link in each template with the following. The application supplies a `RedirectTo` URL containing the `next` query parameter.

**Confirm signup**

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Confirm your LifeOS account</a>
```

**Reset password**

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Reset your LifeOS password</a>
```

Token-hash links work across browsers. The callback also supports code exchange for the SDK's standard PKCE links. Expired or reused links return a clear message on the login page.

Supabase's built-in email sender is for testing, limits delivery to authorized project-team addresses, and has low sending limits. Configure your provider in Authentication -> Email -> SMTP Settings for signup by other people. Enter SMTP credentials in Supabase, not in this repository. See https://supabase.com/docs/guides/auth/auth-smtp.

## 4. Configure Vercel before production rollout

Vercel -> time-management project -> Settings -> Environment Variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oqirshvqgtpzdhkdgxxm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key supplied for this project |
| `NEXT_PUBLIC_SITE_URL` | `https://time-management-beryl.vercel.app` |

Set these for Production and Preview. Next.js embeds public environment variables during the build, so deploy/redeploy after setting them. Local values are in ignored `.env.local`; `.env.example` contains placeholders only.

**Rollout gate:** do not merge/push the account requirement to the production branch until the migration, environment settings, and email configuration have been checked. An unconfigured build displays Setup required; an unapplied migration displays a cloud setup error rather than pretending the account is empty. The feature can be reviewed on its own branch while the current production version stays unchanged.

## 5. Verify with real project accounts

1. Sign up with your own email and confirm it from the received link.
2. Log in and use **Import N tasks** if this browser has an old backup. The backup is retained. Repeated imports never overwrite existing tasks, including tasks later deleted from the account.
3. Complete a named level, log in on a second browser, and confirm the same progress and XP appear.
4. Test password recovery, logout, and a second account's isolation.

The local test suite checks these flows using an isolated Supabase-protocol fixture backed by PostgreSQL. It never sends real emails or creates real project users; actual delivery and hosted-project settings must still be verified after applying this setup.

## Failure and account-switch behavior

Cloud loads never fall back to sample tasks or shared localStorage. Writes display pending state and only update confirmed progress after success. A stale version reloads current data and resets an outdated editor for review. Retry reuses the same request, preventing a lost response from creating duplicate recurring successors. Imports are transactional and recorded separately, so reimport cannot resurrect deleted tasks.

Requests carry the expected account ID in addition to the verified session. An old tab cannot submit a previous account's tasks using a newly logged-in account's cookie. Logout clears task memory, broadcasts to other tabs, and clears this device's auth cookies. Legacy backup prompts are tied to the account that explicitly imports them.
