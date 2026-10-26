# Architecture

- Frontend + server: Next.js App Router, React, TypeScript.
- Deployment: GitHub-connected Vercel project; `main` is production; PR branches create previews.
- Backend: Supabase. Vercel Preview uses a **staging Supabase project**; Production uses a distinct **production Supabase project**.
- Browser: use `lib/supabase/client.ts` and only public publishable keys.
- Server: use `lib/supabase/server.ts`; cookie handling for full SSR authentication needs session-refresh integration when auth is implemented.
- Schema: migrations in `supabase/migrations/`; keep backwards-compatible migrations whenever possible; stage and review before production. Never assume merging a PR automatically migrates production.
- Security: least privilege, RLS for user-accessible tables, no secret keys in browser.
- Agent handoff: Issue -> agent branch + PR -> CI + Preview -> human approval -> merge -> Vercel production.
- ADRs: `docs/adr/`; significant architectural deviations require proposed ADR and human approval.
