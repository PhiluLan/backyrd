export function validateGate2Snapshot(snapshot, baseline = null) {
  const failures = [];
  let checks = 0;
  const assert = (condition, message) => {
    checks += 1;
    if (!condition) failures.push(message);
  };

  assert(snapshot.integrity.product_visible_test_fixture === 0, "Product-visible TEST/FIXTURE Spots must be zero");
  assert(snapshot.integrity.broken_identity === 0, "Broken launch identities must be zero");
  assert(snapshot.integrity.invalid_critical_coordinates === 0, "Invalid critical coordinates must be zero");
  assert(snapshot.integrity.broken_category_references === 0, "Broken category references must be zero");
  assert(snapshot.integrity.google_place_duplicate_groups.length === 0, "Definite Google Place duplicate groups must be zero");
  assert(snapshot.integrity.normalized_identity_duplicate_groups.length === 0, "Definite normalized identity duplicate groups must be zero");
  // Exact coordinates can legitimately be shared by distinct co-located venues.
  // They remain review evidence, not an automatic duplicate verdict.
  assert(snapshot.integrity.invalid_canonical_facts.length === 0, "Invalid current canonical facts must be zero");
  assert(snapshot.integrity.offering_hierarchy_conflicts.length === 0, "Offering hierarchy conflicts must be zero");
  assert(snapshot.integrity.n4_dimensions_registry === 60, "N4 dimension registry must remain 60");
  assert(snapshot.integrity.pending_or_processing_embedding_jobs === 0, "Launch embedding queue must have no pending/processing jobs");
  assert(snapshot.coverage.stale_embedding === 0, "Launch embeddings must match their canonical ML documents");
  assert(snapshot.core_intents.every((intent) => intent.ready), "Every core intent must meet factual candidate depth");
  assert(snapshot.universe.discovery_ready === snapshot.universe.launch_product_spots, "Every launch Product Spot must be Discovery Ready");

  if (baseline) {
    assert(baseline.contract_version === snapshot.contract_version, "Baseline contract version mismatch");
    assert(baseline.manifest.product_spot_ids_sha256 === snapshot.manifest.product_spot_ids_sha256, "Launch Product Spot membership changed without recertification");
    for (const key of ["discovery_ready", "decision_ready", "detail_ready", "reason_ready"]) {
      assert(snapshot.universe[key] >= baseline.universe[key], `${key.replaceAll("_", "-")} coverage regressed`);
    }
    for (const key of ["opening_hours_any", "canonical_web_image", "effective_description", "n4_three_dimensions", "canonical_fact_any", "ml_document", "embedding"]) {
      assert(snapshot.coverage[key] >= baseline.coverage[key], `${key.replaceAll("_", "-")} coverage regressed`);
    }
    assert(snapshot.coverage.stale_embedding <= baseline.coverage.stale_embedding, "stale-embedding count regressed");
    for (const expected of baseline.core_intents) {
      const actual = snapshot.core_intents.find((intent) => intent.intent === expected.intent);
      assert(Boolean(actual), `Core intent removed: ${expected.intent}`);
      if (actual) {
        assert(actual.factually_informed >= expected.factually_informed, `Core intent factual depth regressed: ${expected.intent}`);
        assert(actual.strong_confidence >= expected.strong_confidence, `Core intent confidence depth regressed: ${expected.intent}`);
      }
    }
  }

  return { verdict: failures.length ? "FAIL" : "PASS", checks, failures };
}
