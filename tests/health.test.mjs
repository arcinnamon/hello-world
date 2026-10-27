import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("starter sanity check", () => assert.equal("ok", "ok"));

test("homepage heading is bonjour", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<h1>bonjour<\/h1>/);
});
