// Orchestration state machine core. Pure decision logic: no network, no shell, no eval.
// Untrusted input (comment text) is only ever parsed as JSON and validated against
// orchestration/schemas/handoff.schema.json plus the rules below; it is never executed.
//
// State of record is an append-only ledger of "receipt" comments written by github-actions[bot].
// The `state:*` Issue label is a projection of the ledger and is overwritten when it drifts.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validate } from "./json-schema.mjs";

const ROOT = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

export const BOT_LOGIN = "github-actions[bot]";
const WRITE_ROLES = new Set(["write", "maintain", "admin"]);
const APPROVER_ROLES = new Set(["maintain", "admin"]);
const COMMANDS = {
  "/orchestration reset-attempts": { kind: "reset", to: "build" },
  "/orchestration restart-intent": { kind: "restart", to: "intent" },
};
const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const RECEIPT_RE = /^<!-- orchestration:receipt (\{.*\}) -->/;
const REJECTION_RE = /^<!-- orchestration:rejection (\d+) -->/;
const FENCE_RE = /```json[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```/g;
const SHA40 = /^[0-9a-f]{40}$/;

export class Reject extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export class LedgerError extends Error {}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const check = (condition, code) => {
  if (!condition) throw new Reject(code);
};

// phases.yml is parsed as text (as in tests/orchestration.test.mjs) so no YAML dependency is needed.
export function loadContract(readFile = read) {
  const yml = readFile("orchestration/phases.yml");
  const schema = JSON.parse(readFile("orchestration/schemas/handoff.schema.json"));
  const section = (name) => yml.slice(yml.indexOf(`\n${name}:\n`));

  const states = [...yml.matchAll(/^ {2}- id: ([a-z-]+)\n {4}label: "state:/gm)].map((m) => m[1]);
  const transitions = [...yml.matchAll(/^ {2}- \{from: ([a-z-]+), to: ([a-z-]+), when: [a-z_]+\}$/gm)].map(
    ([, from, to]) => ({ from, to }),
  );
  const awaitingState = Object.fromEntries(
    [...yml.matchAll(/^ {2}- id: ([a-z-]+)\n {4}label: "[^"]+"\n {4}waiting_on: ([a-z_]+)$/gm)].map((m) => [m[2], m[1]]),
  );
  const approvalPhase = Object.fromEntries(
    [...yml.matchAll(/^ {2}([a-z_]+_approval):\n {4}after_phase: ([a-z]+)$/gm)].map((m) => [m[2], m[1]]),
  );
  const maxAttempts = Number(yml.match(/^retry:\n(?: {2}#.*\n)* {2}max_attempts: (\d+)$/m)?.[1]);
  const retryPhases = yml.match(/^ {2}applies_to: \[([a-z, ]+)\]$/m)?.[1].split(/,\s*/);

  const gates = {};
  for (const block of section("phases").split(/\n {2}- id: /).slice(1)) {
    const phase = block.split("\n")[0].trim();
    gates[phase] = [...block.matchAll(/^ {6}- \{id: ([a-z-]+), kind: (check|command|human)\b/gm)].map(
      ([, id, kind]) => ({ id, kind }),
    );
  }

  const contract = { schema, states, transitions, awaitingState, approvalPhase, maxAttempts, retryPhases, gates };
  const empty = Object.entries(contract).filter(
    ([, v]) => v == null || Number.isNaN(v) || (typeof v === "object" && !Object.keys(v).length),
  );
  if (empty.length || states.length !== schema.properties.issue_state.enum.length) {
    throw new Error(`Cannot parse orchestration contract: ${empty.map(([k]) => k).join(", ") || "state mismatch"}`);
  }
  return contract;
}

// ---- Ledger -------------------------------------------------------------------------------

const isInt = (v, min, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;

export function parseReceipt(contract, r) {
  const { states, maxAttempts } = contract;
  const counters = r?.counters;
  const ok =
    r?.v === 1 &&
    isInt(r.seq, 1) &&
    ["handoff", "reset", "restart"].includes(r.kind) &&
    isInt(r.comment_id, 1) &&
    states.includes(r.from) &&
    states.includes(r.to) &&
    ["build", "test", "harden"].every((k) => isInt(counters?.[k], 0, maxAttempts)) &&
    typeof r.spec_approved === "boolean" &&
    (r.spec_hash === null || /^[0-9a-f]{64}$/.test(r.spec_hash)) &&
    (r.head_sha === null || SHA40.test(r.head_sha));
  if (!ok) throw new LedgerError("Malformed orchestration receipt");
  return r;
}

export const isActionsBot = (user) => user?.login === BOT_LOGIN && user?.type === "Bot";

export function readLedger(contract, comments) {
  const receipts = [];
  const rejected = new Set();
  for (const comment of comments) {
    if (!isActionsBot(comment.user)) continue;
    const receipt = comment.body?.match(RECEIPT_RE);
    if (receipt) {
      // Users with Write can edit other users' comments, so an edited receipt cannot be trusted.
      if (!comment.created_at || comment.updated_at !== comment.created_at) {
        throw new LedgerError("Orchestration receipt was edited or has no timestamps");
      }
      receipts.push(parseReceipt(contract, JSON.parse(receipt[1])));
    }
    const rejection = comment.body?.match(REJECTION_RE);
    if (rejection) rejected.add(Number(rejection[1]));
  }
  receipts.sort((a, b) => a.seq - b.seq);
  receipts.forEach((r, i) => {
    if (r.seq !== i + 1) throw new LedgerError("Orchestration receipt sequence is not contiguous");
  });
  const last = receipts.at(-1);
  return {
    seq: last?.seq ?? 0,
    state: last?.to ?? "intent",
    counters: last?.counters ?? { build: 0, test: 0, harden: 0 },
    spec_approved: last?.spec_approved ?? false,
    spec_hash: last?.spec_hash ?? null,
    head_sha: last?.head_sha ?? null,
    handled: new Set(receipts.map((r) => r.comment_id)),
    rejected,
  };
}

// ---- Decision -----------------------------------------------------------------------------

function classify(body) {
  const command = COMMANDS[body.trim()];
  if (command) return { type: "command", ...command };
  const blocks = [...body.matchAll(FENCE_RE)].map((m) => m[1]).filter((b) => b.includes('"schema_version"'));
  return blocks.length ? { type: "handoff", blocks } : null;
}

/**
 * Decide what a new Issue comment means for the Issue's state machine.
 * deps: { listComments(), getRole(login), getPullRequest(number) } (all read-only).
 * Returns { action: "ignore" } or a decision whose action is accept | reject | duplicate.
 */
export async function decide(contract, { repository, issue, comment, now = new Date() }, deps) {
  const intent = classify(comment.body ?? "");
  // Bots are never trusted to hand off or approve; ignore them silently so bots cannot loop.
  if (!intent || comment.user?.type !== "User") return { action: "ignore" };

  const ledger = readLedger(contract, await deps.listComments());
  const base = { v: 1, issue: issue.number, comment_id: comment.id, base_seq: ledger.seq };
  if (ledger.handled.has(comment.id) || ledger.rejected.has(comment.id)) return { ...base, action: "duplicate" };

  try {
    const login = comment.user.login;
    const role = await deps.getRole(login);
    check(WRITE_ROLES.has(role), "unauthorized");
    const ctx = { contract, repository, issue, comment, login, role, ledger, now, deps };
    const receipt = intent.type === "command" ? evaluateCommand(ctx, intent) : await evaluateHandoff(ctx, intent.blocks);
    return { ...base, action: "accept", receipt };
  } catch (error) {
    if (error instanceof Reject) return { ...base, action: "reject", code: error.code };
    throw error;
  }
}

function newReceipt({ ledger, comment, login }, kind, fields) {
  return {
    v: 1,
    seq: ledger.seq + 1,
    kind,
    comment_id: comment.id,
    author: login,
    from: ledger.state,
    counters: ledger.counters,
    spec_approved: ledger.spec_approved,
    spec_hash: ledger.spec_hash,
    head_sha: ledger.head_sha,
    ...fields,
  };
}

// Human-only escape from `blocked` (phases.yml: human_resets_attempts, human_restarts_from_intent).
function evaluateCommand(ctx, command) {
  const { contract, ledger, role } = ctx;
  check(APPROVER_ROLES.has(role), "unauthorized");
  check(ledger.state === "blocked", "state_mismatch");
  check(contract.transitions.some((t) => t.from === "blocked" && t.to === command.to), "illegal_transition");
  const counters = { build: 0, test: 0, harden: 0 };
  if (command.kind === "restart") {
    return newReceipt(ctx, "restart", { to: "intent", counters, spec_approved: false, spec_hash: null, head_sha: null });
  }
  // Build may only start from a recorded spec approval, even after a reset.
  check(ledger.spec_approved, "spec_not_approved");
  return newReceipt(ctx, "reset", { to: "build", counters, head_sha: null });
}

async function evaluateHandoff(ctx, blocks) {
  const { contract, repository, issue, role, ledger } = ctx;
  check(blocks.length === 1, "ambiguous_handoff");
  const raw = blocks[0].trim();
  check(!SECRET_PATTERNS.some((re) => re.test(raw)), "secret_detected");

  let h;
  try {
    h = JSON.parse(raw);
  } catch {
    throw new Reject("invalid_json");
  }
  check(validate(contract.schema, h), "schema_invalid");
  check(same(h.issue.repository, repository) && h.issue.number === issue.number, "wrong_issue");

  const approvals = h.approvals ?? [];
  const approval = approvals[0];
  check(approvals.length <= 1, "approval_invalid");

  // Authority: approvals, rejections and the Deploy phase are human decisions.
  if (approval || h.from_phase === "deploy") check(APPROVER_ROLES.has(role), "unauthorized");
  if (approval) checkApproval(ctx, h, approval);

  // Replay protection: the handoff must leave exactly the state the ledger is in.
  const expectedState = approval ? contract.awaitingState[approval.gate] : h.from_phase;
  check(ledger.state === expectedState, "state_mismatch");
  // phases.yml lists no build→build or awaiting-merge-approval→blocked edge, but retry.on_failure_route_to,
  // retry.on_exhausted and the handoff schema imply both, so they are allowed for failed handoffs only.
  const implied =
    h.status === "failed" &&
    ((h.from_phase === "build" && h.issue_state === "build") || (approval && h.issue_state === "blocked"));
  check(
    implied || contract.transitions.some((t) => t.from === ledger.state && t.to === h.issue_state),
    "illegal_transition",
  );

  const counters = checkAttempts(ctx, h, approval);
  checkEvidence(contract, h);
  const head_sha = await checkPullRequest(ctx, h);

  const specHash = sha256(issue.body ?? "");
  let { spec_approved, spec_hash } = ledger;
  if (h.issue_state === "intent") ({ spec_approved, spec_hash } = { spec_approved: false, spec_hash: null });
  if (h.from_phase === "adversary" && h.status === "awaiting_approval") spec_hash = specHash;
  if (approval?.gate === "spec_approval" && approval.decision === "approved") {
    check(ledger.spec_hash === specHash, "spec_changed");
    spec_approved = true;
  }

  return newReceipt(ctx, "handoff", {
    to: h.issue_state,
    from_phase: h.from_phase,
    status: h.status,
    counters,
    spec_approved,
    spec_hash,
    head_sha,
    approval: approval ? { gate: approval.gate, decision: approval.decision, approver: approval.approver } : null,
    handoff_sha256: sha256(raw),
  });
}

function checkApproval({ contract, repository, login, now }, h, approval) {
  check(contract.approvalPhase[h.from_phase] === approval.gate, "approval_gate_mismatch");
  // The platform-verified comment author is the only proof of identity; a claimed approver must match it.
  check(same(approval.approver, login), "approval_not_by_author");
  check(approval.evidence_url.toLowerCase().startsWith(`https://github.com/${repository.toLowerCase()}/`), "approval_evidence_invalid");
  const decided = Date.parse(approval.decided_at);
  check(Number.isFinite(decided) && decided <= now.getTime() + 5 * 60_000, "approval_invalid");
  check(h.status === (approval.decision === "approved" ? "passed" : "failed"), "approval_invalid");
}

// Attempt counters come from the ledger, never from the handoff, so an agent cannot self-report its way
// to a fourth Build. Returns the ledger counters after this handoff.
function checkAttempts({ contract, ledger }, h, approval) {
  if (!contract.retryPhases.includes(h.from_phase)) return ledger.counters;
  const { counters } = ledger;
  const max = contract.maxAttempts;
  check(!(h.from_phase === "build" && counters.build >= max), "retries_exhausted");
  // An approval handoff closes an attempt that its awaiting handoff already counted.
  const attempt = counters[h.from_phase] + (approval ? 0 : 1);
  const buildAttempts = counters.build + (h.from_phase === "build" ? 1 : 0);
  check(h.attempt === attempt && h.build_attempts === buildAttempts, "attempt_mismatch");
  return approval ? counters : { ...counters, [h.from_phase]: attempt, build: buildAttempts };
}

function checkEvidence(contract, h) {
  const phaseGates = contract.gates[h.from_phase];
  const seen = new Map();
  for (const result of h.gate_results) {
    check(phaseGates.some((g) => g.id === result.gate), "unknown_gate");
    check(!seen.has(result.gate), "duplicate_gate");
    seen.set(result.gate, result);
  }
  if (h.status !== "passed" && h.status !== "awaiting_approval") return;

  for (const gate of phaseGates) {
    const result = seen.get(gate.id);
    check(result, "missing_gate_evidence");
    if (gate.kind === "human" && h.status === "awaiting_approval") {
      check(result.result === "pending", "gate_not_passed");
      continue;
    }
    const evidence = result.evidence?.trim();
    check(
      (result.result === "passed" || (result.result === "not_applicable" && gate.kind === "check")) && evidence,
      "gate_not_passed",
    );
  }
  check(!(h.findings ?? []).some((f) => f.status === "open" && ["high", "critical"].includes(f.severity)), "open_blocking_findings");
}

// Verifies the claimed PR head against GitHub, and that Test, Harden and approvals refer to the head
// that Build produced. Returns the ledger head_sha after this handoff.
async function checkPullRequest({ ledger, deps }, h) {
  const forward = h.status === "passed" || h.status === "awaiting_approval";
  if (!forward || !h.pull_request) return ledger.head_sha;
  const pr = await deps.getPullRequest(h.pull_request.number);
  check(pr, "pr_not_found");
  check(pr.head_sha.startsWith(h.pull_request.head_sha), "stale_head");
  if (h.from_phase !== "build") check(pr.head_sha === ledger.head_sha, "head_changed");
  if (h.from_phase === "deploy") {
    // Production merge is human-only: a bot-authored merge never completes Deploy.
    check(pr.merged && pr.merged_by?.type === "User", "pr_not_merged_by_human");
  } else {
    check(pr.state === "open" && !pr.merged, "pr_not_open");
  }
  if (h.from_phase === "harden") check(!pr.draft, "pr_not_ready");
  return pr.head_sha;
}
