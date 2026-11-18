# LifeOS V2 backend setup

Target: NEW Supabase project ferjklffsveibzcjayib (LifeOS V2).
Your app's .env.local already contains its URL and publishable key.

1. Open this project's SQL Editor and choose New snippet.
2. Paste the COMPLETE contents of LifeOS-V2-Backend-Setup.sql and click Run.
3. If SQL reports an error, stop and copy the error message. Do not run old migration files individually.
4. Open a second snippet and run LifeOS-V2-Backend-Verify.sql.
5. Expected: every exists and row_security_enabled value is true, and both no_focus values are true on a fresh V2 backend.
6. In Authentication > URL Configuration, set Site URL to http://127.0.0.1:3001 and add http://127.0.0.1:3001/auth/confirm to Redirect URLs. Save.
7. Check Authentication > Sign In / Providers > Email. Enable email signup; keep email confirmation enabled.
8. Open http://127.0.0.1:3001/signup, register, and follow the confirmation email. Report any email-delivery error; SQL does not configure email delivery.
9. Sign in, create a task without a deadline, reload and verify it persists. Add a weekly schedule and check Calendar. Test a second account to confirm it cannot see the first account's tasks.

Setup creates account profiles, workspaces, tasks, import tracking, calendar series, exceptions, schedule completions and operation retry records; account isolation policies and constrained authenticated functions are included.
No camera tracking, focus checkpoint function or focus-session table is created.
The setup is a single transaction and rerunnable; keep the final scheduled-task definitions in order. It does not remove any existing old focus backend if applied to an already populated project.

Validation: 28 local PostgreSQL-compatible PGlite checks passed, including account isolation, transactions, stale versions, retries, exceptions, historical snapshots and reruns. The script was NOT run against hosted Supabase. Local SQL validation does not verify hosted email or browser login.
