# ADR-0003: Use a single Supabase project

**Status:** Accepted
**Date:** 2026-10-27
**Supersedes:** [ADR-0002](0002-separate-supabase-environments.md)

## Context
ADR-0002 required separate staging and production Supabase projects. The Supabase Free plan allows two projects, the app is a hello-world starter with no authentication, no tables, and no user data, and maintaining two environments adds setup and operational overhead.

## Decision
Use one Supabase project for local development, Vercel Preview, and Vercel Production. The same Project URL and publishable key are assigned to every Vercel environment scope and to `.env.local`. Vercel still builds previews from PR branches and production from `main`; only the database is shared.

Database changes remain reviewed in the PR and are never applied automatically. Applying a migration requires explicit human authorization because it affects the only database.

## Alternatives considered
- Keep separate staging and production projects (ADR-0002): safest isolation, but more setup and a second project to maintain.
- Per-PR Supabase branching: better isolation, but added setup and potential plan costs.

## Consequences
- Positive: simpler setup, one set of credentials and environment variables, no environment drift.
- Negative: previews and local development read and write the same data as production, and a migration applied from any branch affects live data immediately.
- Revisit this decision (and restore isolation, for example with a second project or Supabase branching) before storing real user data, adding authentication, or gaining additional contributors.

## References
- [ADR-0002](0002-separate-supabase-environments.md)
