# ADR-0002: Separate Supabase staging and production

**Status:** Superseded by [ADR-0003](0003-single-supabase-project.md)
**Date:** 2026-10-26

## Context
Vercel creates previews on branches, but these should not write into production databases.

## Decision
Use separate Supabase projects. Preview deployments connect to staging; production connects to production. Database changes are reviewed and applied to staging before explicit production migration approval.

## Alternatives considered
- One shared database: unsafe and confusing.
- Per-PR database branches: better isolation, but added setup and potential plan costs.

## Consequences
- Positive: production isolation with minimal setup.
- Negative: concurrent PRs can interfere in the shared staging project.
