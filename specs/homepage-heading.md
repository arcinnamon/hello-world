# Homepage heading: bonjour -> hola

Issue: [arcinnamon/hello-world#14](https://github.com/arcinnamon/hello-world/issues/14)

## Goal
The home page (`/`) shows a large `<h1>` heading. Change its text from "bonjour" to "hola" so visitors see the new greeting. Users: anyone visiting the site. Value: the requested branding/language change, nothing else.

## Acceptance criteria
1. The `<h1>` on `/` reads exactly `hola` (lowercase, matching the existing style). Verified by the automated test in `tests/health.test.mjs`, which currently asserts `<h1>bonjour</h1>` and must be updated to assert `<h1>hola</h1>`.
2. The word "bonjour" no longer appears in `app/page.tsx` or in `tests/`. Verified by `grep -ri bonjour app tests` returning nothing.
3. Everything else on `/` is unchanged: the "Next.js · Supabase · Vercel" line, the intro paragraph, the "Greetings from the database" section (including "Greetings unavailable." and "No greetings yet." states), and the health-check link. Verified by manual check of the Preview and by the existing `tests/greetings.test.mjs` still passing.
4. `/api/health` is unchanged. Verified by the existing health test (`service: "hello-world"`).
5. `npm run check` passes.

## Scope
- The text of the `<h1>` in [app/page.tsx](../app/page.tsx) and the test that asserts it.

## Out of scope
- Rows in `public.greetings` (the seeded messages do not contain "bonjour"; no data change).
- Page title, metadata, styling, layout, other copy, and internationalisation or locale switching.
- Any other occurrence of "hello" or other greeting words.

## Declared impact
- Data model and migrations: none.
- Shared Supabase project (ADR-0003): none; no database access or change.
- Server-only Supabase access (ADR-0004): none; unchanged.
- Auth: none.
- Secrets and env vars: none; no new dependencies.
- New ADR: not needed.

## Open questions
- Casing and punctuation of the new heading: **answered**. The request says `hola`, and the current heading is lowercase, so it is `hola` with no punctuation.
- Which Issue links this spec: **answered**. [#14](https://github.com/arcinnamon/hello-world/issues/14).
