import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("starter sanity check", () => assert.equal("ok", "ok"));

test("homepage heading is bonjour", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<h1>bonjour<\/h1>/);
});

test("page title and health service use the repository name", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const health = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(layout, /title: "hello-world"/);
  assert.match(health, /service: "hello-world"/);
});
