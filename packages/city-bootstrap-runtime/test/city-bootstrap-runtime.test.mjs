import test from "node:test";
import assert from "node:assert/strict";
import {
  CITY_CONFIGS, DEFAULT_CIRCUIT_BREAKER, EXTERNAL_CONTENT_POLICY,
  acquireOfficialSourceFingerprint, attachEphemeralGoogleIdentities, buildDiscoveryGrid,
  buildGoogleDiscoveryPlan, circuitBreaker, classifyRelevance, evaluateCandidate,
  executeGoogleDiscovery, normalizeDiscoveredCandidate, refreshDecision, resolveIdentity,
  safeFetch, selectLaunchCohort, selectRepresentativePilot, validateCityConfig,
  validateExternalUrl
} from "../src/index.mjs";

const base = { sourceFamily: "OPENSTREETMAP", sourceIdentity: "node/1", sourceLicense: "ODbL-1.0", name: "Café Test", address: "Testweg 1", lat: 47.56, lng: 7.59, website: "https://cafe.example/", phone: "+41 61 000 00 00", externalTypes: ["cafe"], sourceFingerprint: "a".repeat(64) };
const candidate = () => normalizeDiscoveredCandidate(base, CITY_CONFIGS.basel);

test("Basel and non-executing Zürich configuration satisfy the same contract", () => {
  assert.equal(validateCityConfig(CITY_CONFIGS.basel).valid, true);
  assert.equal(validateCityConfig(CITY_CONFIGS.zurich).valid, true);
  assert.ok(buildDiscoveryGrid(CITY_CONFIGS.basel).length > 10);
  assert.ok(buildGoogleDiscoveryPlan(CITY_CONFIGS.basel, buildDiscoveryGrid(CITY_CONFIGS.basel)).length > 60);
});

test("relevance taxonomy is deterministic and fail-closed", () => {
  assert.deepEqual(classifyRelevance(["restaurant"]), { state: "RELEVANT", reason: "SUPPORTED_TYPE", confidence: "HIGH", categoryName: "Restaurant", matchedType: "restaurant" });
  assert.equal(classifyRelevance(["pharmacy"]).state, "IRRELEVANT");
  assert.equal(classifyRelevance(["tourist_attraction"]).state, "AMBIGUOUS");
  assert.equal(classifyRelevance(["novel_provider_type"]).reason, "UNMAPPED_EXTERNAL_TYPE");
});

test("identity uses provider, website, phone and composite evidence but never name alone", () => {
  const row = candidate();
  const spot = { id: "s1", name: row.name, address: row.address, lat: row.lat, lng: row.lng, website: row.website, phone: row.phone, google_place_id: null };
  assert.equal(resolveIdentity(row, [spot]).confidence, "STRONG");
  const nameOnly = { ...spot, id: "s2", address: "Other 99", lat: 47.59, lng: 7.62, website: null, phone: null };
  assert.equal(resolveIdentity({ ...row, website: null, phone: null }, [nameOnly]).state, "NEW_IDENTITY");
  assert.equal(resolveIdentity({ ...row, googlePlaceId: "g1" }, [{ ...spot, google_place_id: "g1" }]).confidence, "EXACT");
  assert.equal(resolveIdentity(row, [{ ...spot, website: "http://cafe.example/" }]).confidence, "STRONG");
});

test("co-located distinct businesses are not overmerged", () => {
  const row = { ...candidate(), name: "Museum Café", website: "https://cafe.example/" };
  const spots = [
    { id: "museum", name: "Museum", address: row.address, lat: row.lat, lng: row.lng, website: "https://museum.example/", phone: null, google_place_id: null },
    { id: "cafe", name: "Museum Café", address: row.address, lat: row.lat, lng: row.lng, website: row.website, phone: null, google_place_id: null }
  ];
  const result = resolveIdentity(row, spots); assert.equal(result.spotId, "cafe"); assert.equal(result.confidence, "STRONG");
});

test("rename/move ambiguity routes to review", () => {
  const row = { ...candidate(), website: null, phone: null, name: "New Name" };
  const result = evaluateCandidate(row, [{ id: "old", name: "Old Name", address: row.address, lat: row.lat, lng: row.lng, website: null, phone: null, google_place_id: null }]);
  assert.equal(result.lifecycleState, "REVIEW_REQUIRED"); assert.equal(result.reviewReason, "IDENTITY_AMBIGUOUS");
});

test("Google content remains ephemeral and only unambiguous Place IDs attach", () => {
  const row = candidate();
  const google = [{ googlePlaceId: "g1", ephemeral: { name: row.name, lat: row.lat, lng: row.lng } }, { googlePlaceId: "g2", ephemeral: { name: "Unknown", lat: row.lat, lng: row.lng } }];
  const result = attachEphemeralGoogleIdentities([row], google);
  assert.equal(result.linked.length, 1); assert.equal(result.candidates[0].googlePlaceId, "g1"); assert.deepEqual(result.unmatched, ["g2"]);
  assert.equal("ephemeral" in result.candidates[0], false);
});

test("Google adapter uses explicit field mask and validates provider schema", async () => {
  let headers;
  const result = await executeGoogleDiscovery({ body: {} }, { apiKey: "test", fetchImpl: async (_url, init) => { headers = init.headers; return new Response(JSON.stringify({ places: [{ id: "g1", displayName: { text: "Test" }, formattedAddress: "A", location: { latitude: 1, longitude: 2 }, types: ["cafe"] }] }), { status: 200, headers: { "content-type": "application/json" } }); } });
  assert.match(headers["x-goog-fieldmask"], /^places\.id,/); assert.equal(result[0].retention.content, "PROHIBITED_AFTER_SESSION");
});

test("SSRF and malformed external targets fail before fetch", () => {
  for (const url of ["http://example.com", "https://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "file:///etc/passwd", "https://user:pass@example.com"]) assert.throws(() => validateExternalUrl(url));
  assert.equal(validateExternalUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(EXTERNAL_CONTENT_POLICY.canonicalWriteAuthority, "NONE");
});

test("safe fetch rejects redirect-to-private, MIME and oversized content", async () => {
  const publicDns = async () => [{ address: "93.184.216.34" }];
  await assert.rejects(() => safeFetch("https://example.com", { resolveHost: publicDns, fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/secret" } }) }), /host_denied/);
  await assert.rejects(() => safeFetch("https://example.com", { resolveHost: async () => [{ address: "10.0.0.1" }], fetchImpl: async () => { throw new Error("must not fetch"); } }), /private_address_denied/);
  await assert.rejects(() => safeFetch("https://example.com", { resolveHost: publicDns, fetchImpl: async () => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/png" } }) }), /content_type_denied/);
  await assert.rejects(() => safeFetch("https://example.com", { resolveHost: publicDns, maxBytes: 2, fetchImpl: async () => new Response("large", { status: 200, headers: { "content-type": "text/html" } }) }), /content_too_large/);
  const fingerprint = await acquireOfficialSourceFingerprint("https://example.com", { resolveHost: publicDns, fetchImpl: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }) }); assert.match(fingerprint.fingerprint, /^[0-9a-f]{64}$/);
});

test("unchanged refresh skips deep work while changes and failures reprocess", () => {
  assert.equal(refreshDecision({ sourceFingerprint: "a" }, "a").process, false);
  assert.equal(refreshDecision({ sourceFingerprint: "a" }, "b").reason, "SOURCE_CHANGED");
  assert.equal(refreshDecision({ sourceFingerprint: "a" }, "a", { previousFailure: true }).process, true);
});

test("circuit breaker stops on truth, duplicate, provider and review anomalies", () => {
  assert.equal(circuitBreaker({ duplicateCreates: 1, fixtureLeakage: 0, canonicalUnauthorizedWrites: 0, processed: 1, providerFailures: 0, schemaFailures: 0, reviewRequired: 0 }, DEFAULT_CIRCUIT_BREAKER).stop, true);
  assert.equal(circuitBreaker({ duplicateCreates: 0, fixtureLeakage: 0, canonicalUnauthorizedWrites: 0, processed: 20, providerFailures: 6, schemaFailures: 0, reviewRequired: 0 }, DEFAULT_CIRCUIT_BREAKER).failures.includes("PROVIDER_FAILURE_SPIKE"), true);
  assert.equal(circuitBreaker({ duplicateCreates: 0, fixtureLeakage: 0, canonicalUnauthorizedWrites: 0, processed: 20, providerFailures: 0, schemaFailures: 0, reviewRequired: 11 }, DEFAULT_CIRCUIT_BREAKER).failures.includes("REVIEW_RATE_SPIKE"), true);
});

test("pilot and launch cohort selection are deterministic and breadth-aware", () => {
  const categories = ["Restaurant", "Café", "Bar", "Museum", "Aktivität", "Besonderes Erlebnis"];
  const rows = Array.from({ length: 36 }, (_, index) => ({ ...candidate(), identityKey: index.toString(16).padStart(64, "0"), lat: 47.525 + (index % 6) * 0.01, lng: 7.56 + (index % 5) * 0.01, relevance: { state: "RELEVANT", categoryName: categories[index % categories.length] }, identity: { state: "NEW_IDENTITY", confidence: "STRONG" }, sourceQuality: index % 3 }));
  const eligibleRows = rows.map((row) => ({ ...row, lifecycleState: "EVIDENCE_PENDING" }));
  const pilot = selectRepresentativePilot([...eligibleRows, { ...eligibleRows[0], identityKey: "f".repeat(64), lifecycleState: "REVIEW_REQUIRED" }], 30); assert.equal(pilot.length, 30); assert.ok(new Set(pilot.map((row) => row.relevance.categoryName)).size >= 6); assert.equal(pilot.some((row) => row.lifecycleState === "REVIEW_REQUIRED"), false);
  const cohort = selectLaunchCohort(rows, [], CITY_CONFIGS.basel, 24); assert.equal(cohort.selected.length, 24); assert.ok(Object.keys(cohort.categoryCounts).length >= 6); assert.ok(Object.keys(cohort.geographicCells).length > 1);
});
