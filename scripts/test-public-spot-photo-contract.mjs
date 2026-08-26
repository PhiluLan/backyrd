import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const edge = read("supabase/functions/public-spot-photo/index.ts");
const migration = read("supabase/migrations/20260826193000_add_public_spot_photo_rate_limit_v1.sql");
const web = read("web/components/canonical-spot-image.tsx");
const authenticated = read("supabase/functions/google-place-photo/index.ts");

assert.match(edge, /spotIdPattern/, "public input must be a UUID Spot ID only");
assert.doesNotMatch(edge, /searchText|places:searchText/, "public photo reads must never execute Google text search");
assert.doesNotMatch(edge, /body\?\.(placeId|photoId|photoReference)/, "clients must not supply Google identities");
assert.match(edge, /\.eq\("status", "approved"\)/, "only approved spots may resolve");
assert.match(edge, /distribution_trust_entity_is_eligible_v1/, "public visibility must be checked server-side");
assert.match(edge, /ip-minute[\s\S]*global-minute[\s\S]*global-hour/, "IP and global rate limits are mandatory");
assert.match(edge, /saltedIpKey[\s\S]*PUBLIC_SPOT_PHOTO_RATE_LIMIT_SALT/, "raw IPs must not become durable counters");
assert.match(edge, /requestsInFlight/, "concurrent requests for one Spot must deduplicate");
assert.match(edge, /Cache-Control": "no-store"/, "Google content must not be persisted by our public endpoint");
assert.match(edge, /preferredOwnerImageFailed/, "broken Owner/Admin images must be able to fail over");
assert.match(migration, /service_role/, "rate-limit storage must not be client readable or writable");
assert.match(migration, /48 hours/, "operational counters must be pruned");
assert.match(web, /preferredOwnerImageFailed/, "public renderer must request failover only after owner render failure");
assert.match(authenticated, /authClient\.auth\.getUser\(\)/, "authenticated mobile resolver must remain authenticated");

console.log("Public Spot photo abuse and isolation contract passed.");
