# LifeOS specification

## Experience

LifeOS groups work across two universities, two startups, and personal growth into a game-style quest workspace. A black/charcoal interface uses purple/cyan accents, compact cards, and a player XP bar. Mobile uses a navigation drawer and single-column cards; desktop uses fixed navigation and a two-column quest grid where space allows.

## Views and actions

| View | Content | Actions |
| --- | --- | --- |
| Dashboard | Unified quest cards, deadline filters, player XP | Open, star, edit, add, search |
| University 01 / 02 | Workspace quests | Open, edit, add, filter |
| Startup 01 / 02 | Workspace quests | Open, edit, add, filter |
| Personal Growth | Growth quests with optional deadlines | Track courses, skills, and other goals |
| Calendar | Month grid of pending dated tasks | Navigate months, open quest details |
| Weekly review | Overdue and undated pending work | Open, plan, complete, or edit |
| Completed | Cleared quests and retained level progress | Open, undo levels, reopen, edit |
| Reminders | Work ready to start, overdue work, approaching deadlines | Open quest details |

Clicking a card opens playable details. Pencil buttons open a separate editor. The native dialog traps keyboard focus, supports Escape/backdrop dismissal, restores focus, and prevents background scrolling. Editing from within details returns to that quest after Save or Cancel. Finishing a task leaves its detail popup open.

## Levels and persistence

- Levels are optional. Ordinary tasks have a Complete/Reopen action in their detail popup.
- A leveled task has a total, unit, completed count, merged inclusive completion ranges, and optional per-level names. Totals are whole numbers from 1 to 1,000,000. Names are at most 120 characters; units at most 30.
- Level numbers are one-based. Any level can be completed or undone independently; there are no unlock restrictions.
- Default names use the singularized unit and number (Video 1). Blank custom names revert to the default.
- Explicit imports of existing count-only browser data migrate to a completed prefix: 20/50 means levels 1-20 completed. Existing ordinary tasks retain their state. The original `lifeos.tasks.v1` browser backup is retained after import.
- Completed counts are derived from ranges. Exactly 20 of 50 levels shows 40%, independent of order; 100% is reserved for all levels finished.
- Tile grids show 50 levels per page, with previous/next buttons and a direct page input.
- Bulk count increases fill the lowest unfinished levels; decreases remove the highest completed levels. Reducing totals removes completion and names outside the new range. Increasing totals preserves remaining names and completion.
- Finishing all levels completes the task. Undoing a level clears its completion timestamp and reopens it.
- Recurring successors preserve names and total but reset completed ranges. Re-completing an occurrence does not duplicate an existing successor.
- JSON export includes complete account task state. Cloud storage is account-specific, with explicit, deduplicated legacy-browser import. Arbitrary JSON file import is not implemented.

## Player progression and motion

- Completed individual levels are worth 10 XP each. Completed ordinary tasks are worth 50 XP. Leveled quests receive no additional completion bonus.
- XP is derived from all saved tasks, including Completed. `playerLevel = floor(XP / 100) + 1`; the current level bar shows `XP % 100`.
- Undoing, deleting, or reducing progress lowers XP. Existing completed work contributes immediately, without showing a false level-up on page load.
- Popup entrances, tile checks, progress fills, and XP changes animate briefly. A player level increase shows a short badge; quest completion shows a brief particle burst inside the active popup.
- Reduced-motion preferences disable animations and particles. Effects do not flash or play sounds. Icon actions keep accessible names, and focus indicators stay visible.

## Planning rules

- Dates use the browser's local day. Deadlines are grouped into overdue, today, next seven days, and later/undated.
- Up to three pending tasks can be starred for today, independently of their deadlines.
- Reminders highlight reached start dates, overdue work, deadlines within three days, and the seven-day checkpoint. They run inside the open application only.
- Weekly review gathers overdue and undated pending work.

## Accounts and cloud saving

Email/password signup, confirmation, login, recovery/reset, and logout use cookie-based Supabase sessions. Next.js Proxy refreshes cookies; protected pages and every workspace API call independently verify JWT claims. Private responses are not cached.

The namespaced schema in `supabase/migrations/202610250001_accounts.sql` stores account profiles, five workspaces, complete task JSON (including names and ranges), row versions, and import receipts. Row-level security isolates all reads; direct writes are revoked. Constrained RPC functions derive ownership from auth.uid(), and enforce version checks and atomic recurrence/import writes.

The workspace loads cloud data into memory, refreshes on browser focus, and only displays confirmed writes. Failed loads are not treated as empty accounts. Failed saves retain confirmed progress and allow retry. Stale versions reload the snapshot; an outdated editor resets for review. Requests also carry the expected account ID to prevent stale tabs from submitting another account's data after a cookie change.

Legacy imports require a visible Import action. Successful imports retain the original backup, store its SHA-256 snapshot fingerprint and account owner locally, and skip already imported IDs on the server. Reimport does not overwrite tasks or resurrect deleted tasks. Another account is not offered a claimed browser backup.

See `ACCOUNTS_SETUP.md` for migration, email templates, callback URLs, environment variables, and the production rollout gate. The publishable key cannot apply the migration or configure Vercel/Auth settings. Scheduled notifications, offline editing/background sync, and a PWA remain future work.
