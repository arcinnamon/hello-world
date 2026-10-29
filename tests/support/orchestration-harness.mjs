// Deterministic test doubles for the orchestration engine: an in-memory GitHub Issue and mocked
// agent handoffs. No network, no Copilot; every handoff below is a fixture, not model output.

import { applyDecision } from "../../scripts/orchestration/apply.mjs";
import { decide, loadContract } from "../../scripts/orchestration/engine.mjs";

export const contract = loadContract();
export const REPO = "arcinnamon/hello-world";
export const SHA_A = "a".repeat(40);
export const SHA_B = "b".repeat(40);
const BOT = { login: "github-actions[bot]", type: "Bot" };
const ROLES = { agent: "write", bob: "write", alice: "admin", mallory: "read" };

// An unedited GitHub comment has equal created_at and updated_at.
export const stamp = (at = "2026-10-29T12:00:00Z") => ({ created_at: at, updated_at: at });

export function createIssue({ number = 1, body = "Spec v1" } = {}) {
  const issue = {
    number,
    body,
    comments: [],
    labels: new Set(),
    roles: new Map(Object.entries(ROLES)),
    prs: new Map([[2, { head_sha: SHA_A, state: "open", merged: false, merged_by: null, draft: false }]]),
    nextId: 100,
  };

  const deps = {
    listComments: async () => issue.comments,
    getRole: async (login) => issue.roles.get(login) ?? "none",
    getPullRequest: async (n) => issue.prs.get(n) ?? null,
  };
  const api = {
    listComments: async () => issue.comments,
    createComment: async (text) => issue.comments.push({ id: issue.nextId++, body: text, user: BOT, ...stamp() }),
    getLabelNames: async () => [...issue.labels],
    addLabel: async (name) => issue.labels.add(name),
    removeLabel: async (name) => issue.labels.delete(name),
  };

  const addComment = (login, text, type = "User") => {
    const comment = { id: issue.nextId++, body: text, user: { login, type } };
    issue.comments.push(comment);
    return comment;
  };

  Object.assign(issue, {
    receipts: () => issue.comments.filter((c) => c.user === BOT && c.body.includes("orchestration:receipt")),
    rejections: () => issue.comments.filter((c) => c.user === BOT && c.body.includes("orchestration:rejection")),
    stateLabels: () => [...issue.labels].filter((l) => l.startsWith("state:")),
    evaluate: (comment) => decide(contract, { repository: REPO, issue: { number, body: issue.body }, comment }, deps),
    apply: (decision) => applyDecision(contract, decision, api),
    // Posts a comment as `login` and runs both workflow jobs. Returns the decision.
    async post(login, text, type = "User") {
      const decision = await issue.evaluate(addComment(login, text, type));
      if (decision.action !== "ignore") await issue.apply(decision);
      return decision;
    },
    // Re-runs the workflow for an existing comment (a GitHub "re-run jobs").
    async rerun(comment) {
      const decision = await issue.evaluate(comment);
      if (decision.action !== "ignore") await issue.apply(decision);
      return decision;
    },
    lastComment: () => issue.comments.findLast((c) => c.user !== BOT),
    // Test-only: write a ledger entry directly to reach states that normal flow cannot.
    seedReceipt(fields) {
      const seq = issue.receipts().length + 1;
      const receipt = {
        v: 1, seq, kind: "handoff", comment_id: 1, from: "intent", to: "intent",
        counters: { build: 0, test: 0, harden: 0 }, spec_approved: false, spec_hash: null, head_sha: null, ...fields,
      };
      issue.comments.push({ id: issue.nextId++, body: `<!-- orchestration:receipt ${JSON.stringify(receipt)} -->`, user: BOT, ...stamp() });
    },
  });
  return issue;
}

export const fence = (handoff) => `Handoff:\n\`\`\`json\n${JSON.stringify(handoff, null, 2)}\n\`\`\``;

const now = () => new Date().toISOString();
const gateResults = (phase, human = "passed") =>
  contract.gates[phase].map(({ id, kind }) => ({
    gate: id,
    result: kind === "human" ? human : "passed",
    ...(kind === "human" && human === "pending" ? {} : { evidence: `mock evidence for ${id}` }),
  }));

const base = (issue, fields) => ({
  schema_version: 1,
  issue: { repository: REPO, number: issue.number },
  status: "passed",
  attempt: 1,
  summary: "mocked agent output",
  created_at: now(),
  ...fields,
});

const pr = (sha = SHA_A) => ({ pull_request: { number: 2, head_sha: sha } });

export const approval = (gate, approver = "alice", decision = "approved") => ({
  gate,
  decision,
  approver,
  approver_type: "human",
  evidence_url: `https://github.com/${REPO}/issues/1#issuecomment-1`,
  decided_at: now(),
});

// Mocked agent and human handoffs. `n` is the Build attempt counter where it applies.
export const mock = {
  intentPass: (i) => base(i, { from_phase: "intent", to_phase: "adversary", issue_state: "adversary", gate_results: gateResults("intent") }),
  adversaryAwaiting: (i) =>
    base(i, { from_phase: "adversary", to_phase: null, status: "awaiting_approval", issue_state: "awaiting-spec-approval", gate_results: gateResults("adversary", "pending") }),
  specApproved: (i, approver = "alice") =>
    base(i, { from_phase: "adversary", to_phase: "build", issue_state: "build", gate_results: gateResults("adversary"), approvals: [approval("spec_approval", approver)] }),
  specRejected: (i, approver = "alice") =>
    base(i, { from_phase: "adversary", to_phase: "intent", status: "failed", issue_state: "intent", gate_results: [], approvals: [approval("spec_approval", approver, "rejected")] }),
  buildPass: (i, n = 1, sha = SHA_A) =>
    base(i, { from_phase: "build", to_phase: "test", issue_state: "test", attempt: n, build_attempts: n, gate_results: gateResults("build"), ...pr(sha) }),
  testPass: (i, n = 1, sha = SHA_A) =>
    base(i, { from_phase: "test", to_phase: "harden", issue_state: "harden", attempt: n, build_attempts: n, gate_results: gateResults("test"), ...pr(sha) }),
  testFail: (i, n = 1, buildAttempts = n) => {
    const spent = buildAttempts === 3;
    return base(i, {
      from_phase: "test", status: "failed", attempt: n, build_attempts: buildAttempts, gate_results: [],
      to_phase: spent ? null : "build", issue_state: spent ? "blocked" : "build",
    });
  },
  hardenAwaiting: (i, n = 1, sha = SHA_A) =>
    base(i, { from_phase: "harden", to_phase: null, status: "awaiting_approval", issue_state: "awaiting-merge-approval", attempt: n, build_attempts: n, gate_results: gateResults("harden", "pending"), ...pr(sha) }),
  mergeApproved: (i, n = 1, sha = SHA_A, approver = "alice") =>
    base(i, { from_phase: "harden", to_phase: "deploy", issue_state: "deploy", attempt: n, build_attempts: n, gate_results: gateResults("harden"), approvals: [approval("merge_approval", approver)], ...pr(sha) }),
  mergeRejected: (i, n = 1, buildAttempts = n) => {
    const spent = buildAttempts === 3;
    return base(i, {
      from_phase: "harden", status: "failed", attempt: n, build_attempts: buildAttempts, gate_results: [],
      to_phase: spent ? null : "build", issue_state: spent ? "blocked" : "build",
      approvals: [approval("merge_approval", "alice", "rejected")],
    });
  },
  deployPass: (i, sha = SHA_A) =>
    base(i, { from_phase: "deploy", to_phase: null, issue_state: "done", gate_results: gateResults("deploy"), ...pr(sha) }),
  blocked: (i, from_phase, extra = {}) =>
    base(i, { from_phase, to_phase: null, status: "blocked", issue_state: "blocked", gate_results: [], ...extra }),
};

// Walks the Issue to a given state using mocked handoffs (agent = "agent", human = "alice").
export async function advance(issue, upTo) {
  const steps = [
    ["awaiting-spec-approval", async () => {
      await issue.post("agent", fence(mock.intentPass(issue)));
      await issue.post("agent", fence(mock.adversaryAwaiting(issue)));
    }],
    ["build", () => issue.post("alice", fence(mock.specApproved(issue)))],
    ["test", () => issue.post("agent", fence(mock.buildPass(issue)))],
    ["harden", () => issue.post("agent", fence(mock.testPass(issue)))],
    ["awaiting-merge-approval", () => issue.post("agent", fence(mock.hardenAwaiting(issue)))],
    ["deploy", () => issue.post("alice", fence(mock.mergeApproved(issue)))],
  ];
  for (const [state, step] of steps) {
    await step();
    if (state === upTo) return;
  }
  throw new Error(`Unknown state ${upTo}`);
}
