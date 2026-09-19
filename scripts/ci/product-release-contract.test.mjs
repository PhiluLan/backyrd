import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Mobile uses the authenticated Product Decision contract without client authority", () => {
  const client = read("mobile/lib/decision/productDecision.ts");
  const contract = read("mobile/packages/product-decision-contract/src/index.mjs");
  const screen = read("mobile/app/(tabs)/wohin.tsx");
  const oldRoute = read("mobile/app/(tabs)/decision.tsx");
  assert.match(client, /supabase\.auth\.getSession\(\)/);
  assert.match(client, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.match(client, /DECISION_PRODUCT_RELEASE_BINDING/);
  assert.match(screen, /invokeDecisionProduct/);
  assert.match(screen, /candidate_impression/);
  assert.match(screen, /candidate_opened/);
  assert.match(oldRoute, /Redirect href="\/\(tabs\)\/wohin"/);
  assert.doesNotMatch(`${client}\n${contract}\n${screen}`, /decision-founder-live|legacyBody|fallbackFunction|FounderReleaseBinding|EXPO_PUBLIC_.*VNEXT|AsyncStorage/i);
});

test("Decision has exactly one deployable Product entrypoint", () => {
  const config = read("supabase/config.toml");
  const deploy = read("supabase/functions/decision-v13/index.deploy.ts");
  const implementation = read("supabase/functions/decision-v13/vnext-only.ts");
  const mobile = read("mobile/lib/decision/productDecision.ts");
  const web = read("web/lib/decision-web-api.ts");
  assert.match(config, /\[functions\.decision-v13\][\s\S]*entrypoint = "\.\/functions\/decision-v13\/index\.deploy\.ts"/);
  assert.equal(deploy.trim(), "import './vnext-only.ts';");
  assert.doesNotMatch(config, /\[functions\.decision-founder-live\]/);
  assert.doesNotMatch(`${deploy}\n${implementation}\n${mobile}\n${web}`, /legacyBody|fallbackFunction|north-star/);
  assert.equal(existsSync(new URL("supabase/functions/decision-founder-live/index.ts", root)), false);
});

test("public clients contain no privileged Supabase credential", () => {
  const mobile = read("mobile/lib/supabase.ts");
  const admin = read("admin-dashboard/lib/supabaseClient.ts");
  assert.match(mobile, /EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(`${mobile}\n${admin}`, /service[_-]?role|sb_secret_/i);
});
