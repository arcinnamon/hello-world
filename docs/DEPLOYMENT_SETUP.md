# Deployment setup runbook

This runbook deploys this repository to GitHub-connected Vercel with a single
Supabase project shared by local development, Preview, and Production
(see ADR-0003). Follow the steps in
order. Do not put passwords, API keys, or tokens in Issues, pull requests, chat,
or committed files.

## Session checkpoint: October 26, 2026

Pause point and suggested starting place for the next session:

- The GitHub repository is `arcinnamon/hello-world`; its `main` branch has the
  initial repository commits.
- Local validation passed for the code and lockfile change:
  `npm ci && npm run check`. The local production smoke test returned HTTP 200
  for `/` and `/api/health`.
- Commit `6e32b6b` (`chore: add reproducible dependency lock`) is already on
  the remote feature branch `chore/bootstrap-lockfile`.
- Commit `8b88117` (`docs: add explicit deployment setup runbook`) is local on
  that branch but is not pushed yet.
- At the last check, `README.md` had additional uncommitted edits. Review and
  preserve them; do not stage them accidentally while pushing the runbook.
- The user reports that creating `hello-world-staging` used the remaining
  project slot on the Supabase Free plan (two-project limit). Per ADR-0003 the
  project is now the single Supabase project for all environments; do not
  delete or alter an existing Supabase project without confirming its owner,
  data, and backups.
- The user plans to set up GitHub Pro before trying the GitHub/Copilot
  workflow. This is a user-reported prerequisite; confirm that the selected
  plan enables the desired Copilot coding-agent capabilities before relying on
  it.
- Vercel is not connected. The initial Vercel deployment is a production
  deployment, and production deployment has not been authorized.
- No production environment variables, migrations,
  branch-protection rules, Vercel deployment, or production URL are verified.

### Start here next session

1. Set up GitHub Pro as planned, then check the account/repository's Copilot
   coding-agent eligibility and permissions.
2. Review the existing uncommitted `README.md` edits. Preserve them if they are
   intentional; commit them separately only if desired.
3. From the repository root, check the branch and changes:

   ```bash
   git status --short --branch
   git log --oneline -3
   ```

4. Push the already-committed runbook without staging unrelated README edits:

   ```bash
   git push -u origin chore/bootstrap-lockfile
   ```

5. Open or update a pull request from `chore/bootstrap-lockfile` to `main`.
   Review the diff and CI result before merging. Do not merge if it would start
   an unauthorized production deployment.
6. Continue with a non-production GitHub Issue → Copilot → PR → CI exercise.
   Skip the Vercel preview part unless Vercel has been connected and its
   first-production-deployment behavior has been addressed and explicitly
   approved.
7. Supabase uses one shared project (ADR-0003, which supersedes ADR-0002).
   Revisit isolation before storing real user data.

## Names to decide before creating resources

This repository is `arcinnamon/hello-world`. Use these names as a starting
point:

| Service | Resource | Suggested name | Naming note |
| --- | --- | --- | --- |
| Supabase | Project | `hello-world` (or the existing `hello-world-staging`; renaming is optional) | A descriptive project name. Record the Project URL and generated project reference shown by Supabase; do not derive either from this name. |
| Vercel | Application project | `hello-world` | One Vercel project serves both Preview and Production. Choose a project name that is available in the Vercel team/account you select. If unavailable, add a short distinguishing suffix, such as `hello-world-arcinnamon`. |
| GitHub | Repository | `arcinnamon/hello-world` | This repository already exists. Do not create a duplicate. |

The Supabase project name is not the connection value. Supabase displays a
project URL/reference for the project. Copy those values from the dashboard
and keep them in a private password manager. Vercel's project-name field must
be available in the selected Vercel team/account. Check availability in the
dashboard at creation time.

## 1. Verify the local repository

From the repository root:

```bash
npm ci
npm run check
git status --short --branch
```

`npm run check` runs lint, TypeScript checks, tests, and a production build.
Resolve failures before opening or merging a pull request. Never commit
`.env.local`, database passwords, Supabase secret/service-role keys, or Vercel
tokens.

## 2. Push the repository to GitHub

The repository already exists at
[github.com/arcinnamon/hello-world](https://github.com/arcinnamon/hello-world).
If GitHub CLI is installed, authenticate without putting a token in a command:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth status
```

Push the intended branch (for example, `main` for the existing initial
repository commit, or a feature branch for a pull request):

```bash
git push -u origin BRANCH_NAME
```

If you are applying a local feature-branch change, push that feature branch and
open a pull request to `main`; do not push feature work directly to `main`.

## 3. Create the Supabase project

If the project already exists (for example `hello-world-staging`), skip to
step 8 and reuse it.

1. Sign in at [Supabase Dashboard](https://supabase.com/dashboard).
2. Select the organization that should own the project. Check its billing and
   access settings before creating resources.
3. Choose **New project**.
4. Enter the project name from the table above.
5. Choose a specific US region, preferably near the
   app's users. The dashboard's region list may use specific city/region names;
   choose the actual listed region, not just the general label "US".
6. Create a strong database password. Enter it
   directly in Supabase and save it in a password manager. Do not send it to
   an agent or place it in source control.
7. Review the selected plan, billing, and resource settings, then create the
   project and wait for provisioning to finish.
8. Open the project's **Connect** panel or **Project Settings → API**. Record
   the **Project URL** and **publishable key** in your password manager.

Use only the publishable key. Never use a
secret or service-role key in a `NEXT_PUBLIC_` variable or client code.

This starter's initial migration is intentionally empty. Do not apply
migrations as part of this setup. Because one database serves every
environment, any future migration affects live data immediately: review the
SQL in the PR and apply it only with explicit human approval.

## 4. Import the GitHub repository into Vercel

1. Sign in at [Vercel Dashboard](https://vercel.com/dashboard).
2. Select the Vercel team/account that should own the project. Review its plan
   and billing before creating resources.
3. Choose **Add New → Project** and import
   `arcinnamon/hello-world`. If the repository is not listed, check that the
   GitHub account/integration has permission to access it.
4. Set the project name to `hello-world`, if available in the selected
   Vercel team/account. If it is unavailable, use a clear available name such
   as `hello-world-arcinnamon`.
5. Confirm the detected framework is **Next.js** and the production branch is
   `main`.
6. **Stop before confirming an initial deployment unless production deployment
   has been explicitly approved.** Vercel documents that the first deployment
   of a new project is a production deployment. Do not click **Deploy** to
   proceed without that approval.

After the project exists, configure its environment variables:

1. Open **Project Settings → Environment Variables**.
2. Add `SUPABASE_URL` and select **Production**, **Preview**
   and **Development**, using the Supabase Project URL.
3. Add `SUPABASE_PUBLISHABLE_KEY` with the same three scopes,
   using the publishable key.
4. Save the variables and confirm all three scopes are selected.
5. Do not paste the values into a PR, Issue, chat, or terminal command. If the
   app is run locally, use the same values in the gitignored `.env.local` file.

Vercel's default environments include Preview and Production (and Local for
development). A separate Vercel project is not required for staging. With Git
integration, non-production branches and PRs can receive Preview deployments;
the `main` production branch deploys to Production. Environment-variable
changes may require a new deployment before they take effect.

## 5. Require review and CI on GitHub

1. Open the repository's **Settings → Branches** (or **Settings → Rules →
   Rulesets**, depending on the GitHub UI).
2. Add a rule/ruleset targeting the `main` branch.
3. Require a pull request before merging. Require at least one approval if
   available for the repository plan and organization.
4. Require status checks to pass before merging. Select the CI job named
   `verify`. If it is not offered yet, first run CI on a pull request, then
   return to the rule and select it.
5. Enable the options to block force pushes and direct pushes to `main`, where
   available, and save the rule.

The workflow in `.github/workflows/ci.yml` runs `npm ci` and `npm run check` on
pull requests and pushes to `main`.

## 6. Verify a Preview deployment

After Vercel is connected and a feature branch is pushed or a pull request is
opened:

1. Confirm the PR's `verify` CI job passes.
2. Wait for Vercel to report a Preview deployment and open its URL.
3. Check that `/` loads and `/api/health` returns HTTP 200 with:

   ```json
   { "status": "ok", "service": "hello-world" }
   ```

4. In Vercel's project settings, confirm the Preview environment has the
   Supabase variables set. Preview shares the production database, so avoid
   destructive actions in previews. The health endpoint does not connect to
   or verify a Supabase database.
5. Review the code, checks, any migration, and Preview before approving the
   pull request. Only a human should approve and merge.

## 7. Exercise the Issue → Copilot → PR workflow

1. Create an Issue using `.github/ISSUE_TEMPLATE/feature.yml`.
2. Include a specific goal, acceptance criteria, constraints, and testing
   notes. Link a `specs/*.md` file if the change needs a durable specification.
3. Assign the Issue to GitHub Copilot coding agent if that feature is enabled
   and authorized for the account/repository.
4. Review the agent's pull request, including the diff, CI `verify` result,
   migration (if any), and Vercel Preview.
5. Request changes if needed. A human reviews and approves; merge only after
   approval.
6. Treat the merge to `main` as a production change. Confirm the production
   deployment is authorized before merging if Vercel is set to deploy `main`
   automatically.

## 8. Production release gate

Before the first production deployment, verify all of the following:

- The Supabase variables are set for the Vercel Production scope.
- The PR and required CI checks passed and a human reviewed the Preview.
- Any database change was reviewed and separately approved, since it applies to
  the only database.
- A human explicitly approved the production deployment.

After the authorized deployment, open the production URL and verify `/` and
`/api/health`. Do not report a production URL until a deployment has completed
and its URL has been checked.

## Official references

- [Supabase projects and organizations](https://supabase.com/docs/guides/platform)
- [Vercel projects](https://vercel.com/docs/projects)
- [Vercel deployment environments](https://vercel.com/docs/deployments/environments)
- [Vercel Git integration](https://vercel.com/docs/git)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [GitHub Copilot coding agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent)
