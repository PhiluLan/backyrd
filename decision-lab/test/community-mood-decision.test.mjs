import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  COMMUNITY_MOOD_MAX_COMPONENT,
  communityMoodComponent,
} from "../../supabase/functions/decision-v13/community-mood-signal.mjs";

const repoRoot = resolve(import.meta.dirname,"../..");

test("Community Mood is bounded and no evidence is neutral", () => {
  assert.equal(COMMUNITY_MOOD_MAX_COMPONENT,0.06);
  assert.deepEqual(communityMoodComponent(null),{
    signalStrength:0,component:0,matchedConcepts:[],eligibleContributors:null,
  });
  assert.equal(communityMoodComponent({signal_strength:1}).component,0.06);
  assert.equal(communityMoodComponent({signal_strength:99}).component,0.06);
  assert.equal(communityMoodComponent({signal_strength:-1}).component,0);
});

test("Community Mood is read only after Product/Distribution eligibility", async () => {
  const source=await readFile(resolve(repoRoot,"supabase/functions/decision-v13/index.ts"),"utf8");
  const eligibility=source.indexOf("const eligibleIds = new Set(");
  const moodRead=source.indexOf("communityMoodSignals=await getCommunityMoodSignals");
  const fusion=source.indexOf("const fused = fuseCandidates");
  assert.ok(eligibility>=0&&moodRead>eligibility&&fusion>moodRead);
  assert.match(source,/communityMood\.component \+/);
  assert.doesNotMatch(source,/communityMood\.component\s*[-*/]/);
});
