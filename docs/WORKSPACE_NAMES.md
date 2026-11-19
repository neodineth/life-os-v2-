# Rename a workspace
Open a workspace and click the small pencil beside its large page title, edit its name, and Save.
Names are per account and appear across the sidebar, task cards and task forms.
Existing tasks, schedules, colors and workspace identifiers stay attached.
Names must contain 1–50 characters. Cancel leaves the name unchanged; failed saves keep the draft open.

## Existing Supabase project
Run the complete supabase/migrations/202611180001_workspace_names.sql in your project's SQL Editor after the base V2 setup. Refresh LifeOS after SQL succeeds.
If the base setup has not run yet, use supabase/LifeOS-V2-Backend-Setup.sql instead; it includes this update.
Do not run the legacy migrations out of order.
No migration has been applied to your hosted database by the assistant.

The migration adds display_name and version to lifeos_workspaces, extends lifeos_load, and adds the authenticated lifeos_workspace_rename function. It preserves account isolation, checks stale versions and supports retries.
