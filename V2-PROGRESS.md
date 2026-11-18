# LifeOS V2 rebuild

## Scope
Same Next.js / React / TypeScript / Tailwind / Supabase stack. Preserve tasks, XP, named subtasks, numbered levels, automatic deadline urgency, completed-task lists, and calendar scheduling. Remove camera tracking, background focus sync, focus save RPCs, and their runtime dependencies.

## Current state
Source baseline copied from the existing app. No credentials, Git history, node_modules, or build caches copied. MediaPipe dependency and camera asset build scripts removed from the new package manifest.

## Remaining work
- Remove focus UI/code dependencies and adapt calendar to plans only.
- Produce a clean V2 Supabase migration without focus tables/RPCs.
- Improve account/loading errors and avoid repeated background requests.
- Install dependencies and update lockfile.
- Run tests, TypeScript, build, and browser checks.
- Write numbered manual Supabase setup and verification instructions.

Do not use the copied legacy database migrations for V2 setup until they have been replaced and verified.
