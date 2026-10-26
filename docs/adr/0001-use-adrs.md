# ADR-0001: Record significant architectural decisions

**Status:** Accepted
**Date:** 2026-10-26

## Context
Agent-authored changes should respect earlier decisions without introducing a documentation platform.

## Decision
Use lightweight Markdown Architecture Decision Records in `docs/adr/`. Propose decisions in PRs; human reviewers approve them. Supersede earlier ADRs with new records rather than rewriting their rationale.

## Alternatives considered
- Architectural decisions only in PR discussions: hard to rediscover.
- Dedicated ADR service: unnecessary operational complexity.

## Consequences
- Positive: durable, reviewable rationale available to humans and agents.
- Negative: documentation upkeep for material decisions.
