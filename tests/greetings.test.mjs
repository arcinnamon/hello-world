import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20261027000000_create_greetings.sql", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .toLowerCase();

test("greetings table enables row level security", () => {
  assert.match(sql, /alter table public\.greetings enable row level security/);
});

test("greetings has a select policy and no write policies", () => {
  assert.match(sql, /create policy [^;]*on public\.greetings for select/);
  assert.doesNotMatch(sql, /for\s+(insert|update|delete|all)/);
});

test("greetings grants only select to anon/authenticated", () => {
  assert.match(sql, /grant select on public\.greetings to anon, authenticated/);
  assert.doesNotMatch(sql, /grant\s+(all|insert|update|delete)/);
});

test("greetings is seeded", () => {
  assert.match(sql, /insert into public\.greetings/);
  assert.ok((sql.match(/\('hello/g) ?? []).length >= 3);
});
