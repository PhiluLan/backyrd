import assert from "node:assert/strict";
import fs from "node:fs";

const eas = JSON.parse(fs.readFileSync(new URL("../eas.json", import.meta.url), "utf8"));
const production = eas.build?.production?.env ?? {};
const baseUrl = production.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = production.EXPO_PUBLIC_SUPABASE_ANON_KEY;

assert.ok(baseUrl && anonKey, "Production Supabase public configuration is required");

async function loadCatalog(query, city = "Basel", limit = 160) {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/distribution_trust_spot_catalog_v1`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_query: query,
      p_city: city,
      p_limit: limit,
      p_surface: "discovery",
    }),
  });
  assert.equal(response.ok, true, `Canonical Product image catalog failed (${response.status})`);
  const data = await response.json();
  assert.ok(Array.isArray(data), "Canonical Product image catalog must be an array");
  return data;
}

async function probeImage(url) {
  if (!/^https:\/\//i.test(String(url ?? ""))) return { status: "NO_CANONICAL_PHOTO" };
  const imageResponse = await fetch(encodeURI(url), { headers: { Range: "bytes=0-1023" } });
  const contentType = imageResponse.headers.get("content-type") ?? "";
  return imageResponse.ok && contentType.startsWith("image/")
    ? { status: "RENDERABLE", httpStatus: imageResponse.status, contentType }
    : { status: "UNREACHABLE", httpStatus: imageResponse.status, contentType };
}

const catalog = await loadCatalog(null);

const candidates = catalog.filter((spot) => /^https:\/\//i.test(String(spot.header_photo_url ?? "")));
const proof = [];

for (const spot of candidates.slice(0, 40)) {
  const result = await probeImage(spot.header_photo_url);
  if (result.status === "RENDERABLE") {
    proof.push({ id: spot.id, name: spot.name, status: result.httpStatus, contentType: result.contentType });
  }
  if (proof.length === 5) break;
}

assert.equal(proof.length, 5, `Expected five renderable real Product photos; received ${proof.length}`);
console.log("Production image gate passed:");
for (const spot of proof) {
  console.log(`- ${spot.name} (${spot.id}) ${spot.status} ${spot.contentType}`);
}

console.log("Curated image audit:");
for (const target of [
  "ELYS Boulderloft",
  "Naturhistorisches Museum Basel",
  "Tierpark Lange Erlen",
  "Zoo Basel",
  "Volta Bräu",
  "KaBar",
  "Galizi",
]) {
  const matches = await loadCatalog(target, null, 8);
  const spot = matches.find((candidate) => candidate.name?.toLocaleLowerCase("de-CH") === target.toLocaleLowerCase("de-CH")) ?? matches[0];
  const result = spot ? await probeImage(spot.header_photo_url) : { status: "NOT_PRODUCT_VISIBLE" };
  console.log(`- ${target}: ${spot?.id ?? "—"} ${result.status}`);
}
