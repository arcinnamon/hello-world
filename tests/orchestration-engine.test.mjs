import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateDecision } from "../scripts/orchestration/apply.mjs";
import { LedgerError, readLedger } from "../scripts/orchestration/engine.mjs";
import { SHA_A, SHA_B, REPO, advance, contract, createIssue, fence, mock } from "./support/orchestration-harness.mjs";

const state = (issue) => issue.stateLabels();
const rejectedWith = (decision, code) => assert.deepEqual([decision.action, decision.code], ["reject", code]);

test("contract is parsed from phases.yml", () => {
  assert.equal(contract.maxAttempts, 3);
  assert.deepEqual(contract.retryPhases, ["build", "test", "harden"]);
  assert.deepEqual(contract.awaitingState, { spec_approval: "awaiting-spec-approval", merge_approval: "awaiting-merge-approval" });
  assert.deepEqual(contract.approvalPhase, { adversary: "spec_approval", harden: "merge_approval" });
  assert.deepEqual(Object.keys(contract.gates), ["intent", "adversary", "build", "test", "harden", "deploy"]);
});

test("mocked agents drive an Issue from Intent to done, one state label at a time", async () => {
  const issue = createIssue();
  const labels = [];
  const track = async (post) => {
    await post;
    labels.push(state(issue));
  };
  await track(issue.post("agent", fence(mock.intentPass(issue))));
  await track(issue.post("agent", fence(mock.adversaryAwaiting(issue))));
  await track(issue.post("alice", fence(mock.specApproved(issue))));
  await track(issue.post("agent", fence(mock.buildPass(issue))));
  await track(issue.post("agent", fence(mock.testPass(issue))));
  await track(issue.post("agent", fence(mock.hardenAwaiting(issue))));
  await track(issue.post("alice", fence(mock.mergeApproved(issue))));
  issue.prs.set(2, { ...issue.prs.get(2), state: "closed", merged: true, merged_by: { login: "alice", type: "User" } });
  await track(issue.post("alice", fence(mock.deployPass(issue))));

  assert.deepEqual(
    labels.map((l) => l[0]),
    ["adversary", "awaiting-spec-approval", "build", "test", "harden", "awaiting-merge-approval", "deploy", "done"].map((s) => `state:${s}`),
  );
  assert.ok(labels.every((l) => l.length === 1));
  assert.equal(issue.receipts().length, 8);
  assert.equal(issue.rejections().length, 0);
});

test("comments that are not handoffs are ignored", async () => {
  const issue = createIssue();
  for (const text of ["looks good", "```json\n{\"a\":1}\n```", "/orchestration approve"]) {
    assert.deepEqual(await issue.post("alice", text), { action: "ignore" });
  }
  assert.equal(issue.comments.length, 3);
});

// --- Invalid handoffs ------------------------------------------------------------------------

test("invalid handoffs are rejected and never change state", async (t) => {
  const forged = (fields) => (issue) => ({ ...mock.intentPass(issue), ...fields });
  const cases = [
    ["malformed JSON", () => '```json\n{"schema_version": 1,\n```', "invalid_json"],
    ["two handoff blocks", (i) => `${fence(mock.intentPass(i))}\n${fence(mock.intentPass(i))}`, "ambiguous_handoff"],
    ["schema violation (skips to build)", (i) => fence(forged({ to_phase: "build", issue_state: "build" })(i)), "schema_invalid"],
    ["unknown property", (i) => fence(forged({ extra: true })(i)), "schema_invalid"],
    ["other Issue number", (i) => fence(forged({ issue: { repository: REPO, number: 99 } })(i)), "wrong_issue"],
    ["other repository", (i) => fence(forged({ issue: { repository: "evil/repo", number: i.number } })(i)), "wrong_issue"],
    ["embedded token", (i) => fence(forged({ summary: `token ghp_${"x".repeat(36)}` })(i)), "secret_detected"],
    ["gate from another phase", (i) => fence(forged({ gate_results: [{ gate: "local-check", result: "passed", evidence: "x" }] })(i)), "unknown_gate"],
    ["no gate results", (i) => fence(forged({ gate_results: [] })(i)), "missing_gate_evidence"],
    ["blank evidence", (i) => fence(forged({ gate_results: mock.intentPass(i).gate_results.map((g) => ({ ...g, evidence: " " })) })(i)), "gate_not_passed"],
    ["failed gate on a passed handoff", (i) => fence(forged({ gate_results: mock.intentPass(i).gate_results.map((g) => ({ ...g, result: "failed" })) })(i)), "gate_not_passed"],
    ["duplicate gate", (i) => fence(forged({ gate_results: [...mock.intentPass(i).gate_results, mock.intentPass(i).gate_results[0]] })(i)), "duplicate_gate"],
    ["open high finding", (i) => fence(forged({ findings: [{ id: "F1", severity: "high", description: "x", status: "open" }] })(i)), "open_blocking_findings"],
    ["wrong phase for the current state", (i) => fence(mock.buildPass(i)), "state_mismatch"],
  ];
  for (const [name, text, code] of cases) {
    await t.test(name, async () => {
      const issue = createIssue();
      rejectedWith(await issue.post("agent", text(issue)), code);
      assert.equal(issue.receipts().length, 0);
      assert.equal(issue.rejections().length, 1);
      assert.deepEqual(state(issue), ["state:intent"]);
    });
  }
});

test("a handoff that leaves a state the Issue is not in is rejected", async () => {
  const issue = createIssue();
  await advance(issue, "test");
  rejectedWith(await issue.post("agent", fence(mock.hardenAwaiting(issue))), "state_mismatch");
  rejectedWith(await issue.post("agent", fence(mock.intentPass(issue))), "state_mismatch");
  assert.deepEqual(state(issue), ["state:test"]);
});

test("Build cannot start without the approval handoff, and the spec must be unchanged", async () => {
  const issue = createIssue();
  await advance(issue, "awaiting-spec-approval");
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue))), "state_mismatch");
  issue.body = "Spec v2, edited after review";
  rejectedWith(await issue.post("alice", fence(mock.specApproved(issue))), "spec_changed");
  assert.deepEqual(state(issue), ["state:awaiting-spec-approval"]);
  // Rejecting is always possible and restarts from Intent.
  assert.equal((await issue.post("alice", fence(mock.specRejected(issue)))).action, "accept");
  assert.deepEqual(state(issue), ["state:intent"]);
});

test("pull request evidence is checked against GitHub", async () => {
  const issue = createIssue();
  await advance(issue, "build");
  issue.prs.set(2, { ...issue.prs.get(2), head_sha: SHA_B });
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue, 1, SHA_A))), "stale_head");
  issue.prs.delete(2);
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue, 1, SHA_B))), "pr_not_found");
  issue.prs.set(2, { head_sha: SHA_B, state: "open", merged: false, merged_by: null, draft: false });
  assert.equal((await issue.post("agent", fence(mock.buildPass(issue, 1, SHA_B)))).action, "accept");
  // Test must verify the head Build produced.
  issue.prs.set(2, { ...issue.prs.get(2), head_sha: SHA_A });
  rejectedWith(await issue.post("agent", fence(mock.testPass(issue, 1, SHA_A))), "head_changed");
  assert.deepEqual(state(issue), ["state:test"]);
});

test("a draft PR cannot reach merge approval", async () => {
  const issue = createIssue();
  await advance(issue, "harden");
  issue.prs.set(2, { ...issue.prs.get(2), draft: true });
  rejectedWith(await issue.post("agent", fence(mock.hardenAwaiting(issue))), "pr_not_ready");
});

// --- Unauthorized approvals ------------------------------------------------------------------

test("only a human approver can record spec_approval", async (t) => {
  const attempt = async (name, login, build = (i) => mock.specApproved(i, login), { type = "User", code }) =>
    t.test(name, async () => {
      const issue = createIssue();
      await advance(issue, "awaiting-spec-approval");
      const decision = await issue.post(login, fence(build(issue)), type);
      if (code) rejectedWith(decision, code);
      else assert.equal(decision.action, "ignore");
      assert.deepEqual(state(issue), ["state:awaiting-spec-approval"]);
    });

  await attempt("read-only user", "mallory", undefined, { code: "unauthorized" });
  await attempt("user without repository access", "stranger", undefined, { code: "unauthorized" });
  await attempt("write-role agent account", "agent", undefined, { code: "unauthorized" });
  await attempt("write-role human (not an approver)", "bob", undefined, { code: "unauthorized" });
  await attempt("approver naming someone else", "bob", (i) => mock.specApproved(i, "alice"), { code: "unauthorized" });
  await attempt("approver naming another approver", "agent", (i) => mock.specApproved(i, "alice"), { code: "unauthorized" });
  await attempt("bot account", "alice", undefined, { type: "Bot" });
  await attempt("evidence outside the repository", "alice", (i) => {
    const h = mock.specApproved(i);
    h.approvals[0].evidence_url = "https://github.com/evil/repo/issues/1#issuecomment-1";
    return h;
  }, { code: "approval_evidence_invalid" });
  await attempt("approval dated in the future", "alice", (i) => {
    const h = mock.specApproved(i);
    h.approvals[0].decided_at = "2999-01-01T00:00:00Z";
    return h;
  }, { code: "approval_invalid" });
  await attempt("merge_approval used for the spec gate", "alice", (i) => {
    const h = mock.specApproved(i);
    h.approvals[0].gate = "merge_approval";
    return h;
  }, { code: "schema_invalid" });
});

test("an approver cannot approve on behalf of another login", async () => {
  const issue = createIssue();
  await advance(issue, "awaiting-spec-approval");
  issue.roles.set("carol", "admin");
  rejectedWith(await issue.post("carol", fence(mock.specApproved(issue, "alice"))), "approval_not_by_author");
  assert.deepEqual(state(issue), ["state:awaiting-spec-approval"]);
});

test("an agent handoff cannot smuggle in an approval", async () => {
  const issue = createIssue();
  await advance(issue, "harden");
  const withApproval = { ...mock.hardenAwaiting(issue), approvals: [mock.mergeApproved(issue).approvals[0]] };
  rejectedWith(await issue.post("agent", fence(withApproval)), "unauthorized");
  const test = { ...mock.testPass(issue), approvals: [mock.specApproved(issue).approvals[0]] };
  assert.equal((await issue.post("alice", fence(test))).action, "reject");
  assert.deepEqual(state(issue), ["state:harden"]);
});

test("merge_approval needs a human, an open PR and the head Build produced", async () => {
  const issue = createIssue();
  await advance(issue, "awaiting-merge-approval");
  rejectedWith(await issue.post("bob", fence(mock.mergeApproved(issue, 1, SHA_A, "bob"))), "unauthorized");
  rejectedWith(await issue.post("agent", fence(mock.mergeApproved(issue, 1, SHA_A, "alice"))), "unauthorized");
  assert.equal((await issue.post("alice", fence(mock.mergeApproved(issue, 1, SHA_A, "alice"), "bot"), "Bot")).action, "ignore");

  // A commit pushed after review invalidates the approval.
  issue.prs.set(2, { ...issue.prs.get(2), head_sha: SHA_B });
  rejectedWith(await issue.post("alice", fence(mock.mergeApproved(issue, 1, SHA_A))), "stale_head");
  rejectedWith(await issue.post("alice", fence(mock.mergeApproved(issue, 1, SHA_B))), "head_changed");
  assert.deepEqual(state(issue), ["state:awaiting-merge-approval"]);
});

test("Deploy completes only after a human merged the PR", async () => {
  const issue = createIssue();
  await advance(issue, "deploy");
  rejectedWith(await issue.post("agent", fence(mock.deployPass(issue))), "unauthorized");
  rejectedWith(await issue.post("alice", fence(mock.deployPass(issue))), "pr_not_merged_by_human");
  issue.prs.set(2, { ...issue.prs.get(2), state: "closed", merged: true, merged_by: { login: "github-actions[bot]", type: "Bot" } });
  rejectedWith(await issue.post("alice", fence(mock.deployPass(issue))), "pr_not_merged_by_human");
  assert.deepEqual(state(issue), ["state:deploy"]);
  issue.prs.set(2, { ...issue.prs.get(2), merged_by: { login: "alice", type: "User" } });
  assert.equal((await issue.post("alice", fence(mock.deployPass(issue)))).action, "accept");
  assert.deepEqual(state(issue), ["state:done"]);
});

test("forged receipts, spoofed bots and manual labels do not move state", async () => {
  const issue = createIssue();
  await advance(issue, "awaiting-spec-approval");
  const real = issue.receipts().at(-1).body;
  const forgedReceipt = real.replace(/"seq":\d+/, '"seq":3').replace(/"to":"[a-z-]+"/, '"to":"deploy"');
  for (const user of [{ login: "mallory", type: "User" }, { login: "github-actions[bot]", type: "User" }]) {
    issue.comments.push({ id: issue.nextId++, body: forgedReceipt, user });
  }
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue))), "state_mismatch");

  // Someone with triage rights relabels the Issue: the ledger wins and the label is repaired.
  issue.labels.clear();
  issue.labels.add("state:build");
  issue.labels.add("bug");
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue))), "state_mismatch");
  assert.deepEqual([...issue.labels].sort(), ["bug", "state:awaiting-spec-approval"]);
});

test("an edited receipt fails closed instead of moving state", async () => {
  const issue = createIssue();
  await advance(issue, "awaiting-spec-approval");
  const receipt = issue.receipts().at(-1);
  receipt.body = receipt.body.replace(/"to":"[a-z-]+"/, '"to":"deploy"').replace(/"spec_approved":false/, '"spec_approved":true');
  receipt.updated_at = "2026-10-29T12:05:00Z";

  const comment = { id: issue.nextId++, body: fence(mock.buildPass(issue)), user: { login: "agent", type: "User" } };
  issue.comments.push(comment);
  await assert.rejects(issue.evaluate(comment), /edited/);
  assert.throws(() => readLedger(contract, issue.comments), LedgerError);

  // Receipts without timestamps are not trusted either.
  delete receipt.created_at;
  delete receipt.updated_at;
  assert.throws(() => readLedger(contract, issue.comments), LedgerError);
});

// --- Duplicate events ------------------------------------------------------------------------

test("re-running the same event does not repeat the transition", async () => {
  const issue = createIssue();
  await advance(issue, "awaiting-spec-approval");
  const comment = issue.lastComment();
  const again = await issue.rerun(comment);
  assert.equal(again.action, "duplicate");
  assert.equal(issue.receipts().length, 2);

  // A re-run also repairs a label write that failed after the receipt was recorded.
  issue.labels.clear();
  await issue.rerun(comment);
  assert.deepEqual(state(issue), ["state:awaiting-spec-approval"]);
  assert.equal(issue.receipts().length, 2);
});

test("a rejected comment is rejected once", async () => {
  const issue = createIssue();
  const text = fence(mock.buildPass(issue));
  await issue.post("agent", text);
  assert.equal((await issue.rerun(issue.lastComment())).action, "duplicate");
  assert.equal(issue.rejections().length, 1);
});

test("replaying an accepted handoff in a new comment is rejected", async () => {
  const issue = createIssue();
  await advance(issue, "build");
  const replay = fence(mock.specApproved(issue));
  rejectedWith(await issue.post("alice", replay), "state_mismatch");
  await issue.post("agent", fence(mock.buildPass(issue)));
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue))), "state_mismatch");
  assert.equal(issue.receipts().length, 4);
});

test("two events evaluated against the same ledger cannot both apply", async () => {
  const issue = createIssue();
  await advance(issue, "awaiting-spec-approval");
  const first = await issue.evaluate(
    issue.comments[issue.comments.push({ id: 900, body: fence(mock.specApproved(issue)), user: { login: "alice", type: "User" } }) - 1],
  );
  const second = await issue.evaluate(
    issue.comments[issue.comments.push({ id: 901, body: fence(mock.specApproved(issue)), user: { login: "alice", type: "User" } }) - 1],
  );
  assert.deepEqual([first.action, second.action], ["accept", "accept"]);
  await issue.apply(first);
  await assert.rejects(issue.apply(second), /ledger changed/);
  assert.equal(issue.receipts().length, 3);
  assert.deepEqual(state(issue), ["state:build"]);
});

test("decisions are re-validated before they are applied", async () => {
  const issue = createIssue();
  const decision = await issue.post("agent", fence(mock.intentPass(issue)));
  const bad = [
    { ...decision, action: "approve" },
    { ...decision, receipt: { ...decision.receipt, seq: 5 } },
    { ...decision, receipt: { ...decision.receipt, to: "nowhere" } },
    { ...decision, comment_id: decision.comment_id + 1 },
    { ...decision, action: "reject", code: "<script>" },
    { ...decision, issue: "1" },
  ];
  for (const d of bad) assert.throws(() => validateDecision(contract, d), /Invalid orchestration decision|Malformed/);
});

test("a corrupt ledger fails closed", () => {
  const bot = { login: "github-actions[bot]", type: "Bot" };
  const receipt = (seq) => ({ user: bot, body: `<!-- orchestration:receipt {"v":1,"seq":${seq}} -->` });
  assert.throws(() => readLedger(contract, [receipt(1)]), LedgerError);

  const issue = createIssue();
  issue.seedReceipt({});
  issue.seedReceipt({ seq: 3 });
  assert.throws(() => readLedger(contract, issue.comments), /not contiguous/);
});

// --- Retry exhaustion ------------------------------------------------------------------------

test("three failed Build/Test loops block the Issue and a fourth Build never starts", async () => {
  const issue = createIssue();
  await advance(issue, "build");
  for (const n of [1, 2]) {
    assert.equal((await issue.post("agent", fence(mock.buildPass(issue, n)))).action, "accept");
    assert.equal((await issue.post("agent", fence(mock.testFail(issue, n)))).action, "accept");
    assert.deepEqual(state(issue), ["state:build"]);
  }
  assert.equal((await issue.post("agent", fence(mock.buildPass(issue, 3)))).action, "accept");
  assert.equal((await issue.post("agent", fence(mock.testFail(issue, 3, 3)))).action, "accept");
  assert.deepEqual(state(issue), ["state:blocked"]);

  // Every way to ask for a fourth attempt is refused.
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue, 3))), "state_mismatch");
  rejectedWith(await issue.post("agent", fence({ ...mock.testFail(issue, 3, 3), to_phase: "build", issue_state: "build" })), "schema_invalid");
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue, 4))), "schema_invalid");
  assert.deepEqual(state(issue), ["state:blocked"]);
});

test("agents cannot under-report build_attempts", async () => {
  const issue = createIssue();
  await advance(issue, "build");
  await issue.post("agent", fence(mock.buildPass(issue, 1)));
  await issue.post("agent", fence(mock.testFail(issue, 1)));
  await issue.post("agent", fence(mock.buildPass(issue, 2)));
  rejectedWith(await issue.post("agent", fence(mock.testFail(issue, 1, 1))), "attempt_mismatch");
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue, 1))), "state_mismatch");
  assert.deepEqual(state(issue), ["state:test"]);
});

test("Build is refused once the ledger holds three Build attempts", async () => {
  const issue = createIssue();
  issue.seedReceipt({ to: "build", counters: { build: 3, test: 2, harden: 0 }, spec_approved: true });
  rejectedWith(await issue.post("agent", fence(mock.buildPass(issue, 3))), "retries_exhausted");
});

test("a rejected merge_approval counts against the same Build budget", async () => {
  const issue = createIssue();
  await advance(issue, "awaiting-merge-approval");
  assert.equal((await issue.post("alice", fence(mock.mergeRejected(issue, 1)))).action, "accept");
  assert.deepEqual(state(issue), ["state:build"]);
  for (const n of [2, 3]) {
    await issue.post("agent", fence(mock.buildPass(issue, n)));
    await issue.post("agent", fence(mock.testPass(issue, n)));
    await issue.post("agent", fence(mock.hardenAwaiting(issue, n)));
    if (n === 2) assert.equal((await issue.post("alice", fence(mock.mergeRejected(issue, n)))).action, "accept");
  }
  assert.equal((await issue.post("alice", fence(mock.mergeRejected(issue, 3, 3)))).action, "accept");
  assert.deepEqual(state(issue), ["state:blocked"]);
});

test("only an approver can reset a blocked Issue, and only to a safe state", async () => {
  const issue = createIssue();
  await advance(issue, "build");
  for (const n of [1, 2, 3]) {
    await issue.post("agent", fence(mock.buildPass(issue, n)));
    await issue.post("agent", fence(mock.testFail(issue, n, n)));
  }
  assert.deepEqual(state(issue), ["state:blocked"]);

  rejectedWith(await issue.post("bob", "/orchestration reset-attempts"), "unauthorized");
  assert.equal((await issue.post("agent", "/orchestration reset-attempts", "Bot")).action, "ignore");
  assert.deepEqual(state(issue), ["state:blocked"]);

  assert.equal((await issue.post("alice", "/orchestration reset-attempts")).action, "accept");
  assert.deepEqual(state(issue), ["state:build"]);
  // Counters restart: three fresh attempts are available again.
  assert.equal((await issue.post("agent", fence(mock.buildPass(issue, 1)))).action, "accept");
  rejectedWith(await issue.post("alice", "/orchestration reset-attempts"), "state_mismatch");
});

test("blocked before spec approval cannot jump to Build; restart returns to Intent", async () => {
  const issue = createIssue();
  assert.equal((await issue.post("agent", fence(mock.blocked(issue, "intent")))).action, "accept");
  assert.deepEqual(state(issue), ["state:blocked"]);
  rejectedWith(await issue.post("alice", "/orchestration reset-attempts"), "spec_not_approved");
  assert.equal((await issue.post("alice", "/orchestration restart-intent")).action, "accept");
  assert.deepEqual(state(issue), ["state:intent"]);
});

// --- Workflow hardening ----------------------------------------------------------------------

test("workflow keeps permissions minimal and never runs untrusted code or interpolates comments", () => {
  const yml = readFileSync(new URL("../.github/workflows/orchestration.yml", import.meta.url), "utf8");
  const code = yml.replace(/^\s*#.*$/gm, "");
  assert.match(code, /^permissions: \{\}$/m);
  assert.match(code, /^ {2}issue_comment:\n {4}types: \[created\]$/m);
  assert.doesNotMatch(code, /pull_request_target|workflow_run|secrets\.|npm |npx |copilot/i);
  assert.doesNotMatch(code, /\bref:|repository:/, "must check out the default branch only");

  const jobs = Object.fromEntries(code.split(/^jobs:\n/m)[1].split(/^ {2}(?=[a-z]+:\n)/m).filter(Boolean).map((j) => [j.split(":")[0], j]));
  const perms = (job) => [...job.matchAll(/^ {6}([a-z-]+): (read|write)$/gm)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(perms(jobs.evaluate), ["contents:read", "issues:read", "pull-requests:read"]);
  assert.deepEqual(perms(jobs.apply), ["contents:read", "issues:write"]);
  assert.equal(code.match(/: write$/gm).length, 1);

  // Expressions may appear in `if`, `env`, `with` and outputs, never inside a `run` script.
  for (const line of code.split("\n").filter((l) => /^\s+- run:|^\s+run:/.test(l))) {
    assert.doesNotMatch(line, /\$\{\{/, line);
  }
  assert.match(code, /DECISION: \$\{\{ needs\.evaluate\.outputs\.decision \}\}/);
});
