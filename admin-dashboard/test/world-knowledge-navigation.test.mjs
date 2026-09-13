import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("World Knowledge authoring is reachable from the active Founder navigation", async () => {
  const [layout, sidebar, page] = await Promise.all([
    read("app/layout.tsx"),
    read("components/intelligence/Sidebar.tsx"),
    read("app/world-knowledge/page.tsx"),
  ]);

  assert.match(layout, /<IntelligenceSidebar\s*\/>/);
  assert.match(
    sidebar,
    /href:\s*"\/world-knowledge",\s*label:\s*"World Knowledge"/,
  );
  assert.equal(
    [...sidebar.matchAll(/<NavigationLinks/g)].length,
    2,
    "the same navigation list must be rendered in desktop sidebar and mobile drawer",
  );
  assert.match(sidebar, /aria-label="Founder-Navigation"/);
  assert.match(sidebar, /aria-label="Mobile Founder-Navigation"/);
  assert.match(page, /<WorldKnowledgeAuthoring/);
});
