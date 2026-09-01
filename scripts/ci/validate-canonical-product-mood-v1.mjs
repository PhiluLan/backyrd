import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  mobileDetail: "mobile/app/spot/[id].tsx",
  mobileMap: "mobile/app/(tabs)/map.tsx",
  mobileSubmit: "mobile/lib/reviewSubmit.ts",
  webDetail: "web/lib/public-spot-detail.ts",
  webServerDetail: "web/lib/public-spot-detail-server.ts",
  webReview: "web/components/consumer/review-form.tsx",
  webStyles: "web/app/consumer.css",
  mobileMoodInput: "mobile/components/MoodExpressionInput.tsx",
  adminMood: "admin-dashboard/app/moods/page.tsx",
  adminNav: "admin-dashboard/components/intelligence/Sidebar.tsx",
  edgeReview: "supabase/functions/create-review-with-photos/index.ts",
  shared: "packages/shared/src/contracts/mood.ts",
};
const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])));
for (const key of ["mobileDetail", "mobileMap", "webDetail", "webServerDetail"]) {
  assert.match(source[key], /backyrd_spot_mood_profile_public_v1/, `${key} does not read the canonical profile`);
  assert.doesNotMatch(source[key], /spot_moods_agg|\.from\(["']spot_moods["']\)/, `${key} reintroduced a legacy aggregate`);
}
for (const key of ["mobileSubmit", "edgeReview"]) {
  assert.doesNotMatch(source[key], /resolve_or_create_mood_token|backyrd_resolve_product_mood_v1|\.from\(["']mood_tokens["']\)/, `${key} reintroduced closed/legacy Mood writes`);
}
assert.doesNotMatch(source.webReview, /const moods\s*=|<select[^>]*id=["']mood-/, "Web reintroduced a local fixed Mood vocabulary");
for (const key of ["webReview", "mobileMoodInput"]) {
  assert.match(source[key], /backyrd_search_mood_concepts_v1/, `${key} does not use canonical autocomplete`);
}
assert.match(source.webReview, /role="listbox"/, "Web autocomplete suggestions are not explicitly selectable");
assert.match(source.webStyles, /\.b-mood-suggestion/, "Web autocomplete does not use the Consumer design system");
assert.match(source.mobileMoodInput, /<Pressable/, "Mobile canonical suggestions are not selectable");
assert.match(source.adminMood, /Ungültige Mood-Ausdrücke/, "Admin does not expose invalid governance state");
assert.match(source.adminNav, /href:\s*["']\/moods["']/, "Mood Engine is missing from active Admin navigation");
assert.match(source.edgeReview, /backyrd_resolve_mood_input_v2/, "Edge Review does not use the governed resolver");
assert.match(source.shared, /PRODUCT_MOOD_MAX_SELECTIONS = 2/, "shared max-two contract changed");
assert.match(source.shared, /PRODUCT_MOOD_PERCENTAGE_MIN_CONTRIBUTORS = 3/, "low-sample policy changed");
console.log("canonical Product Mood V1 static contract: PASS");
