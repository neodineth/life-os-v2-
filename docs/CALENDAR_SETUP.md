# Calendar and focus cloud setup

The Calendar has Week, Day, and Month views. Week and Day compare Plan with Actual. Plans link to existing tasks, support optional levels/notes, and can repeat daily or on selected weekdays. Calendar repeating does not change the existing task-completion Repeat setting.

## Apply the migration

1. Open your Supabase project, then **SQL Editor → New query**.
2. Paste the complete contents of `supabase/migrations/202611020001_calendar_focus.sql` and run it. The existing accounts migration `202610250001_accounts.sql` must already be installed.
3. The migration creates `lifeos_calendar_series`, `lifeos_calendar_exceptions`, and `lifeos_focus_sessions`, with account-specific read policies and constrained write functions. It is transactional and safe to rerun; it preserves tasks and previous calendar/focus records.
4. Refresh the app and open Calendar. **Plan task** becomes enabled after the authenticated cloud load succeeds. A missing migration shows a setup message; the app keeps browser focus history and queued uploads.
5. Create a plan, sign in on another browser with the same account, and verify it appears. Record a focus session and Stop, then verify its history appears on the other browser. A different account must see its own data only.

A publishable key cannot apply SQL. This requires the project owner's SQL Editor or an authorized database connection. Never put a database password or service-role key in a public environment variable.

If SQL reported success but the API still reports `PGRST202`, confirm the project matches the app's `NEXT_PUBLIC_SUPABASE_URL`. In SQL Editor, check the functions and refresh the API schema cache:

```sql
select to_regprocedure('public.lifeos_calendar_load()') as calendar_function,
       to_regprocedure('public.lifeos_focus_load()') as focus_function;
NOTIFY pgrst, 'reload schema';
```

If either function is null, the complete migration has not been installed in that project. If both exist, wait briefly after the notification, refresh the app, and retry. See [Supabase's schema refresh instructions](https://supabase.com/kb/troubleshooting/refresh-postgrest-schema).

## Behavior

- Use Today, previous/next, and Week / Day / Month to navigate. Desktop starts in Week; mobile starts in Day. Time labels and day boundaries use the account's saved time zone (default `Asia/Colombo`).
- Task deadlines stay in the all-day row. Click an empty Plan slot or Plan task to schedule an existing task. Plans default to one hour, permit exact times, and retain optional levels and notes.
- Drag a planned block to move it, or drag its top/bottom edge to resize. Dragging snaps to fifteen minutes. Escape/pointer cancellation abandons a drag. A failed save restores the confirmed position and offers Retry.
- Dragging a repeating plan changes only that occurrence. Its popup offers This occurrence or Entire series for edits/deletion. Series edits retain occurrence exceptions. Repeat end dates are inclusive.
- Overnight plans and recordings are split across displayed days. Overlapping blocks are arranged beside each other.
- Actual contains recorded Focus, Away, Paused, and Untracked intervals. Clicking opens read-only details with task snapshots, selected levels, notes, and totals. Multi-task sessions use one time interval.
- Start Focus in a planned block opens the focus chooser prefilled; pressing Focus starts the camera workflow. The session retains its planned-occurrence reference. Starting requires an available unfinished task.
- Deleting or renaming a task does not erase previous plan/session snapshots. Existing plans with unavailable tasks can be deleted or reassigned; they cannot start that deleted task.

## History migration and retries

The existing `lifeos.focus.v1:<account>` browser history is imported automatically in idempotent batches. Its original JSON is retained under `lifeos.focus.backup.v1:<account>`. The browser keeps a local history cache and a durable `lifeos.focus.pending.v2:<account>:` journal. Only acknowledged journal entries are removed. Checkpoints sync every five seconds and on state changes/Stop; failures retry after reconnection, on refocus, and through Retry sync. Finalized cloud sessions cannot be replaced by older checkpoints.

Import runs for the current browser and site address. If old history was recorded at `localhost:3000`, open that same address and sign in to import it; `127.0.0.1:3000` has separate browser storage. Repeat on other browsers/devices containing unsynced history.

The browser must be open and running to upload records. Network failure does not prevent an already-loaded task's focus tracker from keeping a local checkpoint, provided browser storage is available. Storage failures show an error: keep the page open and export your history. Camera frames and landmarks remain on the device.

## Verification

```powershell
node --experimental-strip-types --test --test-isolation=none tests/calendar.test.mjs tests/focus.test.mjs tests/focus-worker.test.mjs tests/accounts-model.test.mjs tests/task-progress.test.mjs
node tests/calendar-database.test.mjs
npm run build
```

Database tests require the external `@electric-sql/pglite` package. Set `LIFEOS_PGLITE_MODULE` to its `dist/index.js` file URL when installed outside this project.

Start `tests/fixtures/supabase.mjs`, then run `node tests/calendar-api.test.mjs` and `node tests/focus-cloud.test.mjs` sequentially to exercise the real route modules, focus hook, Supabase SDK, and isolated database with test accounts. Recovery checks cover an in-flight checkpoint racing Stop, offline/reload retry, legacy backup/import, and storage quota failures. The fixture never sends emails or uses hosted accounts.

For browser acceptance checks, run a development server on port 3001 with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test`, and `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3001` in that server process environment. Run `node tests/calendar.browser.mjs` with external Playwright and Edge; set `LIFEOS_PLAYWRIGHT_MODULE` to Playwright's `index.mjs` file URL and optionally `LIFEOS_QA_OUTPUT` for screenshots. Keep real production environment values for the production build.

Black-box checks: empty optional fields; one-time/daily/weekly plans; repeat end dates; changing one occurrence versus the series; desktop drag/resize and Escape; failed-write rollback; overlapping/overnight blocks; task deletion; prefilled Focus; actual state colors/details; browser-history import; offline retry; second-browser sync; cross-account isolation; keyboard and mobile navigation.
