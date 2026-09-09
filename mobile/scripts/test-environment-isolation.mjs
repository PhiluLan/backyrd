import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const eas = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8"));
const appConfig = readFileSync(new URL("../app.config.ts", import.meta.url), "utf8");
const profiles = eas.build ?? {};

for (const [name, environment] of Object.entries({ development: "development", "development-sim": "development", preview: "preview", "map-validation-sim": "preview", production: "production" })) {
  assert.equal(profiles[name]?.environment, environment, `${name} must bind an explicit EAS environment`);
  assert.equal("EXPO_PUBLIC_SUPABASE_URL" in (profiles[name]?.env ?? {}), false, `${name} must not commit a Supabase URL`);
  assert.equal("EXPO_PUBLIC_SUPABASE_ANON_KEY" in (profiles[name]?.env ?? {}), false, `${name} must not commit a Supabase key`);
}
for (const name of ["development", "development-sim", "preview", "map-validation-sim"]) {
  assert.equal(profiles[name]?.env?.APP_VARIANT, "dev", `${name} must use the isolated dev application identity`);
  assert.notEqual(profiles[name]?.channel, "production", `${name} must not receive the Production OTA channel`);
}
assert.match(appConfig, /Development and preview builds must not use the Production Supabase project/);
assert.match(appConfig, /Production releases must use the bound Production Supabase project/);
console.log("Mobile EAS environment isolation contract passed.");
