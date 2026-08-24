import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const decision = read("app/(tabs)/decision.tsx");
const home = read("app/(tabs)/index.tsx");
const tabs = read("app/(tabs)/_layout.tsx");
const profile = read("lib/profile.ts");
const config = read("app.config.ts");

assert.match(decision, /DecisionCardAction = "next" \| "like" \| "dislike"/);
assert.match(decision, /if \(action !== "next" &&/, "neutral Next must bypass feedback");
assert.match(decision, /backyrd_record_visible_decision_impression_v1/, "exposure must be visible-card based");
assert.match(decision, /actionType: "navigation_intent"/, "Route must emit canonical navigation intent");
assert.match(decision, /data\.north_star\?\.active !== true/, "canonical user must fail closed without North-Star");
assert.doesNotMatch(decision, /decision-copy|create_decision_session_v1|Math\.max\(\s*82/);
assert.match(home, /pathname: "\/\(tabs\)\/decision"/, "Home search must enter Decision");
assert.match(home, /auto: "1"/, "Home submission must execute Decision");
assert.doesNotMatch(tabs, /checkForUpdateAsync|fetchUpdateAsync|reloadAsync/, "Tabs must not control OTA lifecycle");
assert.doesNotMatch(profile, /\.insert\(|\.update\(/, "Mobile profile repair must remain read-only");
assert.doesNotMatch(`${decision}\n${tabs}`, /decision-debug/, "retired Decision debug route must stay absent");
assert.match(config, /checkAutomatically: "ON_LOAD"/);
assert.match(config, /BACKYRD_RELEASE_BUILD/);

console.log("Mobile Product contracts passed.");
