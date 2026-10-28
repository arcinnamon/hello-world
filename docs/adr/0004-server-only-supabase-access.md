# ADR-0004: Server-only Supabase access

**Status:** Accepted
**Date:** 2026-10-27

## Context
ARCHITECTURE.md directed browser code to use a Supabase browser client configured with `NEXT_PUBLIC_` variables. Vercel flags `NEXT_PUBLIC_` variable names because they are embedded in the browser bundle. The app has no browser-side Supabase queries yet.

## Decision
Access Supabase only from server code through `lib/supabase/server.ts`, configured with the non-public variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Remove the browser client. Browser-side features call server routes or actions.

## Alternatives considered
- Keep `NEXT_PUBLIC_` variables and a browser client: required for direct client queries, Realtime, or client-side auth, but exposes the values to the bundle (acceptable for publishable keys, and flagged by Vercel).

## Consequences
- Positive: no Supabase configuration is shipped to the browser; a single access path.
- Negative: no direct browser queries or Realtime until a browser client and `NEXT_PUBLIC_` variables are reintroduced via a new ADR.
- Existing Vercel and `.env.local` entries must use the new names.
