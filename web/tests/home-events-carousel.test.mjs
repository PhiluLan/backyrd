import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Home events use a manual horizontal carousel with stable fallbacks", () => {
  const component = read("components/home-events.tsx");
  const styles = read("components/home-events.module.css");
  const discovery = read("lib/events-public.ts");

  assert.match(component, /events\(8\)/, "Home must request several chronological discovery events");
  assert.match(component, /rows\.length === 0[\s\S]*Aktuell sind noch keine Events bestätigt/, "zero events must retain the existing empty state");
  assert.match(component, /rows\.length === 1 \? styles\.single/, "one event must use the full-width card fallback");
  assert.match(component, /href={`\/events\/\$\{event\.event_id\}\?occurrence=\$\{event\.occurrence_id\}`}/, "cards must keep the existing event detail route");
  assert.match(styles, /\.carousel[\s\S]*display: flex;[\s\S]*overflow-x: auto;/, "multiple events must scroll horizontally");
  assert.match(styles, /flex-basis: calc\(100% - 48px\)/, "mobile must reveal part of the next card");
  assert.match(styles, /\.single \.card[\s\S]*flex-basis: 100%/, "a single event must remain a normal full-width card");
  assert.doesNotMatch(`${component}\n${styles}`, /scroll-snap|autoplay|setInterval|pagination/i, "the carousel must not autoplay or force pagination");
  assert.match(discovery, /\.gte\("end_at", new Date\(\)\.toISOString\(\)\)[\s\S]*\.order\("start_at"\)/, "Home events must remain upcoming and chronologically ordered");
});
