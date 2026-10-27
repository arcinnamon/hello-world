# Prompt for IDE Copilot (Agent Mode)

Paste the following into **GitHub Copilot Chat in Agent Mode** from the root of this repository after extracting it:

> You are helping bootstrap this GitHub-hosted Next.js + Supabase + Vercel web application. Read README.md, AGENTS.md, ARCHITECTURE.md, and accepted docs/adr files first. Your goal is a working hello-world application on Vercel with a single shared Supabase project (ADR-0003) and a GitHub Issue -> Copilot PR -> Vercel Preview -> human-approved merge -> Production workflow. First, inspect the repository, repair any version-specific compatibility issues, install dependencies, generate and commit package-lock.json, and run npm run check. Do not guess secrets or claim account operations have completed. Give me one concise sequence of the GitHub, Supabase and Vercel dashboard actions I must do; ask for authorization before any account-affecting actions. Help populate local .env.local without committing secrets. Configure no automatic production database migrations; show the migration commands and get explicit permission before applying them. Once I provide URLs and keys, verify local health endpoint, open a PR for any changes, confirm preview deployment, and report exactly what I should test and which manual approval/merge steps remain. Never merge or deploy production without my explicit approval.

## Important

Copilot cannot create third-party accounts or access credentials unless you explicitly provide/connect its capabilities. Use the README for dashboard setup. It must never print secrets into chat or commit them. The included Supabase clients are connection helpers; this starter does not yet implement user login.
