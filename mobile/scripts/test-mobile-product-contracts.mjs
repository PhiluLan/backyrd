import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const decision = read("app/(tabs)/decision.tsx");
const home = read("app/(tabs)/index.tsx");
const tabs = read("app/(tabs)/_layout.tsx");
const profile = read("lib/profile.ts");
const config = read("app.config.ts");
const spotImages = read("lib/spot-images.ts");
const spotArtwork = read("components/spot/SpotArtwork.tsx");

assert.match(decision, /DecisionCardAction = "next" \| "like" \| "dislike"/);
assert.match(decision, /if \(action !== "next" &&/, "neutral Next must bypass feedback");
assert.match(decision, /backyrd_record_visible_decision_impression_v1/, "exposure must be visible-card based");
assert.match(decision, /VISIBLE_EXPOSURE_MINIMUM_MS/, "exposure must require bounded foreground visibility");
assert.match(decision, /AppState\.currentState!=="active"/, "background card mounts must not create exposure");
assert.match(decision, /clearTimeout\(timer\)/, "card transitions must cancel pending exposure");
assert.match(decision, /actionType: "navigation_intent"/, "Route must emit canonical navigation intent");
assert.match(decision, /data\.north_star\?\.active !== true/, "canonical user must fail closed without North-Star");
assert.doesNotMatch(decision, /decision-copy|create_decision_session_v1|Math\.max\(\s*82/);
assert.match(home, /pathname: "\/\(tabs\)\/decision"/, "Home search must enter Decision");
assert.match(home, /auto: "1"/, "Home submission must execute Decision");
assert.match(home, /loadDiscoverySpots/, "Home must use the canonical Product-visible catalog");
assert.doesNotMatch(home, /\.from\(["']spots["']\)/, "Home must not rebuild Product visibility in the client");
assert.doesNotMatch(home, /GERADE ANGESAGT/i, "Home must not make an unsupported trending claim");
assert.match(spotImages, /distribution_trust_spot_catalog_v1/, "image discovery must reuse Product visibility");
assert.match(spotImages, /headerPhotoUrl[\s\S]*photoUrl[\s\S]*headerPhotoPath/, "image precedence must remain deterministic");
assert.match(spotArtwork, /cachePolicy="memory-disk"/, "editorial images must use the device cache");
assert.match(spotArtwork, /onError=/, "image errors must have an explicit fallback path");
assert.match(decision, /<SpotArtwork/, "Decision must share the canonical image renderer");
assert.doesNotMatch(tabs, /checkForUpdateAsync|fetchUpdateAsync|reloadAsync/, "Tabs must not control OTA lifecycle");
assert.doesNotMatch(profile, /\.insert\(|\.update\(/, "Mobile profile repair must remain read-only");
assert.doesNotMatch(`${decision}\n${tabs}`, /decision-debug/, "retired Decision debug route must stay absent");
assert.match(config, /checkAutomatically: "ON_LOAD"/);
assert.match(config, /BACKYRD_RELEASE_BUILD/);

console.log("Mobile Product contracts passed.");
