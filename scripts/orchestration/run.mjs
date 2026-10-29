// Entry point for .github/workflows/orchestration.yml.
//   evaluate: read-only token. Turns the triggering comment into a decision (written to GITHUB_OUTPUT).
//   apply:    issues:write token. Applies a decision from the evaluate job.
// Uses only Node built-ins; nothing from the Issue, comment or PR is executed.

import { appendFileSync, readFileSync } from "node:fs";
import { applyDecision } from "./apply.mjs";
import { decide, loadContract } from "./engine.mjs";

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

function githubApi() {
  const repository = env("GITHUB_REPOSITORY");
  const base = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const token = env("GITHUB_TOKEN");

  const request = async (method, path, body, { allow404 = false } = {}) => {
    const response = await fetch(`${base}/repos/${repository}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status}`);
    return response.status === 204 ? null : response.json();
  };

  const paginate = async (path) => {
    const items = [];
    for (let page = 1; ; page++) {
      const batch = await request("GET", `${path}?per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
  };

  return {
    listComments: (issue) => paginate(`/issues/${issue}/comments`),
    createComment: (issue, body) => request("POST", `/issues/${issue}/comments`, { body }),
    async getLabelNames(issue) {
      return (await paginate(`/issues/${issue}/labels`)).map((l) => l.name);
    },
    addLabel: (issue, name) => request("POST", `/issues/${issue}/labels`, { labels: [name] }),
    removeLabel: (issue, name) => request("DELETE", `/issues/${issue}/labels/${encodeURIComponent(name)}`),
    async getRole(login) {
      const permission = await request("GET", `/collaborators/${encodeURIComponent(login)}/permission`, null, { allow404: true });
      return permission?.role_name ?? permission?.permission ?? "none";
    },
    async getPullRequest(number) {
      const pr = await request("GET", `/pulls/${number}`, null, { allow404: true });
      return pr && { head_sha: pr.head.sha, state: pr.state, merged: pr.merged, merged_by: pr.merged_by, draft: pr.draft };
    },
  };
}

const setOutput = (name, value) => appendFileSync(env("GITHUB_OUTPUT"), `${name}=${value}\n`);

async function evaluate() {
  const event = JSON.parse(readFileSync(env("GITHUB_EVENT_PATH"), "utf8"));
  if (event.action !== "created" || event.issue?.pull_request) return setOutput("decision", JSON.stringify({ action: "ignore" }));

  const api = githubApi();
  const issue = event.issue.number;
  const decision = await decide(
    loadContract(),
    { repository: env("GITHUB_REPOSITORY"), issue: event.issue, comment: event.comment },
    {
      listComments: () => api.listComments(issue),
      getRole: api.getRole,
      getPullRequest: api.getPullRequest,
    },
  );
  setOutput("decision", JSON.stringify(decision));
}

async function apply() {
  const decision = JSON.parse(env("DECISION"));
  const event = JSON.parse(readFileSync(env("GITHUB_EVENT_PATH"), "utf8"));
  if (decision.issue !== event.issue.number || decision.comment_id !== event.comment.id) {
    throw new Error("Decision does not belong to the triggering comment");
  }
  const api = githubApi();
  const issue = decision.issue;
  const { state } = await applyDecision(loadContract(), decision, {
    listComments: () => api.listComments(issue),
    createComment: (body) => api.createComment(issue, body),
    getLabelNames: () => api.getLabelNames(issue),
    addLabel: (name) => api.addLabel(issue, name),
    removeLabel: (name) => api.removeLabel(issue, name),
  });
  console.log(`Issue #${issue}: ${decision.action}, state:${state}`);
}

const commands = { evaluate, apply };
const run = commands[process.argv[2]];
if (!run) throw new Error(`Usage: run.mjs ${Object.keys(commands).join("|")}`);
await run();
