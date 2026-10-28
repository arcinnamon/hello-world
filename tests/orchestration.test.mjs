import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "./support/json-schema.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const PHASES = ["intent", "adversary", "build", "test", "harden", "deploy"];

// phases.yml is read as text so the contract needs no YAML dependency.
const yml = read("orchestration/phases.yml");
const phaseBlocks = Object.fromEntries(
  yml
    .slice(yml.indexOf("\nphases:\n"))
    .split(/\n {2}- id: /)
    .slice(1)
    .map((block) => [block.split("\n")[0].trim(), block]),
);

test("phases.yml defines the six phases in order", () => {
  assert.match(yml, /^phase_order: \[intent, adversary, build, test, harden, deploy\]$/m);
  assert.deepEqual(Object.keys(phaseBlocks), PHASES);
});

test("only build, test and harden retry, at most three attempts", () => {
  assert.match(yml, /^retry:\n(?: {2}#.*\n)* {2}max_attempts: 3\n {2}applies_to: \[build, test, harden\]$/m);
  for (const phase of PHASES) {
    const expected = ["build", "test", "harden"].includes(phase) ? 3 : 1;
    assert.match(phaseBlocks[phase], new RegExp(`^ {4}max_attempts: ${expected}$`, "m"), phase);
  }
});

test("human approvals gate build and deploy", () => {
  assert.match(phaseBlocks.adversary, /approval: spec_approval/);
  assert.match(phaseBlocks.harden, /approval: merge_approval/);
  assert.match(phaseBlocks.deploy, /approval: merge_approval/);
  assert.match(yml, /spec_approval:\n {4}after_phase: adversary\n {4}before_phase: build/);
  assert.match(yml, /merge_approval:\n {4}after_phase: harden\n {4}before_phase: deploy/);
});

test("every phase declares inputs, outputs and completion gates", () => {
  for (const phase of PHASES) {
    for (const key of ["inputs", "outputs", "completion_gates"]) {
      assert.match(phaseBlocks[phase], new RegExp(`^ {4}${key}:$`, "m"), `${phase}.${key}`);
    }
  }
});

test("handoff schema is valid JSON that mirrors the phase contract", () => {
  const schema = JSON.parse(read("orchestration/schemas/handoff.schema.json"));
  assert.deepEqual(schema.$defs.phase.enum, PHASES);
  assert.equal(schema.properties.attempt.maximum, 3);
  const states = [...yml.matchAll(/^ {2}- id: ([a-z-]+)\n {4}label: "state:/gm)].map((m) => m[1]);
  assert.deepEqual(schema.properties.issue_state.enum, states);
  const gates = JSON.stringify(schema.allOf);
  assert.match(gates, /spec_approval/);
  assert.match(gates, /merge_approval/);
});

test("ORCHESTRATION.md points at the machine-readable contract", () => {
  const doc = read("ORCHESTRATION.md");
  assert.match(doc, /orchestration\/phases\.yml/);
  assert.match(doc, /orchestration\/schemas\/handoff\.schema\.json/);
});

const stateIds = [...yml.matchAll(/^ {2}- id: ([a-z-]+)\n {4}label: "state:/gm)].map((m) => m[1]);
const transitions = [...yml.matchAll(/^ {2}- \{from: ([a-z-]+), to: ([a-z-]+), when: ([a-z_]+)\}$/gm)].map(
  ([, from, to, when]) => ({ from, to, when }),
);

test("transitions reference known states and leave no dead ends", () => {
  assert.ok(transitions.length > 0, "no transitions parsed");
  const unparsed = yml.slice(yml.indexOf("\ntransitions:\n")).split("\n").filter((l) => /^ {2}- \{from:/.test(l));
  assert.equal(unparsed.length, transitions.length, "a transition line does not match the expected format");
  for (const { from, to } of transitions) {
    assert.ok(stateIds.includes(from), `unknown from state: ${from}`);
    assert.ok(stateIds.includes(to), `unknown to state: ${to}`);
  }
  const keys = transitions.map((t) => `${t.from}>${t.to}>${t.when}`);
  assert.equal(new Set(keys).size, keys.length, "duplicate transition");
  for (const id of stateIds) {
    const outgoing = transitions.some((t) => t.from === id);
    assert.equal(outgoing, id !== "done", `${id}: only done may be terminal`);
    assert.ok(id === "intent" || transitions.some((t) => t.to === id), `${id}: unreachable`);
  }
  for (const [, state] of yml.matchAll(/^ {4}issue_state: ([a-z-]+)$/gm)) {
    assert.ok(stateIds.includes(state), `phase issue_state is unknown: ${state}`);
  }
});

const schema = JSON.parse(read("orchestration/schemas/handoff.schema.json"));

const approval = (gate, decision = "approved") => ({
  gate,
  decision,
  approver: "alice",
  approver_type: "human",
  evidence_url: "https://github.com/arcinnamon/hello-world/issues/1#issuecomment-1",
  decided_at: "2026-10-28T13:00:00Z",
});
const pullRequest = { number: 2, head_sha: "abcdef1" };

const handoff = (overrides) => ({
  schema_version: 1,
  issue: { repository: "arcinnamon/hello-world", number: 1 },
  status: "passed",
  attempt: 1,
  summary: "fixture",
  gate_results: [],
  created_at: "2026-10-28T13:00:00Z",
  ...overrides,
});
const failed = (overrides) => handoff({ status: "failed", ...overrides });
const blocked = (from_phase) => handoff({ status: "blocked", from_phase, to_phase: null, issue_state: "blocked" });

// [name, handoff, expected validity]
const fixtures = [
  // Forward path and the approval gates
  ["intent passes to adversary", handoff({ from_phase: "intent", to_phase: "adversary", issue_state: "adversary" }), true],
  ["intent cannot skip to build", handoff({ from_phase: "intent", to_phase: "build", issue_state: "build", approvals: [approval("spec_approval")] }), false],
  ["adversary cannot skip to test", handoff({ from_phase: "adversary", to_phase: "test", issue_state: "test" }), false],
  ["adversary to build needs spec_approval", handoff({ from_phase: "adversary", to_phase: "build", issue_state: "build" }), false],
  ["adversary to build rejects a merge_approval", handoff({ from_phase: "adversary", to_phase: "build", issue_state: "build", approvals: [approval("merge_approval")] }), false],
  ["adversary to build with approved spec_approval", handoff({ from_phase: "adversary", to_phase: "build", issue_state: "build", approvals: [approval("spec_approval")] }), true],
  ["adversary awaits spec approval", handoff({ from_phase: "adversary", to_phase: null, status: "awaiting_approval", issue_state: "awaiting-spec-approval" }), true],
  ["awaiting-approval state must match the phase", handoff({ from_phase: "adversary", to_phase: null, status: "awaiting_approval", issue_state: "awaiting-merge-approval" }), false],
  ["build passes to test with a PR", handoff({ from_phase: "build", to_phase: "test", issue_state: "test", pull_request: pullRequest, build_attempts: 1 }), true],
  ["build handoff needs build_attempts", handoff({ from_phase: "build", to_phase: "test", issue_state: "test", pull_request: pullRequest }), false],
  ["build handoff needs a pull request", handoff({ from_phase: "build", to_phase: "test", issue_state: "test", build_attempts: 1 }), false],
  ["issue_state must follow to_phase", handoff({ from_phase: "build", to_phase: "test", issue_state: "done", pull_request: pullRequest, build_attempts: 1 }), false],
  ["test cannot skip to deploy", handoff({ from_phase: "test", to_phase: "deploy", issue_state: "deploy", pull_request: pullRequest, build_attempts: 1, approvals: [approval("merge_approval")] }), false],
  ["harden to deploy needs merge_approval", handoff({ from_phase: "harden", to_phase: "deploy", issue_state: "deploy", pull_request: pullRequest, build_attempts: 1 }), false],
  ["harden to deploy rejects a spec_approval", handoff({ from_phase: "harden", to_phase: "deploy", issue_state: "deploy", pull_request: pullRequest, build_attempts: 1, approvals: [approval("spec_approval")] }), false],
  ["harden to deploy with approved merge_approval", handoff({ from_phase: "harden", to_phase: "deploy", issue_state: "deploy", pull_request: pullRequest, build_attempts: 1, approvals: [approval("merge_approval")] }), true],
  ["harden awaits merge approval", handoff({ from_phase: "harden", to_phase: null, status: "awaiting_approval", issue_state: "awaiting-merge-approval", pull_request: pullRequest, build_attempts: 1 }), true],
  ["deploy passes to done", handoff({ from_phase: "deploy", to_phase: null, issue_state: "done", pull_request: pullRequest }), true],

  // Retry limit: build_attempts bounds the whole loop
  ["failed test returns to build while attempts remain", failed({ from_phase: "test", to_phase: "build", issue_state: "build", build_attempts: 2, attempt: 2 }), true],
  ["failed test cannot start a fourth build", failed({ from_phase: "test", to_phase: "build", issue_state: "build", build_attempts: 3, attempt: 3 }), false],
  ["failed test blocks at the third build", failed({ from_phase: "test", to_phase: null, issue_state: "blocked", build_attempts: 3, attempt: 3 }), true],
  ["failed test cannot block early", failed({ from_phase: "test", to_phase: null, issue_state: "blocked", build_attempts: 1 }), false],
  ["failed harden returns to build", failed({ from_phase: "harden", to_phase: "build", issue_state: "build", build_attempts: 1 }), true],
  ["failed harden blocks at the third build", failed({ from_phase: "harden", to_phase: null, issue_state: "blocked", build_attempts: 3, attempt: 3 }), true],
  ["failed build blocks at the third build", failed({ from_phase: "build", to_phase: null, issue_state: "blocked", build_attempts: 3, attempt: 3 }), true],
  ["failure needs build_attempts", failed({ from_phase: "build", to_phase: "build", issue_state: "build" }), false],
  ["build_attempts is capped at 3", failed({ from_phase: "build", to_phase: null, issue_state: "blocked", build_attempts: 4 }), false],
  ["attempt is capped at 3", failed({ from_phase: "build", to_phase: null, issue_state: "blocked", build_attempts: 3, attempt: 4 }), false],
  ["intent runs once", handoff({ from_phase: "intent", to_phase: "adversary", issue_state: "adversary", attempt: 2 }), false],

  // Rejections, spec gaps and escalation
  ["adversary spec gap returns to intent", failed({ from_phase: "adversary", to_phase: "intent", issue_state: "intent" }), true],
  ["rejected spec_approval returns to intent", failed({ from_phase: "adversary", to_phase: "intent", issue_state: "intent", approvals: [approval("spec_approval", "rejected")] }), true],
  ["rejected spec_approval cannot be recorded by harden", failed({ from_phase: "harden", to_phase: "build", issue_state: "build", build_attempts: 1, approvals: [approval("spec_approval", "rejected")] }), false],
  ["rejected merge_approval returns to build", failed({ from_phase: "harden", to_phase: "build", issue_state: "build", build_attempts: 1, approvals: [approval("merge_approval", "rejected")] }), true],
  ["rejected merge_approval blocks at the third build", failed({ from_phase: "harden", to_phase: null, issue_state: "blocked", build_attempts: 3, attempt: 3, approvals: [approval("merge_approval", "rejected")] }), true],
  ["rejected merge_approval cannot be recorded by adversary", failed({ from_phase: "adversary", to_phase: "intent", issue_state: "intent", approvals: [approval("merge_approval", "rejected")] }), false],
  ["rejection cannot accompany a passing handoff", handoff({ from_phase: "adversary", to_phase: "build", issue_state: "build", approvals: [approval("spec_approval"), approval("spec_approval", "rejected")] }), false],
  ["intent cannot fail", failed({ from_phase: "intent", to_phase: null, issue_state: "blocked" }), false],
  ["deploy cannot fail", failed({ from_phase: "deploy", to_phase: null, issue_state: "blocked" }), false],
  ...["intent", "adversary", "deploy"].map((phase) => [`${phase} can block`, blocked(phase), true]),
  ["blocked cannot name a next phase", handoff({ ...blocked("deploy"), to_phase: "build" }), false],
  ["blocked must set state:blocked", handoff({ ...blocked("deploy"), issue_state: "build" }), false],
];

test("handoff schema accepts and rejects the documented handoffs", () => {
  for (const [name, doc, expected] of fixtures) {
    assert.equal(validate(schema, doc), expected, name);
  }
});

test("the example in ORCHESTRATION.md is a valid handoff", () => {
  const example = read("ORCHESTRATION.md").match(/```json\n([\s\S]*?)\n```/)?.[1];
  assert.ok(example, "no json example found");
  assert.equal(validate(schema, JSON.parse(example)), true);
});

// Handoffs each agent's "## Handoff" section tells it to record. `by` is "agent" unless a human
// records the handoff (approval handoffs). Each one must validate, and the agent file must state
// the same status, to_phase and issue_state values.
const prRef = { pull_request: pullRequest };
const retry = (n) => ({ ...prRef, build_attempts: n, attempt: n });
const agentHandoffs = {
  intent: [
    ["passes to adversary", { status: "passed", to_phase: "adversary", issue_state: "adversary" }],
    ["blocks on a question", { status: "blocked", to_phase: null, issue_state: "blocked" }],
  ],
  adversary: [
    ["awaits spec approval", { status: "awaiting_approval", to_phase: null, issue_state: "awaiting-spec-approval" }],
    ["reports a spec gap", { status: "failed", to_phase: "intent", issue_state: "intent" }],
    ["blocks on a question", { status: "blocked", to_phase: null, issue_state: "blocked" }],
    ["approval handoff", { status: "passed", to_phase: "build", issue_state: "build", approvals: [approval("spec_approval")] }, "human"],
    ["rejection handoff", { status: "failed", to_phase: "intent", issue_state: "intent", approvals: [approval("spec_approval", "rejected")] }, "human"],
  ],
  build: [
    ["passes to test", { status: "passed", to_phase: "test", issue_state: "test", ...retry(1) }],
    ["blocks when gates cannot pass", { status: "blocked", to_phase: null, issue_state: "blocked", ...retry(3) }],
  ],
  test: [
    ["passes to harden", { status: "passed", to_phase: "harden", issue_state: "harden", ...retry(1) }],
    ["fails back to build", { status: "failed", to_phase: "build", issue_state: "build", ...retry(2) }],
    ["blocks after the third build", { status: "failed", to_phase: null, issue_state: "blocked", ...retry(3) }],
    ["blocks on a question", { status: "blocked", to_phase: null, issue_state: "blocked", ...retry(1) }],
  ],
  harden: [
    ["awaits merge approval", { status: "awaiting_approval", to_phase: null, issue_state: "awaiting-merge-approval", ...retry(1) }],
    ["fails back to build", { status: "failed", to_phase: "build", issue_state: "build", ...retry(2) }],
    ["blocks after the third build", { status: "failed", to_phase: null, issue_state: "blocked", ...retry(3) }],
    ["blocks on a question", { status: "blocked", to_phase: null, issue_state: "blocked", ...retry(1) }],
    ["approval handoff", { status: "passed", to_phase: "deploy", issue_state: "deploy", ...retry(1), approvals: [approval("merge_approval")] }, "human"],
    ["rejection handoff", { status: "failed", to_phase: "build", issue_state: "build", ...retry(1), approvals: [approval("merge_approval", "rejected")] }, "human"],
    ["rejection handoff at the third build", { status: "failed", to_phase: null, issue_state: "blocked", ...retry(3), approvals: [approval("merge_approval", "rejected")] }, "human"],
  ],
  deploy: [
    ["blocks when not ready", { status: "blocked", to_phase: null, issue_state: "blocked", ...prRef }],
    ["done once verified", { status: "passed", to_phase: null, issue_state: "done", ...prRef }],
  ],
};

const handoffSection = (agent) => read(`.github/agents/${agent}.agent.md`).split(/^## Handoff$/m)[1];

test("every phase has an agent file named after it", () => {
  assert.deepEqual(Object.keys(agentHandoffs), PHASES);
  for (const phase of PHASES) {
    assert.match(read(`.github/agents/${phase}.agent.md`), new RegExp(`^name: ${phase}$`, "m"), phase);
    assert.ok(handoffSection(phase), `${phase} has no ## Handoff section`);
  }
});

test("handoffs the agents are told to record are valid and stated in the agent files", () => {
  for (const [agent, scenarios] of Object.entries(agentHandoffs)) {
    const section = handoffSection(agent);
    for (const [name, fields, by = "agent"] of scenarios) {
      const doc = handoff({ from_phase: agent, ...fields });
      assert.equal(validate(schema, doc), true, `${agent}: ${name}`);
      const tokens = ["status", "to_phase", "issue_state"].map((key) => `\`${key}: ${doc[key]}\``);
      assert.ok(
        section.split("\n").some((line) => tokens.every((token) => line.includes(token))),
        `${agent}: ${name}: no single line states ${tokens.join(", ")}`,
      );
      if (by === "agent") {
        assert.equal("approvals" in doc, false, `${agent}: ${name}: an agent must not add approvals`);
      }
    }
  }
});

test("agents never grant approvals and approval handoffs are human-recorded", () => {
  for (const agent of ["adversary", "harden"]) {
    assert.match(handoffSection(agent), /approvals. entry yourself/, `${agent} must not add approvals`);
    assert.match(handoffSection(agent), /the human records the approval handoff/, `${agent} approval handoff`);
  }
  for (const agent of ["build", "deploy"]) {
    assert.match(read(`.github/agents/${agent}.agent.md`), /approval handoff/, `${agent} must start from the approval handoff`);
  }
  assert.match(read("ORCHESTRATION.md"), /\*\*Approval handoff\.\*\*/);
  assert.match(handoffSection("adversary"), /rejects the specification/);
  assert.match(handoffSection("harden"), /rejects the merge/);
});

const frontmatter = (agent) => read(`.github/agents/${agent}.agent.md`).split("---")[1];

test("agent tool grants and invocation settings match the documented policy", () => {
  const tools = (agent) => frontmatter(agent).match(/^tools: \[(.*)\]$/m)[1].replaceAll('"', "").split(", ");
  const manual = (agent) => /^disable-model-invocation: true$/m.test(frontmatter(agent));
  for (const phase of PHASES) {
    assert.equal(manual(phase), ["build", "deploy"].includes(phase), `${phase}: disable-model-invocation`);
  }
  // Only Intent (specs) and Build (code) may edit files.
  for (const phase of PHASES) {
    assert.equal(tools(phase).includes("edit"), ["intent", "build"].includes(phase), `${phase}: edit tool`);
  }
  assert.match(read("ORCHESTRATION.md"), /^## Agent enforcement$/m);
});

test("commit prefixes are named once, in AGENTS.md", () => {
  assert.match(read("AGENTS.md"), /`feat:`, `test:`, `chore:`, `fix:`, `docs:`, or `other:`/);
  assert.doesNotMatch(read(".github/agents/build.agent.md"), /`chore:`/);
  assert.ok(read("AGENTS.md").endsWith("\n"), "AGENTS.md needs a trailing newline");
});
