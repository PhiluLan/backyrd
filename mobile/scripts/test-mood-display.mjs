import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../components/spot/SpotMoodProfile.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../app/spot/[id].tsx", import.meta.url), "utf8");

assert.match(source, /mood\.evidence_state === "ESTABLISHED"/, "ESTABLISHED state is not explicit");
assert.match(source, /moods\[0\]\?\.evidence_state === "EARLY"/, "EARLY state is not explicit");
assert.match(source, /established \? \([\s\S]*strengthTrack/, "strength line is not gated by ESTABLISHED");
assert.match(source, /established && mood\.rank <= 2/, "top-two hierarchy is not rank-bound");
assert.match(source, /concept_contributors/, "detail does not use the privacy-safe contributor count");
assert.match(source, /Mehr anzeigen/, "additional moods cannot be disclosed");
assert.match(source, /accessibilityRole="button"/, "Mood pills are not accessible controls");
assert.doesNotMatch(source, /\{mood\.percentage\}[%％]|\{m\.percentage\}[%％]/, "raw percentages are visible");
assert.match(detail, /<SpotMoodProfile moods=\{moodSummary\}/, "Spot Detail is not using the canonical presentation component");
assert.doesNotMatch(detail, /moodCount|percentage}%/, "legacy numeric Mood UI remains in Spot Detail");

console.log("mobile Mood display contract: PASS");
