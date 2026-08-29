#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CITY_CONFIGS, PIPELINE_VERSION, attachEphemeralGoogleIdentities, buildDiscoveryGrid,
  buildGoogleDiscoveryPlan, candidateIdentityKey, canonicalJson, createCityBootstrapRepository, evaluateCandidate,
  executeGoogleDiscovery, executeOsmDiscovery, normalizeDiscoveredCandidate, reconcileCandidates,
  selectLaunchCohort, selectRepresentativePilot, sha256, validateCityConfig
} from "../../packages/city-bootstrap-runtime/src/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [cityKey, command, ...args] = process.argv.slice(2);
const config = CITY_CONFIGS[cityKey];
const option = (name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const outputPath = resolve(root, option("--output", `docs/spot-intelligence/manifests/${cityKey ?? "unknown"}-${command ?? "unknown"}.json`));
const operationalOption = option("--operational-output");

function operationalPath(value) {
  if (!value) return null;
  const path = resolve(root, value), localRoot = resolve(root, ".city-bootstrap"), rel = relative(localRoot, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("--operational-output must be inside ignored .city-bootstrap/");
  return path;
}
function publicCandidate(row) {
  const { identityKey: _identityKey, sourceFingerprint: _sourceFingerprint, googlePlaceId: _googlePlaceId, ...safe } = row;
  return safe;
}
async function writeArtifact(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${canonicalJson(value)}\n`); }

function usage() {
  console.log("Usage: node scripts/spot-intelligence/city-bootstrap.mjs <basel|zurich> <config-validate|plan|dry-run|pilot-manifest|select|stage|status|validate-batch|publish-batch> [options]");
  console.log("dry-run: --source osm|google|both --output <file>; provider data is never persisted by this command");
  console.log("pilot-manifest/select: --input <manifest> --output <file>; status: --run-id <uuid>");
}
if (!config || !command) { usage(); process.exitCode = 2; }
else if (command === "config-validate") {
  const verdict = validateCityConfig(config); console.log(JSON.stringify({ city: config.key, ...verdict }, null, 2)); if (!verdict.valid) process.exitCode = 1;
} else if (command === "plan") {
  const grid = buildDiscoveryGrid(config), googlePlan = buildGoogleDiscoveryPlan(config, grid);
  console.log(JSON.stringify({ pipelineVersion: PIPELINE_VERSION, city: config.key, gridPoints: grid.length, googleQueries: googlePlan.length, osmQueries: 1, target: config.target, productionWrites: 0 }, null, 2));
} else if (command === "dry-run") {
  const source = option("--source", "osm"); if (!["osm", "google", "both"].includes(source)) throw new Error("source_invalid");
  const existingPath = option("--existing"), existingProduction = args.includes("--existing-production");
  let existing = existingPath ? JSON.parse(await readFile(resolve(root, existingPath), "utf8")) : [];
  if (existingProduction) {
    const baseUrl = process.env.CITY_BOOTSTRAP_SUPABASE_URL, serviceKey = process.env.CITY_BOOTSTRAP_SUPABASE_SERVICE_KEY;
    if (!baseUrl || !serviceKey) throw new Error("--existing-production requires CITY_BOOTSTRAP Supabase credentials");
    existing = await createCityBootstrapRepository({ baseUrl, serviceKey }).loadExistingSpots(config.name);
  }
  let osm = [], google = [], providerCalls = 0;
  if (["osm", "both"].includes(source)) { osm = await executeOsmDiscovery(config); providerCalls += 1; }
  if (["google", "both"].includes(source)) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY; if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is required for Google dry-run");
    const plan = buildGoogleDiscoveryPlan(config, buildDiscoveryGrid(config));
    for (const query of plan) { google.push(...await executeGoogleDiscovery(query, { apiKey })); providerCalls += 1; }
  }
  let candidates = reconcileCandidates(osm.map((row) => normalizeDiscoveredCandidate(row, config))), googleLinkage = { linked: [], ambiguous: [], unmatched: [] };
  if (google.length) { googleLinkage = attachEphemeralGoogleIdentities(candidates, google); candidates = googleLinkage.candidates; }
  const evaluated = candidates.map((row) => evaluateCandidate(row, existing));
  const manifest = { artifactType: "BACKYRD_CITY_BOOTSTRAP_DRY_RUN_V1", pipelineVersion: PIPELINE_VERSION, city: config.key, geography: config.geography, generatedAt: new Date().toISOString(), source, providerCalls, legalBoundary: { googleContentPersisted: false, googlePlaceIdsPersistable: true, osmLicense: "ODbL-1.0" }, counts: { rawOsm: osm.length, rawGoogleEphemeral: google.length, uniqueRetainable: evaluated.length, relevant: evaluated.filter((row) => row.relevance.state === "RELEVANT").length, existingMatches: evaluated.filter((row) => row.identity.state === "MATCHED_EXISTING").length, newIdentities: evaluated.filter((row) => row.identity.state === "NEW_IDENTITY").length, ambiguousIdentities: evaluated.filter((row) => row.identity.state === "AMBIGUOUS").length, evidencePending: evaluated.filter((row) => row.lifecycleState === "EVIDENCE_PENDING").length, reviewRequired: evaluated.filter((row) => row.lifecycleState === "REVIEW_REQUIRED").length, rejected: evaluated.filter((row) => row.lifecycleState === "REJECTED").length }, googleLinkage: { linked: googleLinkage.linked, ambiguous: googleLinkage.ambiguous, unmatchedCount: googleLinkage.unmatched.length }, candidates: evaluated, productionWrites: 0 };
  const operational = operationalPath(operationalOption); if (operational) await writeArtifact(operational, manifest);
  const publicManifest = { ...manifest, artifactType: "BACKYRD_CITY_BOOTSTRAP_PUBLIC_MANIFEST_V1", googleLinkage: { linkedCount: googleLinkage.linked.length, ambiguousCount: googleLinkage.ambiguous.length, unmatchedCount: googleLinkage.unmatched.length }, candidates: evaluated.map(publicCandidate) };
  await writeArtifact(outputPath, publicManifest); console.log(JSON.stringify({ output: outputPath, operationalOutput: operational, counts: manifest.counts, productionWrites: 0 }, null, 2));
} else if (["pilot-manifest", "select"].includes(command)) {
  const input = option("--input"); if (!input) throw new Error("--input is required"); const manifest = JSON.parse(await readFile(resolve(root, input), "utf8"));
  const candidates = manifest.candidates ?? [];
  const result = command === "pilot-manifest" ? { artifactType: "BACKYRD_CITY_BOOTSTRAP_PILOT_MANIFEST_V1", city: config.key, candidates: selectRepresentativePilot(candidates, config.target.pilotSize) } : { artifactType: "BACKYRD_CITY_BOOTSTRAP_SELECTION_V1", city: config.key, ...selectLaunchCohort(candidates, [], config, Number(option("--target-new", config.target.minProductSpots - 99))) };
  const generated = { ...result, generatedAt: new Date().toISOString(), productionWrites: 0 }, operational = operationalPath(operationalOption);
  if (operational) await writeArtifact(operational, generated);
  const safeResult = result.candidates ? { ...result, candidates: result.candidates.map(publicCandidate) } : { ...result, selected: result.selected.map(publicCandidate), remaining: result.remaining.map(publicCandidate) };
  await writeArtifact(outputPath, { ...safeResult, generatedAt: generated.generatedAt, productionWrites: 0 }); console.log(JSON.stringify({ output: outputPath, operationalOutput: operational, selected: result.candidates?.length ?? result.selected?.length ?? 0, productionWrites: 0 }, null, 2));
} else if (command === "stage") {
  const input = option("--input"), mode = option("--mode", "SHADOW"), commit = option("--commit"), requestedBy = option("--requested-by");
  const baseUrl = process.env.CITY_BOOTSTRAP_SUPABASE_URL, serviceKey = process.env.CITY_BOOTSTRAP_SUPABASE_SERVICE_KEY;
  if (!input || !["SHADOW", "PILOT", "SCALE", "REFRESH"].includes(mode) || !/^[0-9a-f]{40}$/.test(commit ?? "") || !baseUrl || !serviceKey) throw new Error("stage requires --input, valid --mode/--commit and CITY_BOOTSTRAP Supabase credentials");
  if (mode !== "SHADOW" && !requestedBy) throw new Error("non-shadow stage requires --requested-by Admin/Founder UUID");
  const manifest = JSON.parse(await readFile(resolve(root, input), "utf8")); const repository = createCityBootstrapRepository({ baseUrl, serviceKey });
  const runKey = option("--run-key", `${config.key}-${mode.toLowerCase()}-${new Date().toISOString().slice(0,10)}`);
  let run = await repository.loadRun(runKey); if (!run) run = await repository.createRun({ run_key: runKey, city_key: config.key, city_name: config.name, geography: config.bounds, source_configuration: { source: manifest.source, legalBoundary: manifest.legalBoundary }, target_configuration: config.target, pipeline_version: PIPELINE_VERSION, canonical_repository_commit: commit, mode, status: "RUNNING", requested_by: requestedBy });
  const rows = (manifest.candidates ?? []).map((row) => ({ run_id: run.id, identity_key: row.identityKey ?? candidateIdentityKey(row), display_name: row.name, normalized_name: row.normalizedName, address: row.address, normalized_address: row.normalizedAddress || null, city: config.name, country: config.country, lat: row.lat, lng: row.lng, website: row.website, phone: row.phone, google_place_id: row.googlePlaceId, external_types: row.externalTypes, canonical_category_name: row.relevance?.categoryName, relevance_state: row.relevance?.state ?? "UNCLASSIFIED", relevance_reason: row.relevance?.reason, relevance_confidence: row.relevance?.confidence, identity_state: row.identity?.state ?? "UNRESOLVED", identity_confidence: row.identity?.confidence, matched_spot_id: row.identity?.spotId, lifecycle_state: row.lifecycleState ?? "DISCOVERED", source_fingerprint: row.sourceFingerprint ?? sha256({ sourceFamily: row.sourceFamily, sourceIdentity: row.sourceIdentity, name: row.normalizedName, address: row.normalizedAddress, lat: row.lat, lng: row.lng, website: row.website, externalTypes: row.externalTypes }), enrichment_priority: Math.min(1000, Math.max(0, Math.round((row.sourceQuality ?? 0) * 100))) }));
  const persisted = await repository.persistCandidates(rows);
  const evidence = persisted.flatMap((row) => {
    const candidate = manifest.candidates.find((item) => (item.identityKey ?? candidateIdentityKey(item)) === row.identity_key);
    const rows = [{ candidate_id: row.id, source_family: "OPENSTREETMAP", source_identity: candidate?.sourceIdentity ?? row.identity_key, fact_family: "IDENTITY", normalized_value: { source: "OPENSTREETMAP" }, evidence_fingerprint: row.source_fingerprint, authority_class: "STRUCTURED_OPEN_DATA", legal_use_status: "PERMITTED", observed_at: manifest.generatedAt, pipeline_version: PIPELINE_VERSION }];
    if (row.google_place_id) rows.push({ candidate_id: row.id, source_family: "GOOGLE_PLACE_ID", source_identity: row.google_place_id, fact_family: "IDENTITY", normalized_value: { identifierOnly: true }, evidence_fingerprint: sha256({ candidateId: row.id, googlePlaceId: row.google_place_id }), authority_class: "IDENTIFIER_ONLY", legal_use_status: "IDENTIFIER_ONLY", observed_at: manifest.generatedAt, pipeline_version: PIPELINE_VERSION });
    return rows;
  });
  await repository.persistEvidence(evidence);
  await repository.enqueueJobs(persisted.filter((row) => row.lifecycle_state === "EVIDENCE_PENDING").map((row) => ({ run_id: run.id, candidate_id: row.id, stage: "EVIDENCE", idempotency_key: `evidence:${row.identity_key}:${row.source_fingerprint}` })));
  console.log(JSON.stringify({ runId: run.id, runKey, mode, candidates: persisted.length, productionSpotsWritten: 0 }, null, 2));
} else if (command === "status") {
  const runId = option("--run-id"), baseUrl = process.env.CITY_BOOTSTRAP_SUPABASE_URL, serviceKey = process.env.CITY_BOOTSTRAP_SUPABASE_SERVICE_KEY;
  if (!runId || !baseUrl || !serviceKey) throw new Error("--run-id and CITY_BOOTSTRAP_SUPABASE_URL/CITY_BOOTSTRAP_SUPABASE_SERVICE_KEY are required");
  const repository = createCityBootstrapRepository({ baseUrl, serviceKey }); console.log(JSON.stringify(await repository.status(runId), null, 2));
} else if (command === "validate-batch") {
  const runId = option("--run-id"), limit = Number(option("--limit", "30"));
  const baseUrl = process.env.CITY_BOOTSTRAP_SUPABASE_URL, serviceKey = process.env.CITY_BOOTSTRAP_SUPABASE_SERVICE_KEY;
  if (!runId || !baseUrl || !serviceKey) throw new Error("validate-batch requires --run-id and CITY_BOOTSTRAP credentials");
  const repository = createCityBootstrapRepository({ baseUrl, serviceKey }), rows = await repository.loadCandidatesByState(runId, "EVIDENCE_PENDING", limit), results = [];
  for (const row of rows) results.push(await repository.rpc("backyrd_city_bootstrap_validate_candidate_v1", { p_candidate_id: row.id }));
  console.log(JSON.stringify({ runId, attempted: rows.length, eligible: results.filter((row) => row.eligible).length }, null, 2));
} else if (command === "publish-batch") {
  const runId = option("--run-id"), limit = Number(option("--limit", "20")), confirmation = option("--confirm");
  const baseUrl = process.env.CITY_BOOTSTRAP_SUPABASE_URL, serviceKey = process.env.CITY_BOOTSTRAP_SUPABASE_SERVICE_KEY;
  if (!runId || confirmation !== `PUBLISH:${runId}` || !baseUrl || !serviceKey) throw new Error("publish-batch requires credentials and --confirm PUBLISH:<run-id>");
  const repository = createCityBootstrapRepository({ baseUrl, serviceKey }), status = await repository.status(runId);
  if (!["PILOT", "SCALE"].includes(status.run?.mode) || status.run?.status !== "RUNNING") throw new Error("run_not_publishable");
  const rows = await repository.loadPublishableCandidates(runId, limit), results = [];
  for (const row of rows) {
    const publication = await repository.rpc("backyrd_city_bootstrap_publish_candidate_v1", { p_candidate_id: row.id });
    const research = await repository.rpc("backyrd_city_bootstrap_enqueue_research_v1", { p_candidate_id: row.id });
    results.push({ candidateId: row.id, published: publication.published, replayed: publication.replayed, researchState: research.state, researchDeduplicated: research.deduplicated });
  }
  console.log(JSON.stringify({ runId, attempted: rows.length, results }, null, 2));
} else { usage(); process.exitCode = 2; }
