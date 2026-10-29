# ADR-0006: GitHub-native orchestration workflow

**Status:** Proposed
**Date:** 2026-10-29

## Context
ADR-0005 (Accepted) defines the six-phase contract, two human approvals and a three-attempt Build limit, and deliberately added no execution engine. Until something enforces it, the gates rely on agents and reviewers following instructions. Issues already carry labels and comments, and the repository has no other runtime for orchestration.

## Decision
Add `.github/workflows/orchestration.yml` and `scripts/orchestration/` (Node built-ins only). On each new Issue comment, a read-only `evaluate` job turns the comment into a decision and an `issues: write` `apply` job records it. State of record is an append-only ledger of receipt comments by `github-actions[bot]`; the `state:*` label is a projection. A transition requires schema validity, a matching ledger state, an allowed `phases.yml` edge, passed gates with evidence, ledger-counted attempts, and a verified PR head. Approvals and Deploy require a human `User` with `maintain` or `admin` whose login is the comment author; the workflow never merges. The workflow runs from the default branch, installs no dependencies, passes data only as parsed JSON, and never executes Issue, comment or PR content. It does not invoke Copilot; the tests use mocked agent outputs. The handoff validator moves from `tests/support/` to `scripts/orchestration/` because the workflow now uses it.

## Alternatives considered
- Labels as the only state: any user with Triage could skip a gate by relabeling. Rejected.
- One job with a write token: a parsing bug would run with write access. Rejected for the evaluate/apply split.
- A third-party action or a YAML/JSON-Schema dependency: more supply-chain surface in a privileged workflow. Rejected.
- Storing state in the repository: needs `contents: write`. Rejected.
- Invoking Copilot from the workflow: deferred until the transition logic has been exercised.

## Consequences
- Positive: ADR-0005 gates are enforced for handoffs, retries are bounded by the ledger, approvals cannot be forged by comment, and the logic is testable offline.
- Negative: users with Write can delete bot comments and roll a ledger back (edited receipts are detected via `updated_at` and fail closed, but deletion leaves no trace); any other workflow posting as `github-actions[bot]` could forge receipts; command gates are attested rather than re-run; `phases.yml` lacks `build → build` and `awaiting-merge-approval → blocked` edges that the engine allows (a follow-up should add them); the human-only merge still depends on branch protection that must be configured by hand (see ORCHESTRATION.md, Automation).
- Acceptance: stays Proposed until a human sets it to Accepted. AGENTS.md rule 11 already applies from ADR-0005.

## References
- [ADR-0005](0005-six-phase-orchestration-contract.md), [ADR-0003](0003-single-supabase-project.md)
- `ORCHESTRATION.md`, `orchestration/phases.yml`, `orchestration/schemas/handoff.schema.json`
