# webapp-starter

Agent-ready **Next.js App Router + TypeScript + Supabase + Vercel** template. It renders a hello-world page and `/api/health` without Supabase credentials; the Supabase client helpers are included for features that need a database. **No authentication, live database health check, or automatic migration deployment is preconfigured.**

## 0. Prerequisites
- Git, Node.js 22+, npm, a GitHub account, Vercel account, and Supabase account.
- IDE with GitHub Copilot Chat / Agent Mode (optional for deployment setup).
- Two distinct Supabase projects: staging and production.
- For detailed resource names, dashboard steps, environment scopes, and release
  safeguards, follow [the deployment setup runbook](docs/DEPLOYMENT_SETUP.md).

## 1. Start from the ZIP
1. Extract into a folder named `webapp-starter` (or your project name).
2. `npm install` (creates a package-lock.json), then `npm run check`, then `npm run dev`.
3. Visit `http://localhost:3000` and `http://localhost:3000/api/health`.
4. Create an empty GitHub repository, then:
   ```bash
   git init
   git add .
   git commit -m "Initialize webapp starter"
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
   git push -u origin main
   ```
5. Optionally enable GitHub's **Template repository** setting (Settings > General) to reuse for subsequent apps.

> Create your lockfile with `npm install` before pushing: CI uses `npm ci` and requires `package-lock.json`. If you encounter dependency compatibility errors, ask IDE Copilot to reconcile versions and rerun `npm run check` before pushing.

## 2. Supabase — create two projects
1. In [Supabase](https://supabase.com/dashboard), create `YOUR-APP-staging` and `YOUR-APP-production` in your preferred region.
2. In each project go to **Connect / API settings** and collect the **Project URL** and **publishable key** (labels may vary). Do **not** use the secret or service-role key in the browser.
3. For local development copy `.env.example` to `.env.local` and fill in **staging** values. `.env.local` is gitignored.
4. Database migration policy: initial SQL is an intentionally empty example. For future schema changes, review SQL first. Use Supabase CLI with the **staging** project linked before running `supabase db push`; separately link/target production only after a human approves a rollout. Validate the target project before every push. Do not reuse production credentials or migration actions for previews.
5. There is no production migration GitHub Action on purpose. Coordinate release order for schema-dependent features.

## 3. Vercel — connect GitHub
1. In [Vercel](https://vercel.com/new), import the GitHub repository; set framework **Next.js** and production branch **main**.
2. In Project **Settings > Environment Variables** create these names:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Assign **Preview** and **Development** the corresponding **staging** Supabase URL and publishable key.
4. Assign **Production** the **production** Supabase URL and publishable key. Verify environment scoping before saving. Redeploy when environment variables change.
5. Deploy from `main`; verify the live home page and `/api/health` responds with `{ "status": "ok", "service": "webapp-starter" }`.
6. Vercel's Git integration automatically produces preview URLs for non-production branch pushes/PRs and production deployments for `main` changes. No Vercel deploy GitHub Action is needed.

## 4. GitHub controls
1. In **Settings > Actions**, allow the starter's CI workflow. After `npm install` and committing `package-lock.json`, CI runs `npm run check` on PRs and `main`.
2. In **Settings > Rules / Rulesets** (UI varies), protect `main`: require PR before merge, require CI `verify` check, disallow force pushes and direct pushes. Enable required reviewer approval if your GitHub plan/repository type supports it. If not, follow manual human-only merging.
3. Enable GitHub Copilot cloud coding agent if available under your plan/org policies. Assign an Issue to Copilot to launch work; it should open a PR, not merge automatically. Check GitHub's current agent availability, authorization and billing requirements.
4. Use `.github/ISSUE_TEMPLATE/feature.yml` for specifications and acceptance criteria. Put long-lived specs in `specs/` as needed.
5. Review **code changes, CI checks, ADRs, database migrations and the Vercel preview** before approving and merging.

## 5. First end-to-end exercise
1. Create a GitHub Issue: "Add a second page at `/about` with a link from the home page" with explicit acceptance criteria.
2. Assign the Issue to Copilot cloud coding agent (or perform it in IDE Agent Mode on a feature branch).
3. Await the agent PR. Ensure the CI `verify` check passes and Vercel posts a preview deployment.
4. Open the preview and inspect `/about`, `/`, and `/api/health`. Check that preview uses staging Supabase values.
5. Request changes as needed. Only you approve and merge the PR. Confirm Vercel production deploys the merge.

## 6. Copilot setup
Open `docs/COPILOT_DEPLOY_PROMPT.md` and paste its prompt into IDE Copilot **Agent Mode**. It guides validation, dependency reconciliation and assisted setup without assuming Copilot has access to external dashboard accounts.

## Architecture & safety
- `AGENTS.md`: agent operating rules; `.github/copilot-instructions.md`: GitHub Copilot instruction discovery.
- `ARCHITECTURE.md`: enforced approach; `docs/adr/`: MADR-style decisions and template.
- `supabase/migrations/`: version-controlled SQL. Enable RLS + proper policies for user-facing data.
- Do not commit `.env.local`, secret/service-role keys or deploy tokens.
- Shared staging Supabase is economical but preview branches may interfere with each other. Consider Supabase branches later if needed.
- Future authentication requires a proper Supabase SSR cookie-refresh proxy and auth flow; the starter deliberately does not pretend to implement secure sign-in.

## Vendor references
- https://nextjs.org/docs
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://vercel.com/docs/git
- https://vercel.com/docs/environment-variables
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent
- https://adr.github.io/madr/
