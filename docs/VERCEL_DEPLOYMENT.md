# Deploy LifeOS V2 to Vercel

1. Import neodineth/life-os-v2- from GitHub in Vercel. Select main, Next.js, and root directory ./.
2. Keep the framework build/output defaults. Build command: npm run build.
3. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY using the values in your local .env.local. Do not upload the file. Do not use a service-role key.
4. Deploy. Once Vercel shows the assigned production domain, set NEXT_PUBLIC_SITE_URL to that exact https:// domain (no /login path), then redeploy. Do not set localhost as the production value. Until configured, the app uses Vercel's production-domain variable or the incoming origin.
5. In Supabase Authentication > URL Configuration, set Site URL to the production domain and allow https://YOUR-DOMAIN/auth/confirm** for confirmation and reset query parameters. Keep http://127.0.0.1:3001/auth/confirm** as an additional URL for local development. Restrict the hostname to your actual domain.
6. Verify the database setup has been applied. Use supabase/LifeOS-V2-Backend-Setup.sql for full V2 setup or the workspace-names migration if only that feature is missing. Do not run legacy migrations out of order.
7. Open the production login page. Test signup and confirmation, login/logout, password reset, task save/reload, workspace rename/reload, and calendar schedule save/reload. Check account isolation with a second account.

Optional AI chat requires GEMINI_API_KEY in Vercel's server environment. Never prefix it with NEXT_PUBLIC_. Leave chat disabled until configured.

Environment changes take effect on a new deployment. Deployment success alone does not verify Supabase data saving or email delivery.
