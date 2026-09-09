import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);

test("the public surface keeps its localized consumer shell", () => {
  assert.match(layout, /<html[\s\S]*lang="de"/);
  assert.match(layout, /<ConsumerShell>\{children\}<\/ConsumerShell>/);
  assert.match(layout, /default:\s*"Backyrd – Orte nach Gefühl"/);
  assert.doesNotMatch(layout, /SERVICE_ROLE|SUPABASE_SECRET_KEY/);
});
