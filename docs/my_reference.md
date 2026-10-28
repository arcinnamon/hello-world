# Life cycle reference

intent -> adversary -> build -> test -> harden -> deploy

- pull main
- create branch
- run
    - npm ci
    - npm run check (lint, test, etc.)
    - npm run dev
- check localhost:3000
- build
- test
- review
- harden
- commit
- push
- pull request
- merge
- deploy

# Using the agentic flow (print me)

Plain text on purpose: no links, no tables, short lines.
Full contract: ORCHESTRATION.md and orchestration/phases.yml.
If they disagree with this page, they win.

## The rules that never change

- Agents never merge, never deploy, never touch the database.
- TWO human approvals, agents cannot give them:
    1. spec_approval   (after Adversary, before Build)
    2. merge_approval  (after Harden, before Deploy)
- Build gets 3 attempts total. Test and Harden failures go back to
  Build and use up those same 3. At 3, the Issue is blocked and
  stops for a human.
- Intent, Adversary, Deploy run once. No retries.
- Every phase ends with ONE handoff: a JSON record
  (schema: orchestration/schemas/handoff.schema.json).
- No secrets in handoffs, comments, or PRs.

## Phase map: who, what, handoff result

  PHASE      AGENT FILE      RUNS WHEN YOU...            HANDOFF
  1 intent   intent          pick it (may auto-run)      passed -> adversary
  2 adversary adversary      pick it (may auto-run)      awaiting_approval
     --- YOU: spec_approval, then you record approval handoff ---
  3 build    build           MUST pick it by hand        passed -> test
  4 test     test            pick it (may auto-run)      passed -> harden
                                                         failed -> build
  5 harden   harden          pick it (may auto-run)      awaiting_approval
     --- YOU: merge_approval, then you record approval handoff ---
  6 deploy   deploy          MUST pick it by hand        readiness report
     --- YOU: apply migration (if any), merge, check prod ---

Agent files live in .github/agents/. Build and deploy have
disable-model-invocation: true, so Copilot never starts them on
its own. You choose them.

## Where a handoff goes

- GitHub:  posted as a comment on the Issue. Update the label
           state:<phase> (labels are a convention; they may not
           exist yet, create them if you want them).
- IDE:     the agent puts the JSON in its final chat response.
           YOU paste it as a comment on the Issue. Do this every
           time, or the next phase has nothing to start from.

## Approval handoff (you, by hand, twice)

The agent stops at status "awaiting_approval". It cannot approve.
1. Read the spec/review (phase 2) or the PR + Preview (phase 5).
2. Say yes or no on the Issue (comment) or PR (review).
3. Record ONE more handoff: copy the awaiting one, then set
       status: passed
       to_phase: build   (after adversary)  or  deploy (after harden)
       issue_state: build  or  deploy
       approvals: gate, decision: approved, approver (YOUR GitHub
       login), approver_type: human, evidence_url (link to your
       comment/review), decided_at (time).
   You may ask an agent to draft it, but YOU supply login, link
   and time. After harden, also keep pull_request.head_sha: it
   must still equal the PR head when you merge. Any new commit
   voids the approval.
4. No: record a failed handoff with a "rejected" approval entry.
   adversary rejected -> goes to intent.
   harden rejected    -> goes to build (costs one attempt).

## From GitHub (web)

 1. New Issue, template "Agent-ready feature". Fill in spec,
    acceptance criteria, out-of-scope, testing notes.
 2. Intent: assign the Issue to Copilot cloud coding agent and, if
    your plan shows an agent picker, choose "intent". If there is
    no picker, use the IDE steps below for the early phases.
    Result: specs/<feature>.md + handoff comment.
 3. Adversary: same way, choose "adversary". Handoff:
    awaiting_approval.
 4. YOU: approve the spec, record the approval handoff.
 5. Build: choose "build". It opens a PR from a feature branch.
    Wait for CI "verify" to go green and the Vercel Preview.
 6. Test: choose "test" on the PR. passed -> harden.
    failed -> back to step 5 (attempt count goes up).
 7. Harden: choose "harden". Handoff: awaiting_approval.
 8. YOU: open the Preview (it uses the SHARED production
    database), read the PR body, approve, record the approval
    handoff.
 9. Deploy: choose "deploy" for the readiness report.
10. YOU: apply any migration (only with explicit authorization),
    then merge the PR. Merging to main deploys production on
    Vercel. Check / and /api/health.

Note: assigning an Issue with no agent chosen uses the default
Copilot agent, which does not follow the phases. README section 5
describes that simpler path. (Agent picker availability depends on
your plan; check GitHub's current docs.)

## From the IDE (VS Code, Copilot Chat)

 0. git checkout main && git pull
    npm ci
    git checkout -b feature/<name>
 1. Open Copilot Chat. In the mode/agent picker, choose the phase
    agent by name (intent, adversary, build, test, harden, deploy).
 2. Prompt, one line, same shape every time:
       Issue #<n>, <repo>. Run your phase. Previous handoff below.
       <paste the previous handoff JSON>
    Intent: no previous handoff, just the Issue text.
 3. Read the answer. Copy the handoff JSON it ends with and post it
    on the Issue as a comment (see "Where a handoff goes").
 4. Next phase: new chat, next agent, paste the handoff you just
    posted. Use a NEW chat each phase to keep context clean.
 5. Stop at the two approvals (see above). The agent will tell you
    it is waiting.
 6. Build only: it commits on your feature branch and opens a PR.
    Before asking Test, make sure these pass locally:
       npm run check
    Local run:  npm run dev   then open localhost:3000
 7. Deploy: you merge on GitHub. Not in the IDE.

## Retry cheat sheet

  test failed,   build_attempts 1 or 2  -> back to build
  harden failed, build_attempts 1 or 2  -> back to build
  failed with build_attempts = 3        -> BLOCKED, stop, tell a human
  Only a human can reset (blocked -> build) or restart from intent.

## Order of operations for a database change

  1. Migration SQL is in the PR, reviewed, NOT applied.
  2. You authorize and apply it (compatible with old code).
  3. Then you merge. Merging never migrates the database.

## Quick "where am I?" (Issue label)

  state:intent -> state:adversary -> state:awaiting-spec-approval
  -> state:build -> state:test -> state:harden
  -> state:awaiting-merge-approval -> state:deploy -> state:done
  (state:blocked from any phase: a human decides)
