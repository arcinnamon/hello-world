# Code simplification findings

Result of a read-only simplification scrub. The codebase is small and mostly clean, so the findings are mainly formatting and readability. None of them change behavior.

## Recommended changes

1. **[app/page.tsx](../app/page.tsx): dense JSX with a nested ternary**
   - Extract the greetings section into a small component that uses early returns:
     ```tsx
     function GreetingsList({ greetings, error }: GreetingsResult) {
       if (error) return <p>Greetings unavailable.</p>;
       if (greetings.length === 0) return <p>No greetings yet.</p>;
       return <ul>{greetings.map((g) => <li key={g.id}>{g.message}</li>)}</ul>;
     }
     ```
   - Format `Home` as normal multi-line JSX and render `<GreetingsList {...result} />`.
   - Rendered HTML is unchanged. The three states match [specs/greetings.md](../specs/greetings.md).

2. **[lib/supabase/server.ts](../lib/supabase/server.ts): cramped formatting and a redundant type**
   - Add a blank line after the imports. Put `try`/`catch` and the method bodies on separate lines.
   - Replace `values.forEach(...)` with a `for...of` loop.
   - Drop the explicit `setAll` parameter type and the `CookieOptions` import if `createServerClient` infers it. Confirm with `npm run typecheck`.
   - Keep the order of `await cookies()` and the env check. Moving the check first would change which error surfaces when called outside a request.

3. **[app/layout.tsx](../app/layout.tsx): formatting only**
   - Break `metadata` and the component onto separate lines. Fix the spacing in `Readonly<{children: ...}>`.

4. **[eslint.config.mjs](../eslint.config.mjs): one long line (optional)**
   - Split the config array across lines.

## Flagged, decide first

- **[tests/health.test.mjs](../tests/health.test.mjs) is a no-op.**
  - It asserts `"ok" === "ok"`. `AGENTS.md` describes it as a smoke test only.
  - Delete it or replace it with a real test of the `GET` handler. Importing `.ts` from a `.mjs` test needs extra Node flags, so this is a test-tooling change. Keep it out of a simplification PR.
- **[lib/greetings.ts](../lib/greetings.ts) is fine as is.**
  - The `{ greetings: [], error }` literal appears three times, but a helper would not be clearer.
  - The error message is never shown (the page prints a fixed string) and nothing is logged. That is an observability question, not a simplification.
  - `data ?? []` is needed for the types.
- **[app/api/health/route.ts](../app/api/health/route.ts) is already minimal.** The spec requires it to stay unchanged.

## No action needed

- No dead code, unused dependencies or duplicated logic.
- `tsconfig.tsbuildinfo` is already covered by `*.tsbuildinfo` in `.gitignore`.

## Suggested delivery

Make items 1–3 as three small commits on a feature branch. Run `npm run check` after each and open a PR. The PR should state: no behavior change, no migrations, no ADR impact.
