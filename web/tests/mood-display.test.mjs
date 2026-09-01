import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Spot Mood presentation respects EARLY, ESTABLISHED and ZERO contracts", async () => {
  const [component, page, css] = await Promise.all([
    read("web/components/consumer/spot-mood-profile.tsx"),
    read("web/app/spots/[id]/page.tsx"),
    read("web/app/consumer.css"),
  ]);

  assert.match(component, /mood\.evidence_state === "ESTABLISHED"/);
  assert.match(component, /moods\[0\]\?\.evidence_state === "EARLY"/);
  assert.match(component, /established \? <i[^>]*b-mood-strength/);
  assert.match(component, /established && mood\.rank <= 2/);
  assert.match(component, /concept_contributors/);
  assert.match(component, /Mehr anzeigen/);
  assert.doesNotMatch(component, /\{mood\.percentage\}[%％]/);
  assert.match(page, /data\.top_moods\.length \?/);
  assert.match(page, /<SpotMoodProfile moods=\{data\.top_moods\}/);
  assert.doesNotMatch(page, /percentage}%/);
  assert.match(css, /\.b-mood-strength::after[\s\S]*width: var\(--mood-strength\)/);
  assert.match(css, /\.b-mood-pill\[data-prominent="true"\]/);
});
