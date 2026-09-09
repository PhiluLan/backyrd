import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);

test("the Admin surface keeps its localized guarded shell", () => {
  assert.match(layout, /<html lang="de">/);
  assert.match(layout, /<AdminGuard>/);
  assert.match(layout, /<IntelligenceSidebar\s*\/>/);
  assert.match(layout, /<main className="bi-main">\{children\}<\/main>/);
  assert.doesNotMatch(layout, /SERVICE_ROLE|SUPABASE_SECRET_KEY/);
});
