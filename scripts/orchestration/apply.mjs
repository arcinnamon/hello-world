// Applies an already-validated decision to an Issue: ledger receipt (or rejection notice) plus label sync.
// It runs with `issues: write`, so it never evaluates comment content: it accepts only the structured
// decision produced by engine.decide(), re-validates its shape, and writes fixed text built from enums.

import { parseReceipt, readLedger } from "./engine.mjs";

export const MESSAGES = {
  unauthorized: "the author's repository role is not allowed to record this handoff or approval",
  ambiguous_handoff: "the comment must contain exactly one handoff JSON block",
  secret_detected: "the handoff appears to contain a secret; remove it and rotate it if real",
  invalid_json: "the handoff block is not valid JSON",
  schema_invalid: "the handoff does not satisfy orchestration/schemas/handoff.schema.json",
  wrong_issue: "the handoff names a different repository or Issue",
  approval_invalid: "the approval entry is malformed, inconsistent with the handoff status, or dated in the future",
  approval_gate_mismatch: "the approval gate does not belong to this phase",
  approval_not_by_author: "the approver must be the human who posted the comment",
  approval_evidence_invalid: "the approval evidence_url must point into this repository",
  state_mismatch: "the handoff does not leave the Issue's current state",
  illegal_transition: "phases.yml does not allow this transition",
  retries_exhausted: "Build attempts are exhausted; a human must reset the Issue",
  attempt_mismatch: "attempt and build_attempts do not match the recorded attempts",
  unknown_gate: "gate_results names a gate that is not in this phase",
  duplicate_gate: "gate_results lists a gate more than once",
  missing_gate_evidence: "a completion gate has no result",
  gate_not_passed: "a completion gate has not passed with evidence",
  open_blocking_findings: "high or critical findings are still open",
  pr_not_found: "the pull request was not found",
  stale_head: "pull_request.head_sha is not the current PR head",
  head_changed: "the PR head changed since the previous phase; re-run from Build",
  pr_not_open: "the pull request is not open",
  pr_not_ready: "the pull request is still a draft",
  pr_not_merged_by_human: "Deploy completes only after a human merged the pull request",
  spec_changed: "the Issue specification changed after the adversarial review",
  spec_not_approved: "Build cannot restart without a recorded spec_approval",
};

const ACTIONS = ["accept", "reject", "duplicate"];

export function validateDecision(contract, d) {
  const int = (v, min) => Number.isInteger(v) && v >= min;
  const ok =
    d?.v === 1 &&
    ACTIONS.includes(d.action) &&
    int(d.issue, 1) &&
    int(d.comment_id, 1) &&
    int(d.base_seq, 0) &&
    (d.action !== "reject" || Object.hasOwn(MESSAGES, d.code)) &&
    (d.action !== "accept" || (d.receipt?.seq === d.base_seq + 1 && d.receipt.comment_id === d.comment_id));
  if (!ok) throw new Error("Invalid orchestration decision");
  if (d.action === "accept") parseReceipt(contract, d.receipt);
  return d;
}

const receiptText = (r) =>
  r.kind === "handoff"
    ? `accepted [handoff](#issuecomment-${r.comment_id}) from \`${r.from_phase}\` (${r.status}): \`${r.from}\` → \`${r.to}\``
    : `accepted human command (${r.kind}): \`${r.from}\` → \`${r.to}\``;

/**
 * api: { listComments(), createComment(body), getLabelNames(), addLabel(name), removeLabel(name) }
 * Throws (failing the job) rather than writing if the ledger moved since the decision was made.
 */
export async function applyDecision(contract, decision, api) {
  validateDecision(contract, decision);
  const ledger = readLedger(contract, await api.listComments());
  let state = ledger.state;

  if (decision.action === "accept") {
    const stale = ledger.seq !== decision.base_seq || ledger.handled.has(decision.comment_id);
    if (stale) throw new Error("Orchestration ledger changed since evaluation; refusing to apply a stale transition");
    const { receipt } = decision;
    await api.createComment(`<!-- orchestration:receipt ${JSON.stringify(receipt)} -->\n**Orchestration:** ${receiptText(receipt)}.`);
    state = receipt.to;
  } else if (decision.action === "reject" && !ledger.rejected.has(decision.comment_id)) {
    await api.createComment(
      `<!-- orchestration:rejection ${decision.comment_id} -->\n**Orchestration:** rejected [comment](#issuecomment-${decision.comment_id}) (\`${decision.code}\`): ${MESSAGES[decision.code]}. State is unchanged: \`state:${state}\`.`,
    );
  }

  // Labels are a projection of the ledger: anything else is overwritten, including manual edits.
  const target = `state:${state}`;
  const labels = await api.getLabelNames();
  for (const name of labels) if (name.startsWith("state:") && name !== target) await api.removeLabel(name);
  if (!labels.includes(target)) await api.addLabel(target);
  return { state };
}
