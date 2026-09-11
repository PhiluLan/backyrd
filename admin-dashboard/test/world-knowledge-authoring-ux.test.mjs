import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("authoring uses canonical schedules and rejects the former pseudo values", async () => {
  const source = await read("packages/world-knowledge-authoring-ui/src/index.tsx");
  assert.match(source, /\[\["MONDAY", "Montag"\]/);
  assert.match(source, /type TimeInterval = \{ start: string; end: string \}/);
  assert.doesNotMatch(source, /<option value="BYO_FEE">/);
  assert.doesNotMatch(source, /<option value="CONDITIONAL">Unter Bedingungen<\/option><option value="UNKNOWN">/);
});

test("normal legacy review is human-readable and raw data stays in expert mode", async () => {
  const source = await read("packages/world-knowledge-authoring-ui/src/index.tsx");
  assert.match(source, /Bisher vorhanden/);
  assert.match(source, /Neu in World Knowledge/);
  assert.match(source, /Format kann nicht sicher übernommen werden/);
  assert.match(source, /Technische Nachvollziehbarkeit/);
  assert.doesNotMatch(source, /<code>\{JSON\.stringify\(item\.value/);
});

test("validation and session errors stay inside the German authoring UI", async () => {
  const [source, page] = await Promise.all([
    read("packages/world-knowledge-authoring-ui/src/index.tsx"),
    read("admin-dashboard/app/world-knowledge/page.tsx"),
  ]);
  assert.match(source, /translateAuthoringError/);
  assert.match(source, /Deine lokale Sitzung ist abgelaufen/);
  assert.match(source, /sessionRecoveringAuthoringClient/);
  assert.match(source, /role=\{messageKind === "ERROR" \? "alert" : "status"\}/);
  assert.match(page, /authorizedWorldKnowledgePost/);
  assert.match(page, /sessionRecoveringAuthoringClient\(supabase, supabase\.auth\)/);
});
