# ADR-0005: Six-phase orchestration contract with two human approvals

**Status:** Proposed
**Date:** 2026-10-28

## Context
ARCHITECTURE.md describes the agent handoff as Issue -> PR -> CI + Preview -> human approval -> merge. It has no explicit specification review, no limit on repeated fix attempts, and no defined Issue states. Because the Supabase project is shared by every environment (ADR-0003), defects in an unreviewed specification or an unbounded retry loop can reach production data.

## Decision
Adopt the contract in `ORCHESTRATION.md` and `orchestration/`: phases Intent, Adversary, Build, Test, Harden, Deploy; a human `spec_approval` between Adversary and Build; a human `merge_approval` between Harden and Deploy; at most three attempts in each of Build, Test and Harden, then `state:blocked` for a human; and a JSON-Schema handoff record. This ADR changes documentation and configuration only. No execution engine, workflow, dependency, or application and deployment behavior is added.

## Alternatives considered
- Keep the single approval before merge: less ceremony, but an unreviewed specification is built first.
- Implement execution (for example GitHub Actions) now: premature before the contract is reviewed.

## Consequences
- Positive: explicit, reviewable gates and bounded retries; agents and humans share one vocabulary.
- Negative: more process per Issue; the contract is not enforced until automation exists, so it relies on agents and reviewers following it.
- The `state:*` labels are a convention and must be created before any automation uses them.
- Acceptance: this ADR stays Proposed until a human reviewer sets it to Accepted. AGENTS.md rule 11 applies only from that point; agents must not accept the ADR themselves.

## References
- [ADR-0003](0003-single-supabase-project.md)
- `AGENTS.md`, `ARCHITECTURE.md`, `ORCHESTRATION.md`
