# Greetings slice (read-only)

Smallest end-to-end slice: Postgres table -> server-side Supabase query -> home page.

## Acceptance criteria
- `/` lists the rows of `public.greetings` ordered by `id` (3 seeded rows).
- If the table is missing, env vars are missing, or the query fails, `/` still renders and shows "Greetings unavailable."; an empty table shows "No greetings yet."
- `/api/health` is unchanged.
- Access is server-only (ADR-0004); no new env vars or dependencies.
- Anonymous clients can read but not insert, update, or delete (RLS).

## Out of scope
Writes, authentication, user-owned data, Realtime.

## Migration: `supabase/migrations/20261027000000_create_greetings.sql`
Additive (new table only), so the currently deployed app is unaffected. The database is shared by local, Preview, and Production (ADR-0003): applying it is live everywhere immediately, and merging the PR does **not** apply it.

### Apply (human-authorized only; do this before merging)
1. Review and explicitly approve the SQL in the PR.
2. `npx supabase login`
3. `npx supabase link --project-ref <ref>`; confirm `<ref>` matches the host of `SUPABASE_URL`.
4. `npx supabase migration list`: `20261027000000` should be pending.
5. `npx supabase db push --dry-run`: only the new migration should be listed.
6. `npx supabase db push`
7. `npx supabase migration list`: all migrations applied.

### Apply via the Supabase dashboard (alternative to the CLI)
Same approval rule applies. The SQL Editor does not record the migration in Supabase's migration history.
1. Open the project's **SQL Editor** and choose **New query**. Confirm the project ref in the URL (`/project/<ref>`) matches the host of `SUPABASE_URL`.
2. Paste the exact contents of the migration file and click **Run**. Run it once only: a re-run fails on `create table` and could duplicate seed rows.
3. Check **Table Editor > greetings** (3 rows, RLS enabled) and **Authentication > Policies** (one SELECT policy for `anon` and `authenticated`).
4. Only if the CLI will be used against this project later: `npx supabase link --project-ref <ref>`, then `npx supabase migration repair --status applied 20261027000000`. Otherwise a later `db push` will try to re-apply it and fail.

### Verify the database (values from env; never print keys)
- Read: `curl -s "$SUPABASE_URL/rest/v1/greetings?select=id,message" -H "apikey: $SUPABASE_PUBLISHABLE_KEY"` returns 3 rows.
- Write denied: `curl -s -X POST "$SUPABASE_URL/rest/v1/greetings" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" -d '{"message":"x"}'` returns 401/403 and the row count stays 3.

### Verify the app
Check the Vercel Preview (`/` and `/api/health`), have a human merge, then check Production. No Vercel or environment variable changes are needed.

### Rollback
Revert the PR (Vercel redeploys). The table is harmless to leave; dropping it (`drop table public.greetings;`) requires explicit approval.
