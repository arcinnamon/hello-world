# Orchestration contract

Defines how an Issue moves through six phases: **Intent → Adversary → Build → Test → Harden → Deploy**. Agents and humans follow it, and the GitHub workflow described under [Automation](#automation) enforces the transition rules. Rationale: [ADR-0005](docs/adr/0005-six-phase-orchestration-contract.md).

It refines the handoff in [ARCHITECTURE.md](ARCHITECTURE.md) and does not override [AGENTS.md](AGENTS.md), the accepted [ADRs](docs/adr/README.md) or [deployment behavior](docs/DEPLOYMENT_SETUP.md). Branching, PR-only delivery, secrets, migrations and ADR rules are defined there and apply in every phase.

## Files

| File | Role |
| --- | --- |
| `ORCHESTRATION.md` | Overview and rationale (this file). |
| [orchestration/phases.yml](orchestration/phases.yml) | Source of truth: phase inputs, outputs, gates, retry limits, Issue states and transitions. If this file and the YAML disagree, the YAML wins; the handoff schema must mirror the YAML transitions and retry rules. |
| [orchestration/schemas/handoff.schema.json](orchestration/schemas/handoff.schema.json) | JSON Schema (2020-12) for the handoff record each phase attempt ends with. |
| [.github/workflows/orchestration.yml](.github/workflows/orchestration.yml), [scripts/orchestration/](scripts/orchestration) | GitHub-native state machine (see Automation). |

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

## Automation

[ADR-0006](docs/adr/0006-github-native-orchestration-workflow.md) (Proposed) adds a GitHub-native state machine. It reads handoff comments, validates them, and moves the Issue between `state:*` labels. It does **not** invoke Copilot or any agent: handoffs are posted by hand or by mocks, and the tests use mocked agent outputs. It never merges, deploys, or runs code taken from an Issue, comment or PR.

**How it works.** On each new Issue comment (not PR comments) [orchestration.yml](.github/workflows/orchestration.yml) runs two jobs from the default branch, with no dependency install:

1. `evaluate` (read-only token) parses the comment and decides. `scripts/orchestration/engine.mjs` is pure logic.
2. `apply` (`issues: write` only) takes that structured decision, re-validates it, and writes a **receipt** comment and the label. `apply.mjs` never reads comment text.

A handoff comment contains exactly one fenced ` ```json ` block holding a handoff record. A human can also comment `/orchestration reset-attempts` (blocked → build) or `/orchestration restart-intent` (blocked → intent).

**State of record** is the sequence of receipt comments by `github-actions[bot]` (`<!-- orchestration:receipt {...} -->`: sequence number, handled comment id, resulting state, attempt counters, approved PR head, specification hash). The `state:*` label is a projection that is rewritten to match; editing it by hand changes nothing. An Issue with no receipt is in `intent`.

A handoff advances the Issue only if all of these hold, otherwise the bot posts a rejection with a fixed reason code and the state is unchanged:

- It validates against the handoff schema, names this repository and Issue, and contains no obvious secret.
- It leaves the state the ledger is in and follows a transition in `phases.yml` (replays of old handoffs fail).
- For `passed` and `awaiting_approval`: every completion gate of its phase is listed exactly once with a `passed` result and evidence (the human gate `pending` while awaiting), and no high or critical finding is open.
- `attempt` and `build_attempts` match the ledger's own count, so an agent cannot under-report. A fourth Build never starts; the third failure ends in `state:blocked`.
- The pull request head SHA matches GitHub, Test, Harden and approvals refer to the head Build produced, and a draft PR cannot reach merge approval.

**Authority.** The commenter's repository role is read from the API, never from the comment. Agent handoffs need `write`. Approvals, rejections and Deploy handoffs need `maintain` or `admin`, a `User` account (never a bot), and the `approver` in the record must equal the comment author. `spec_approval` is void if the Issue body changed after the Adversary review. Deploy completes only if GitHub reports the PR merged by a human `User`. Bot-authored comments are ignored. Receipts are trusted only when authored by `github-actions[bot]`.

**Duplicates.** Re-running a workflow or reposting a comment never repeats a transition: each comment id is handled once, replays fail the state check, `apply` refuses a decision whose ledger sequence is stale, and runs for one Issue are serialized.

**Manual configuration** (nothing here is done by the workflow):

1. Merge the PR. `issue_comment` workflows run only from the default branch, so nothing happens before that.
2. Repository roles decide who can act: approvers need Admin (Maintain on organization repositories); agent or mock accounts need Write. Keep Admin small; Triage and Read cannot hand off.
3. Settings → Actions → General: keep default workflow permissions read-only and leave "Allow GitHub Actions to create and approve pull requests" off. The workflow requests its own permissions and uses no secrets; do not add any.
4. Protect `main` (ruleset or branch protection): require a pull request, require the `verify` check, require approval, restrict who can merge and do not allow bypass, and give no agent identity merge or admin rights. This is what enforces the human-only production merge; the workflow only records it.
5. Optional: create the ten `state:*` labels (`state:intent`, `state:adversary`, `state:awaiting-spec-approval`, `state:build`, `state:test`, `state:harden`, `state:awaiting-merge-approval`, `state:deploy`, `state:blocked`, `state:done`) with `gh label create`; otherwise GitHub creates them uncolored on first use.
6. A human sets ADR-0006 to Accepted. Optionally pin the actions in the workflow to commit SHAs.

**Limits.** Users with Write can delete bot comments, which would roll a ledger back; GitHub offers no control for this, so review the audit log. Command gates (`npm run check`, CI `verify`) are attested in the handoff and not re-run or re-checked against CI. Changing the specification after approval is only detected when approval is given, not during Build. GitHub keeps one pending run per concurrency group, so of several comments posted in a burst only the newest queued one runs; repost the others. `phases.yml` has no `build → build` or `awaiting-merge-approval → blocked` edge, but the retry rules and schema imply them, so the engine allows both for `failed` handoffs.

## Validate

`npm test` includes `tests/orchestration.test.mjs`, which checks that the files exist and stay consistent (phase order, retry limits, approval gates), and `tests/orchestration-engine.test.mjs`, which drives the state machine with mocked handoffs and an in-memory Issue (invalid handoffs, unauthorized approvals, duplicate events, retry exhaustion, workflow permissions). It adds no dependencies and makes no network calls.
