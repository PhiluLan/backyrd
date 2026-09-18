import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Admin Decision views keep the Legacy read model visibly separate from vNext", async () => {
  const [overview, detail] = await Promise.all([
    read("admin-dashboard/app/decision/page.tsx"),
    read("admin-dashboard/app/decision/[id]/page.tsx"),
  ]);
  assert.match(overview, /Historische Legacy-Auswertung/);
  assert.match(overview, /Decision-vNext-Daten werden hier nicht beigemischt/);
  assert.match(overview, /admin_decision_intelligence_v1/);
  assert.match(detail, /Historische Ansicht/);
  assert.match(detail, /admin_decision_session_v1/);
  assert.doesNotMatch(overview + detail, /product-response@1\.0|product-decision-learning-port@1\.0/);
});
