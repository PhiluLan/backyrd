# Recertification Tooling V1.4 — `admin-data-additive`

## Purpose

`admin-data-additive` is the fail-closed pre-merge scope for additive Admin/data contracts. It does not authorize a runtime deployment, an Edge Function change, a Decision change, or a security-boundary relaxation.

Database CI keeps deployed Product lineage and candidate evidence separate. On pull requests, shipped Product lineage is reconstructed from the exact trusted PR base. The undeployed Admin/data head is independently verified by the V1.4 candidate gate and isolated database boot. On canonical `main`, Product lineage continues to be validated directly at `HEAD`.

The scope accepts only a correlated candidate set:

- one or more newly added, forward-only `supabase/migrations/*.sql` files;
- newly added positive and negative `supabase/tests/*.sql` acceptance tests;
- newly added, versioned candidate schema and Public ACL fingerprints below `supabase/canonical/admin-data-additive/<id>/`;
- newly added schema and ACL reconstruction SQL below `scripts/ci/admin-data-additive/<id>/`;
- one immutable evidence manifest below `docs/operations/admin-data-additive/`;
- related Admin presentation and documentation.

Existing migrations, fingerprints, evidence, Production files, Edge Functions, protected Decision sources, auth/security paths, and all other paths remain forbidden. The verifier derives hashes from the exact candidate Git tree; a hand-edited hash cannot make the fresh-boot runtime check pass.

## Evidence manifest

```json
{
  "schemaVersion": "backyrd-admin-data-additive-evidence-v1",
  "id": "restaurant-information-v1",
  "migrations": ["supabase/migrations/<forward-version>_restaurant_information_v1.sql"],
  "acceptanceTests": {
    "positive": ["supabase/tests/restaurant_information_v1_positive.sql"],
    "negative": ["supabase/tests/restaurant_information_v1_negative.sql"]
  },
  "fingerprints": {
    "baseline": {
      "applicationSchema": "supabase/canonical/application-schema-events-v1.sha256",
      "publicAcl": "supabase/canonical/public-acl-events-v1.sha256"
    },
    "candidate": {
      "applicationSchema": "supabase/canonical/admin-data-additive/restaurant-information-v1/application-schema.sha256",
      "publicAcl": "supabase/canonical/admin-data-additive/restaurant-information-v1/public-acl.sha256"
    }
  },
  "reconstruction": {
    "applicationSchema": "scripts/ci/admin-data-additive/restaurant-information-v1/application-schema-reconstruction.sql",
    "publicAcl": "scripts/ci/admin-data-additive/restaurant-information-v1/public-acl-reconstruction.sql"
  }
}
```

The reconstruction files contain the exact inverse of the candidate-owned schema and ACL delta. CI runs each reconstruction inside a transaction, computes the standard semantic fingerprint, requires the historical baseline value, and rolls back. This proves existing schema facts, RLS policies, grants, and default ACLs did not drift behind the additive delta.

## Required verification sequence

1. Generate candidate evidence from the exact canonical PR base, exact candidate commit, and candidate tree with `--scope admin-data-additive --admin-data-manifest <path>`.
2. Run the V1.4 pre-merge verifier against the exact PR base and PR head.
3. Run the complete Decision Lab suite, D2, D2.1, D2.2, D3.1, and protected-source checks.
4. The database workflow starts a fresh pinned Supabase stack, validates immutable migration lineage, computes the candidate schema/ACL fingerprints, executes positive and negative acceptance, and reconstructs both historical baselines.
5. Apply the immutable recertification record only from the valid exact-head receipt. No candidate receipt is an Active Consumer result.
6. After an authorized regular merge, the Active Consumer reads only `refs/remotes/origin/main` and recursively validates V44 and every active additive parent through the new record.

The deployment result for this tooling and for an additive database contract remains `NO_RUNTIME_DEPLOY`: no OTA and no manual Production runtime deployment.

### V1.4.3 isolated-checkout dependencies

The Database workflow runs `npm ci` inside the exact detached candidate checkout and does not use an npm cache as an identity source. Before an isolated V1.4 candidate can run, CI proves that the candidate lockfile is byte-identical to the bound canonical-base lockfile, then verifies installed package versions, resolved identities, and integrity metadata against that lockfile. `npm ls --all` additionally proves that the candidate dependency graph is complete. A missing package, modified installed identity, unreadable install record, or Base/Candidate lockfile drift fails closed before any candidate migration or acceptance test runs.

This dependency preparation does not change V1.4.2 ordering: the isolated canonical Base still proves historical Gate-5/6/7 ACL/schema baselines first; only then are the manifest-bound candidate migrations applied and the existing positive/negative acceptance, candidate fingerprints, and reconstruction contracts executed. Shipped Product Lineage remains the subsequent independent workflow step.

## Positive and negative matrix

| Case | Expected result |
|---|---|
| Exact V46 parent chain → V47 additive candidate | PASS |
| Exact base/head/tree, new migration, both acceptance classes, bound fingerprints and reconstruction | PASS |
| Missing positive or negative acceptance | FAIL |
| Modified or removed historical migration | FAIL |
| Non-forward migration version | FAIL |
| Candidate/baseline fingerprint substitution | FAIL |
| Migration, acceptance, reconstruction, or manifest hash tamper | FAIL |
| Reconstruction does not return exact historical schema/ACL | FAIL |
| Existing RLS/grant drift | FAIL via reconstruction fingerprint |
| Production, Edge Function, auth/security, Decision, D2/D3, or protected-source drift | FAIL |
| Unbound file or evidence outside the explicit correlated set | FAIL |
| Stale/foreign PR base, non-exact PR head, or tree mismatch | FAIL |
| Missing, replayed, forked, skipped, or tampered additive parent | FAIL |
