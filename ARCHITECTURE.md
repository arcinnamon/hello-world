# Architecture

- Frontend + server: Next.js App Router, React, TypeScript.
- Deployment: GitHub-connected Vercel project; `main` is production; PR branches create previews.
- Backend: Supabase. a **single Supabase project** is shared by local development, Vercel Preview, and Production (ADR-0003; previews can therefore touch production data).
- Supabase access is server-only: use `lib/supabase/server.ts` with `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (no `NEXT_PUBLIC_` variables, no browser client; see ADR-0004).
- Schema: migrations in `supabase/migrations/`; keep backwards-compatible migrations whenever possible; review SQL in the PR and apply it only with explicit human authorization. Never assume merging a PR automatically migrates the database.
- Security: least privilege, RLS for user-accessible tables, no secret keys in browser.
- Agent handoff: Issue -> agent branch + PR -> CI + Preview -> human approval -> merge -> Vercel production.
- ADRs: `docs/adr/`; significant architectural deviations require proposed ADR and human approval.
