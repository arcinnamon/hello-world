# Orchestration contract

Defines how an Issue moves through six phases: **Intent → Adversary → Build → Test → Harden → Deploy**. This is a contract only; nothing executes it yet. Agents and humans follow it manually until automation is proposed in a later PR. Rationale: [ADR-0005](docs/adr/0005-six-phase-orchestration-contract.md).

It refines the handoff in [ARCHITECTURE.md](ARCHITECTURE.md) and does not override [AGENTS.md](AGENTS.md), the accepted [ADRs](docs/adr/README.md) or [deployment behavior](docs/DEPLOYMENT_SETUP.md). Branching, PR-only delivery, secrets, migrations and ADR rules are defined there and apply in every phase.

## Files

| File | Role |
| --- | --- |
| `ORCHESTRATION.md` | Overview and rationale (this file). |
| [orchestration/phases.yml](orchestration/phases.yml) | Source of truth: phase inputs, outputs, gates, retry limits, Issue states and transitions. If this file and the YAML disagree, the YAML wins; the handoff schema must mirror the YAML transitions and retry rules. |
| [orchestration/schemas/handoff.schema.json](orchestration/schemas/handoff.schema.json) | JSON Schema (2020-12) for the handoff record each phase attempt ends with. |

## Phases

| Phase | Actor | Produces | Max attempts |
| --- | --- | --- | --- |
| Intent | agent | Testable specification, scope, declared data/ADR impact | 1 |
| Adversary | agent | Adversarial review of the specification | 1 |
| Build | agent | Feature branch, PR, code, tests, unapplied migrations | 3 |
| Test | agent | Criterion-to-evidence mapping, CI and Preview results | 3 |
| Harden | agent | Security/RLS/operability review, PR ready for review | 3 |
| Deploy | human | Merged PR, production deployment, verification | 1 |

A phase completes only when every `completion_gates` entry in `phases.yml` passes, with evidence recorded in its handoff. The existing quality gate (`npm run check`, CI `verify`) is the command gate for Build and Test; it is not duplicated or changed here.

## Human approvals

Two approvals are mandatory and cannot be given by an agent:

1. **`spec_approval`** after Adversary and before Build: a human approves the specification and the adversarial review.
2. **`merge_approval`** after Harden and before Deploy: a human approves merging to `main`. The merge, and so the Vercel production deployment, is performed by a human (AGENTS.md rule 2).

An approval is recorded in the handoff with the approver's GitHub login and a link to the Issue comment or PR review. A later change to the specification or PR head commit invalidates the approval.

**Approval handoff.** Adversary and Harden stop at `awaiting_approval` and cannot add an approval. After a human decides, a human records one more handoff with the same `from_phase`: a copy of the awaiting handoff with `status: passed`, the next `to_phase` and matching `issue_state` (`build` or `deploy`), and an `approvals` entry (`gate`, `decision: approved`, `approver`, `approver_type: human`, `evidence_url`, `decided_at`). Only Build and Deploy start from it. A human may ask an agent to draft the JSON, but must supply the login, link and time, and the agent copies them without inference. The `harden → deploy` handoff also carries the `pull_request.head_sha` that was approved, and the human compares it with the PR head before merging. The schema only accepts `passed` handoffs along the legal forward edges (Intent→Adversary→Build→Test→Harden→Deploy), so Build cannot start from any phase other than Adversary, and Deploy cannot start from any phase other than Harden. Adversary→Build and Harden→Deploy additionally require an approved matching entry. Build, Test, Harden and Deploy handoffs must carry the pull request head commit. The schema cannot verify that the approver is human, so whoever records it must.

Merging does not apply database migrations. Schema-dependent releases follow the human-authorized order in ARCHITECTURE.md and [specs/greetings.md](specs/greetings.md); the Deploy phase only checks that order was respected.

## Agent enforcement

The agent files in `.github/agents/` limit each phase with their `tools` list, and set `disable-model-invocation: true` on the two agents that can change things (Build writes code and pushes a branch; Deploy runs commands near production) so they run only when a human selects them. The read-only reviewers (Intent, Adversary, Test, Harden) may be picked automatically. `tools` grants are coarse: Test, Harden and Deploy hold `execute`, which could technically run `git push` or a migration. The rules against that are instructions, not technical controls. The real controls are the human gates, PR-only delivery, and the human-only merge and migration steps (AGENTS.md rules 2 and 6). Do not rely on an agent file alone to prevent a destructive action; keep credentials with production or database write access out of the agent's environment.

## Retries

Build, Test and Harden each allow at most **3 attempts** per Issue. Intent, Adversary and Deploy run once and escalate rather than retry.

- A failed Test or Harden hands defects back to Build. Every Test or Harden attempt follows its own Build attempt, so the **Build counter alone bounds the whole loop**.
- Every handoff from Build, Test or Harden records `build_attempts` (Build attempts used so far). A failure goes back to Build while `build_attempts` is below 3; at 3 the Issue is set to `state:blocked` and stops for a human. A fourth Build, and therefore a fourth Test or Harden, is never started. `attempt` still records the attempt number of the phase that produced the handoff and must not exceed `build_attempts`.
- Intent, Adversary and Deploy never retry. They pass, block (status `blocked`, `state:blocked`, for an unresolved question or a failed deploy), or, for Adversary only, return to Intent. Returning to Intent starts a new run at attempt 1; it is not a retry of the same run.
- A rejection is recorded by the handoff of the phase that was waiting, with status `failed` and a `rejected` approval entry: `spec_approval` rejected → Adversary handoff, to Intent; `merge_approval` rejected → Harden handoff, to Build (counted against `build_attempts` as above). The schema rejects a rejection recorded from any other phase.
- A specification gap found in Adversary is the same Adversary `failed` handoff to Intent, without an approval entry.
- Only a human can reset counters (`blocked → build`) or restart from Intent.

## Issue states

Issue state is one `state:*` label on the GitHub Issue (`state:intent`, `state:adversary`, `state:awaiting-spec-approval`, `state:build`, `state:test`, `state:harden`, `state:awaiting-merge-approval`, `state:deploy`, `state:blocked`, `state:done`). The labels are a convention; this change does not create them. `phases.yml` lists every allowed transition; any other transition is invalid.

```text
Happy path:
  intent → adversary → awaiting-spec-approval → build → test → harden
         → awaiting-merge-approval → deploy → done

Loops:
  adversary → intent                    specification gap found
  awaiting-spec-approval → intent       spec_approval rejected
  test | harden → build                 gate failed, attempts remain
  awaiting-merge-approval → build       merge_approval rejected
  intent | adversary | build | test | harden | deploy → blocked
                                        attempts exhausted, unresolved question or failed deploy
  blocked → build | intent              human decision only
```

## Handoffs

Each phase attempt ends with one record validated by the handoff schema: Issue, `from_phase`, `to_phase`, `status` (`passed`, `failed`, `awaiting_approval`, `blocked`), `attempt` and `build_attempts`, resulting `issue_state`, gate results with evidence, findings, artifacts, and any approvals. Post it as an Issue comment. Handoffs must not contain secrets, keys or tokens (AGENTS.md rule 5).

Minimal example (Adversary waiting for approval):

```json
{
  "schema_version": 1,
  "issue": { "repository": "arcinnamon/hello-world", "number": 1 },
  "from_phase": "adversary",
  "to_phase": null,
  "status": "awaiting_approval",
  "attempt": 1,
  "issue_state": "awaiting-spec-approval",
  "summary": "Adversarial review complete; no blocking findings.",
  "gate_results": [
    { "gate": "review-recorded", "result": "passed", "evidence": "Issue comment" },
    { "gate": "spec-approval", "result": "pending" }
  ],
  "created_at": "2026-10-28T13:00:00Z"
}
```

## Validate

`npm test` includes `tests/orchestration.test.mjs`, which checks that the files exist and stay consistent (phase order, retry limits, approval gates). It adds no dependencies and does not execute the orchestration.
