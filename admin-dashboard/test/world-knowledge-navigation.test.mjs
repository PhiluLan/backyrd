import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("spot research is the only workflow on its navigation page; editing stays under Spots", async () => {
  const [layout, sidebar, page, editor] = await Promise.all([
    read("app/layout.tsx"),
    read("components/intelligence/Sidebar.tsx"),
    read("app/world-knowledge/page.tsx"),
    read("app/spots/[id]/edit/page.tsx"),
  ]);

  assert.match(layout, /<IntelligenceSidebar\s*\/>/);
  assert.match(
    sidebar,
    /href:\s*"\/world-knowledge",\s*label:\s*"Recherche Spot"/,
  );
  assert.equal(
    [...sidebar.matchAll(/<NavigationLinks/g)].length,
    2,
    "the same navigation list must be rendered in desktop sidebar and mobile drawer",
  );
  assert.match(sidebar, /aria-label="Founder-Navigation"/);
  assert.match(sidebar, /aria-label="Mobile Founder-Navigation"/);
  assert.match(page, /<WorldResearchBatchPanel/);
  assert.doesNotMatch(page, /<WorldProductCorrection|<WorldKnowledgeAuthoring/);
  assert.match(editor, /<WorldProductCorrection/);
});
