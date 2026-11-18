# Optional deadlines and task schedules

## Install the database update

The existing accounts migration and calendar/focus migration must be installed first. Run the entire `supabase/migrations/202611030001_task_schedules.sql` in the correct Supabase project's SQL Editor. It starts with `begin;`, ends with `commit;`, includes a schema-cache refresh, is transactional and rerunnable, and does not convert existing tasks. Only the project owner or an authorized database connection can install it; the app's publishable key cannot run migrations.

Verify in SQL Editor:

```sql
select to_regprocedure('public.lifeos_task_schedule_save(jsonb)') as task_schedule_save,
       to_regprocedure('public.lifeos_scheduled_task_update(jsonb,bigint)') as scheduled_update;
NOTIFY pgrst, 'reload schema';
```

Both function columns must be non-null. Refresh the signed-in app and open Add task. Schedule on calendar becomes available only when `/api/calendar` confirms `taskSchedulesReady: true`. Until then, ordinary tasks still save; there is no silent browser-only schedule fallback.

## Use the task form

- Available from and Deadline are optional. New tasks default to neither. Remove deadline clears an existing deadline.
- Turn on Schedule on calendar and add one or more time slots, each with its own dates, times, repeat frequency, weekdays, and optional inclusive repeat end date. The account time zone defaults to Asia/Colombo. Dates in time slots are independent of the task's deadline.
- New slots default to today 09:00–10:00, repeating weekly on today's weekday. Weekdays can share a row when they use the same times; add another row for different times. Up to twenty slots can be saved together.
- Overnight sessions and overlapping slots use the existing calendar rendering. End must be after start and duration no longer than seven days. Local times that do not exist at a DST transition are rejected.
- A fixed calendar schedule replaces the task's repeat-after-completion setting. Existing unscheduled tasks retain that behavior under Create next task after completion.
- Task-managed schedule rows are linked to existing calendar series by stable IDs. Editing the form updates only its task-managed rows, retaining exceptions. Independently created calendar plans remain untouched. Removed rows are retired at the server's current time, preserving earlier planned sessions and completed history.
- Turning scheduling off retires future slots but keeps the parent task in occurrence-completion mode, so it does not unexpectedly finish at full level progress. Use End task to finish it.

## Complete sessions

Use Done / Undo done in a planned-session popup or the task detail's weekly Scheduled sessions list. Completing a session does not create focus time, duplicate tasks, reset levels, or award additional XP. Level progress is shared; full levels do not end a scheduled task. Completed session snapshots retain their original details even after series edits or deletion. Undo completion leaves move/cancellation exceptions unchanged.

End task finishes the parent and retires future task-managed slots atomically. Shared progress, past plans, completions and focus history remain. Reopen task does not restore retired slots; add new slots explicitly to resume. Camera/focus recordings stay independent of these completion controls.

## Consistency and recovery

Task-and-schedule saves use one authenticated database transaction, a stable operation UUID for retry deduplication, task version checks and the complete set of active task-managed schedule versions. The server rejects stale or foreign records before confirming a save. A failed save keeps the form and its values open; Retry saved request resends the same operation. A conflict preserves the draft and asks the user to close/reopen to load the latest state. Successful mutations invalidate other calendar views immediately.

The new occurrence-completion and operation-receipt tables are isolated by account; completion reads use row-level security and direct writes are revoked. Private database helper functions cannot be called by authenticated users. Existing focus upload queues and backups are unchanged.

## Verification

```powershell
node --experimental-strip-types --test --test-isolation=none tests/task-schedules.test.mjs tests/calendar.test.mjs tests/focus.test.mjs tests/focus-worker.test.mjs tests/accounts-model.test.mjs tests/task-progress.test.mjs
node tests/task-schedules-database.test.mjs
```

Database tests require `LIFEOS_PGLITE_MODULE` to point to an installed PGlite module if it is outside this project. Start `tests/fixtures/supabase.mjs` and run `node tests/task-schedules-api.test.mjs` for real API/SDK/SQL tests. Run other fixture-based suites sequentially because they reset the same test accounts.

For isolated browser tests, start a second development server with `LIFEOS_QA=1`, fixture Supabase environment values, and port 3001. It uses `.next-qa`, which is ignored by Git; production keeps the default `.next` directory. These environment settings affect only that process and do not bypass authentication.
