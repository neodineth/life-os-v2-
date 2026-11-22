# Tree Canvas

Open Tree Canvas in the LifeOS sidebar. One organiser belongs to each signed-in account and is separate from tasks and calendars.

Select a card to edit its name and notes. Add child/sibling selects the new card. Delete branch confirms all descendants; Undo restores it. Collapse hides descendants without deleting them. Scroll to zoom, drag the background to pan, or use Fit tree and Reset view. Import/export uses JSON. Imports validate before replacing your tree and can be undone.

Names: 120 characters. Notes: 20,000 characters per node. Trees: 1,000 nodes and 30 levels (root is level one). Tree content must stay under 9 MB; import files must stay under 10 MB. Undo/Redo keeps up to 50 content-edit snapshots in this session; notes are grouped by focus session.

## Supabase setup (required for cloud saving)

Run the entire supabase/migrations/202611220001_tree_canvas.sql in the SQL Editor of the project's configured Supabase instance. It is transactional and rerunnable. A copy is provided as LifeOS-V2-Tree-Canvas.sql in the Codex outputs folder. Click Retry in Tree Canvas afterward.

The migration creates lifeos_trees with one row per auth user, row-level read isolation and authenticated, validated save functions. Browser requests must match the logged-in account and writes must pass origin validation. It does not change tasks, calendar records, or existing account data.

Automatic saving is debounced and serialized. A failed save pauses uploads until Retry. Version conflicts retain the local draft; export it before Load cloud tree if you need to preserve divergent changes. Account-specific browser drafts survive reloads, but browser storage is limited: export if the backup warning appears. No recurring background polling is added. Cloud changes load when opening the organiser or clicking Retry; automatic cross-device live collaboration is not included.

The example is created for a new account tree, or as a browser draft when the tree migration is missing. An unreadable browser draft is not silently replaced. Load cloud tree requires confirmation. Authentication/network errors without a saved draft do not create a replacement tree.

## Verification

Model tests cover sample hierarchy, child ordering, deletion, cycles, parent integrity, maximum depth, layout, and collapse. Database tests cover rerunnable migration, independent accounts, direct-write denial, stale versions, idempotent retries, invalid documents, and persistence. Run tests/tree.test.mjs and tests/tree-database.test.mjs; the latter uses LIFEOS_PGLITE_MODULE or an installed @electric-sql/pglite.
