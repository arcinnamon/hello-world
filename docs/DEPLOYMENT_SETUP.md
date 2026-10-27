# Deployment setup runbook

This runbook expands the setup sequence in [README.md](../README.md): start
from the ZIP, verify locally, set up GitHub, configure one Supabase project,
connect Vercel, configure GitHub controls, and try the Issue-to-PR workflow.
The same Supabase project is shared by local development, Preview, and
Production (see ADR-0003). Do not put passwords, API keys, or tokens in Issues,
pull requests, chat, or committed files.

## Names to decide before creating resources

For a ZIP-based app, choose your own app, repository, and Vercel project names.
This checkout already uses `arcinnamon/hello-world`; do not create a duplicate
GitHub repository when setting up this checkout.

| Service | Resource | Suggested name | Naming note |
| --- | --- | --- | --- |
| Supabase | Project | `hello-world` | A descriptive project name. Record the Project URL and generated project reference shown by Supabase; do not derive either from this name. |
| Vercel | Application project | `hello-world` | One Vercel project serves both Preview and Production. Choose a project name that is available in the Vercel team/account you select. If unavailable, add a short distinguishing suffix, such as `hello-world-arcinnamon`. |
| GitHub | Repository | `arcinnamon/hello-world` | This repository already exists; use your own repository name when starting from the ZIP. |

The Supabase project name is not the connection value. Supabase displays a
project URL/reference for the project. Copy those values from the dashboard
and keep them in a private password manager. Check Vercel project-name
availability in the dashboard at creation time.

## 1. Start from the ZIP and verify locally

Extract the ZIP into a folder named `webapp-starter` (or your app's name), then
run these commands from that folder:

```bash
npm install
npm run check
npm run dev
```

`npm install` creates `package-lock.json`; CI uses `npm ci`, so commit the
lockfile before pushing. Visit `http://localhost:3000` and
`http://localhost:3000/api/health`. `npm run check` runs lint, TypeScript
checks, tests, and a production build. Resolve failures before opening or
merging a pull request. Never commit `.env.local`, database passwords,
Supabase secret/service-role keys, or Vercel tokens.

## 2. Create or use the GitHub repository

For a ZIP-based app, create an empty GitHub repository. If GitHub CLI is
installed, authenticate without putting a token in a command:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth status
```

For a new repository created from the ZIP, initialize and push the starter to
`main` as shown in the README. For changes to an existing repository, work on a
feature branch and open a pull request to `main`; do not push feature work
directly to `main`.

## 3. Create or reuse one Supabase project

If the single Supabase project already exists, reuse it and skip project
creation. Do not create a second project.

1. Sign in at [Supabase Dashboard](https://supabase.com/dashboard).
2. Select the organization that should own the project. Check its billing and
   access settings before creating resources.
3. Choose **New project**.
4. Enter the project name from the table above.
5. Choose a specific US region, preferably near the app's users. The
   dashboard's region list may use specific city/region names; choose the
   actual listed region, not just the general label "US".
6. Create a strong database password. Enter it directly in Supabase and save
   it in a password manager. Do not send it to an agent or place it in source
   control.
7. Review the selected plan, billing, and resource settings, then create the
   project and wait for provisioning to finish.
8. Open the project's **Connect** panel or **Project Settings → API**. Record
   the **Project URL** and **publishable key** in your password manager.

If reusing an existing project, retrieve its Project URL and publishable key
from its dashboard. Use only the publishable key. Never use a secret or
service-role key in a `NEXT_PUBLIC_` variable or client code.

For local development, copy `.env.example` to `.env.local` and fill in the
project values. `.env.local` is gitignored.

This starter's initial migration is intentionally empty. Do not apply
migrations as part of setup. Because one database serves every environment,
any future migration affects live data immediately: review the SQL in the PR
and apply it only with explicit human approval. There is no migration GitHub
Action on purpose; coordinate release order for schema-dependent features.

## 4. Connect the GitHub repository to Vercel

1. Sign in at [Vercel Dashboard](https://vercel.com/dashboard).
2. Select the Vercel team/account that should own the project. Review its plan
   and billing before creating resources.
3. Choose **Add New → Project** and import the GitHub repository. If it is not
   listed, check that the GitHub account/integration has permission to access
   it.
4. Set the project name to your app's name, if available in the selected
   Vercel team/account. If it is unavailable, use a clear available name such
   as `hello-world-arcinnamon`.
5. Confirm the detected framework is **Next.js** and the production branch is
   `main`.
6. If the import flow lets you configure environment variables before
   deployment, add `SUPABASE_URL` with the Supabase Project URL and
   `SUPABASE_PUBLISHABLE_KEY` with the publishable key. Select **Production**,
   **Preview**, and **Development** for both.
7. Do not paste the values into a PR, Issue, chat, or terminal command. If the
   app is run locally, use the same values in the gitignored `.env.local` file.

Vercel's default environments include Preview and Production (and Local for
development). A separate Vercel project is not required for staging. With Git
integration, non-production branches and PRs can receive Preview deployments;
the `main` production branch deploys to Production. Deploy from `main` after
the Production variables are configured and the production deployment is
authorized. If Vercel requires a deployment to finish creating the project,
treat that first deployment as Production and proceed only with that
authorization. Then configure any missing variables in **Project Settings →
Environment Variables**, select all three scopes for each, and redeploy so
they take effect.

## 5. Configure GitHub controls

1. In **Settings → Actions**, allow the repository's CI workflow to run.
2. Open **Settings → Branches** or **Settings → Rules → Rulesets** (the UI
   varies), then add a rule/ruleset targeting `main`.
3. Require a pull request before merging. Require at least one approval if
   available for the repository plan and organization.
4. Require status checks to pass before merging. Select the CI job named
   `verify`. If it is not offered yet, first run CI on a pull request, then
   return to the rule and select it.
5. Enable the options to block force pushes and direct pushes to `main`, where
   available, and save the rule.

The workflow in `.github/workflows/ci.yml` runs `npm ci` and `npm run check` on
pull requests and pushes to `main`.

## 6. First end-to-end exercise

After Vercel and GitHub Actions are configured:

1. Create a GitHub Issue using `.github/ISSUE_TEMPLATE/feature.yml`, such as
   "Add a second page at `/about` with a link from the home page." Include
   explicit acceptance criteria.
2. Assign the Issue to GitHub Copilot coding agent if enabled and authorized,
   or implement it in IDE Agent Mode on a feature branch.
3. Ensure the PR's CI `verify` check passes and Vercel reports a Preview
   deployment. If the check is not selectable in branch rules yet, return to
   step 5 after CI has run.
4. Open the Preview URL. Check that `/about`, `/`, and `/api/health` work; the
   health route should return HTTP 200 with:

   ```json
   { "status": "ok", "service": "webapp-starter" }
   ```

5. Confirm the Preview environment has the Supabase variables set. Preview
   shares the production database, so avoid destructive actions; `/api/health`
   does not connect to or verify Supabase.
6. Review code, CI, ADRs, migrations, and Preview. Request changes as needed.
   Only a human should approve and merge the PR. A merge to `main` triggers a
   Production deployment, so approve the production deployment before merging.

## 7. Copilot setup

Open `docs/COPILOT_DEPLOY_PROMPT.md` and paste its prompt into IDE Copilot
**Agent Mode**. It guides validation, dependency reconciliation, and assisted
setup without assuming Copilot can access external dashboard accounts. Check
GitHub's current Copilot coding-agent availability, authorization, and billing
requirements before assigning an Issue.

## 8. Production verification

The initial deployment from `main` is a Production deployment. Before it,
confirm the Production Supabase variables are set and a human has authorized
the deployment. For subsequent changes, require passing CI and human review of
the PR and Preview before merging to `main`. Review and separately approve any
database change because it affects the only database.

After each deployment, open the production URL and verify `/` and
`/api/health`. Do not report a production URL until deployment has completed
and its URL has been checked.

## Official references

- [Supabase projects and organizations](https://supabase.com/docs/guides/platform)
- [Vercel projects](https://vercel.com/docs/projects)
- [Vercel deployment environments](https://vercel.com/docs/deployments/environments)
- [Vercel Git integration](https://vercel.com/docs/git)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [GitHub Copilot coding agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent)
