import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const root=new URL("../../../",import.meta.url);
const read=(path)=>readFile(new URL(path,root),"utf8");

test("canonical Product Decision has no parallel Legacy Taste write",async()=>{
  const mobile=await read("mobile/app/(tabs)/decision.tsx");
  assert.doesNotMatch(mobile,/backyrd_log_taste_event_v[23]/);
  assert.match(mobile,/backyrd_record_visible_decision_impression_v1/);
  assert.match(mobile,/DecisionCardAction = "next" \| "like" \| "dislike"/);
  assert.match(mobile,/action!=="next"/);
});

test("active Decision UI has neutral navigation and no fake percentage",async()=>{
  const mobile=await read("mobile/app/(tabs)/decision.tsx");
  assert.match(mobile,/>Weiter</);
  assert.doesNotMatch(mobile,/Math\.max\(\s*82/);
  assert.doesNotMatch(mobile,/>Match</);
  assert.doesNotMatch(mobile,/Bester Match|Sehr nah dran|Gute Alternative/);
});

test("controlled canonical routing cannot silently return Legacy ranking",async()=>{
  const [wrapper,runner,retrieval]=await Promise.all([
    read("supabase/functions/decision-v13/live-index.ts"),
    read("supabase/functions/decision-v13/north-star-live.ts"),
    read("supabase/functions/decision-v13/index.ts"),
  ]);
  assert.match(wrapper,/canonical_north_star_unavailable/);
  assert.match(runner,/backyrd_canonical_product_user_enabled_v1/);
  assert.doesNotMatch(runner,/LEGACY_V13_FALLBACK/);
  assert.match(retrieval,/!canonicalNorthStarRetrieval/);
});
