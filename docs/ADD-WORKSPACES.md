# Add workspaces

Use the plus button beside WORKSPACES in the sidebar. Enter a name (1-50 characters) and select Create workspace. On success the app opens the new workspace and adds it to task editors. Empty names and case-insensitive duplicate display names are rejected when creating a workspace. Failed requests keep the dialog and entered name open.

## Required Supabase update

Run the complete supabase/migrations/202611220002_add_workspaces.sql in the configured project's SQL Editor. A copy is available as LifeOS-V2-Add-Workspaces.sql in the Codex outputs folder. Refresh LifeOS afterward. This is separate from the Tree Canvas migration.

The migration is transactional and rerunnable. Existing workspace keys, display names, tasks, schedules and histories are preserved. New workspaces have stable custom UUID keys; renaming changes only the display label. The database foreign key continues to require tasks to reference a workspace owned by the same account. Direct writes remain prohibited; authenticated RPCs handle creation. Repeating a creation request with the same ID and name does not create a duplicate.

Workspace IDs now come from the account snapshot, with compatibility fallback to the original five. The combined backend setup also includes this migration for new installations. Do not run older setup copies after enabling custom workspaces.

Verified with model validation, two-account database isolation, anonymous/direct-write denial, idempotent create, duplicate-name rejection, rename version conflicts, custom task and schedule persistence, and migration reruns with existing data. Hosted setup must still be applied manually.
