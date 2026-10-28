# Agent instructions

1. Read `ARCHITECTURE.md`, relevant accepted `docs/adr/*.md`, and the Issue/spec before editing.
2. Work on a feature branch and open a PR. Never push directly to `main`, merge the PR, or deploy production.
3. Prefer existing patterns, minimal dependencies and narrowly scoped changes.
4. Ask for clarification when acceptance criteria are materially ambiguous; otherwise proceed autonomously.
5. Keep secrets out of commits, logs, Issue comments, and PR descriptions. Never use a Supabase service-role or secret key in client code or `NEXT_PUBLIC_` variables.
6. Data model changes require versioned SQL files in `supabase/migrations/`. For exposed user data, include RLS policies and appropriate tests/review. Never modify the Supabase database (shared by all environments) without explicit authorization.
7. Add tests appropriate to the change and run `npm run check`. The starter's sample test is only a smoke test, not meaningful feature coverage.
8. Propose a new MADR ADR when changing a significant architecture choice; do not silently overturn accepted ADRs.
9. PR must explain the change, verification, preview link if available, migrations, risks, and unresolved questions.
10. For authentication, follow current Supabase SSR guidance (including session refresh proxy/middleware) rather than assuming the included basic clients are a complete auth solution.
11. Once a human sets ADR-0005 to Accepted, move work through the phases in `ORCHESTRATION.md` (`orchestration/phases.yml`): never start Build without human `spec_approval`, never exceed three Build attempts (`build_attempts`; Test and Harden are bounded by it), and never merge without human `merge_approval`. Until then the contract is a proposal and does not bind.
