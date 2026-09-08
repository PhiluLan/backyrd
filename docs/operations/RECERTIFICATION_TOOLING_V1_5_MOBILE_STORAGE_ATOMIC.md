# Recertification Tooling V1.5 — `mobile-storage-atomic`

## Purpose

`mobile-storage-atomic` is a separate, fail-closed pre-merge scope for the completed Review Media Atomic fix. V1.4 and `admin-data-additive` remain unchanged. V1.5 does not authorize an OTA, an Edge Function or Auth change, a manual Production deployment, or a Decision-semantic change.

The scope admits exactly one correlated candidate consisting of:

- the existing `mobile/app/review/new.tsx`, `quick.tsx`, and `smart.tsx` consumers;
- the new `mobile/lib/review-media-upload.ts` helper, its new `mobile/scripts/test-review-media-upload.mjs` contract test, and the exact `mobile/package.json` test-script binding;
- exactly one new forward-only migration;
- exactly one modification to `supabase/canonical/storage.sql`, whose Review upload predicate must byte-match the reservation predicate in the migration;
- new Review-media database acceptance, versioned schema/ACL fingerprints, inverse reconstruction SQL, a candidate manifest, and explicitly bound documentation.

No directory-level Mobile allowlist exists. Every changed path must be named by the candidate manifest and must match the fixed path contract. Existing migrations, existing fingerprints, historical reconstruction, `supabase/production`, Edge Functions, Auth configuration, other Mobile features, protected Decision sources, Engine identity, Production identity, and D2/D3 parents remain immutable.

## Candidate manifest

The candidate adds exactly one `docs/operations/mobile-storage-atomic/<ID>.json` document:

```json
{
  "schemaVersion": "backyrd-mobile-storage-atomic-evidence-v1",
  "id": "review-media-atomic-v1",
  "migration": "supabase/migrations/<forward-version>_create_atomic_review_media_contract_v1.sql",
  "storagePolicy": "supabase/canonical/storage.sql",
  "mobile": {
    "consumers": [
      "mobile/app/review/new.tsx",
      "mobile/app/review/quick.tsx",
      "mobile/app/review/smart.tsx"
    ],
    "helper": "mobile/lib/review-media-upload.ts",
    "tests": ["mobile/scripts/test-review-media-upload.mjs"],
    "packageManifest": "mobile/package.json"
  },
  "acceptanceTests": ["supabase/tests/review_media_atomic_v1.sql"],
  "assertions": {
    "positive_atomic_publish": "supabase/tests/review_media_atomic_v1.sql",
    "reservation_user_review_path_bucket_mime_expiry_bound": "supabase/tests/review_media_atomic_v1.sql",
    "direct_review_photos_insert_denied": "supabase/tests/review_media_atomic_v1.sql",
    "foreign_user_denied": "supabase/tests/review_media_atomic_v1.sql",
    "foreign_review_denied": "supabase/tests/review_media_atomic_v1.sql",
    "foreign_path_denied": "supabase/tests/review_media_atomic_v1.sql",
    "foreign_bucket_denied": "supabase/tests/review_media_atomic_v1.sql",
    "mime_mismatch_denied": "supabase/tests/review_media_atomic_v1.sql",
    "missing_reservation_denied": "supabase/tests/review_media_atomic_v1.sql",
    "expired_reservation_denied": "supabase/tests/review_media_atomic_v1.sql",
    "consumed_reservation_denied": "supabase/tests/review_media_atomic_v1.sql",
    "upload_failure_no_review_or_smart_evidence": "mobile/scripts/test-review-media-upload.mjs",
    "bind_failure_no_review_or_smart_evidence": "supabase/tests/review_media_atomic_v1.sql",
    "exact_retry_idempotent": "mobile/scripts/test-review-media-upload.mjs"
  },
  "fingerprints": {
    "baseline": {
      "applicationSchema": "supabase/canonical/application-schema-events-v1.sha256",
      "publicAcl": "supabase/canonical/public-acl-events-v1.sha256"
    },
    "candidate": {
      "applicationSchema": "supabase/canonical/mobile-storage-atomic/review-media-atomic-v1/application-schema.sha256",
      "publicAcl": "supabase/canonical/mobile-storage-atomic/review-media-atomic-v1/public-acl.sha256"
    }
  },
  "reconstruction": {
    "applicationSchema": "scripts/ci/mobile-storage-atomic/review-media-atomic-v1/application-schema-reconstruction.sql",
    "publicAcl": "scripts/ci/mobile-storage-atomic/review-media-atomic-v1/public-acl-reconstruction.sql"
  },
  "documentation": ["docs/operations/REVIEW_MEDIA_ATOMIC_V1.md"]
}
```

Each assertion target must contain its exact `V15_ASSERT:<assertion-name>` marker. The marker is only a coverage binding: CI executes every named client and database test on the exact candidate tree. Hand-edited fingerprints or markers cannot replace runtime success.

## Required verification

1. The Quality gate derives the exact Git diff from the GitHub PR base/head, binds the candidate tree, and verifies that the base is the exact tip and a first-parent commit of real `origin/main`.
2. The V1.5 verifier hashes every admitted file from Git objects. It rejects missing, extra, renamed, modified-historical, foreign-Mobile, Production, Auth, Edge, Decision, D2/D3, or unbound files.
3. The Database workflow creates a clean canonical Supabase boot, validates immutable migration lineage, applies the canonical Storage policy, and runs the complete Review-media database and client acceptance matrix.
4. Candidate application-schema and Public-ACL fingerprints must match the fresh boot. New inverse reconstruction SQL must recover the exact baseline fingerprints inside rolled-back transactions.
5. The runtime matrix proves reservation ownership and review/path/bucket/MIME/size/expiry bindings, denial for missing/expired/consumed/foreign authority, direct `review_photos` insert denial, atomic Review and Smart-evidence publication, and exact retry idempotency.
6. The normal Decision Lab, D2, D2.1, D2.2, D3.1, D3-A, protected-source, Database, Security, Repository, and source-aware deployment checks remain mandatory.

### V1.5.1 clean-boot ordering

For a detected `mobile-storage-atomic` candidate, the Database workflow creates two clean detached checkouts. The first is bound to the exact canonical PR base and contains no candidate diff. Gate 5/6/7 lineage, ACL, application-schema, and historical reconstruction are proved exclusively from this checkout and its frozen fingerprints. Only after those proofs pass does the workflow apply the one manifest-bound migration and the candidate's canonical Storage-policy mirror from the exact PR-head checkout. The existing V1.5 candidate fingerprints, database/client acceptance, and rollback-only reconstruction then run against that candidate state.

The regression fixture follows the same boundary: its initial repository state is checked out from the real canonical base tree before the tooling under test and synthetic forward-only candidate are committed. A candidate HEAD can therefore never normalize its own migration or reconstruction into the fixture baseline. Existing migrations, global Gate 5/6/7 fingerprints, and historical reconstruction remain immutable and fail closed. After the detached candidate is proven clean, its client acceptance uses the repository's lockfile-installed dependencies through an explicit test-local link; the isolated checkout cannot silently fall back to globally installed packages.

Pre-merge receipts remain candidate-only evidence. They are never interpreted as an Active Consumer result. After a separately authorized regular merge, the Active Consumer still reads only the exact canonical `refs/remotes/origin/main` tip and validates the entire additive parent chain.

For a canonical `main` push, the workflow may expose the previous commit as `github.event.before`; that value is lineage context, not a PR base. V1.5.2 enters candidate mode only when both exact PR base and PR head are present. A missing half of that pair fails closed, while a normal main push performs the unchanged canonical clean boot on the checked-out main tip.

V1.5.3 applies the same event boundary to the synthetic Decision Lab matrix: its fixture accepts an explicit base only from `PR_BASE_SHA`. On canonical `main` pushes it resolves the exact `origin/main` tip directly, so `github.event.before` cannot be mistaken for a candidate base. The validator's exact base/head and first-parent checks remain unchanged.

## Positive and negative matrix

| Case | Required result |
|---|---|
| Exact canonical base, PR head, tree, fixed path set, hashes and complete assertions | PASS |
| Atomic standard and Smart Review publication after valid reservation and uploaded objects | PASS |
| Exact retry with identical identity, paths and payload | PASS without duplicate Review, media or Smart evidence |
| Foreign user, review, path or bucket | FAIL |
| Missing, expired or consumed reservation | FAIL |
| MIME mismatch, oversize or object-binding mismatch | FAIL |
| Upload or bind failure | FAIL with no Review and no Smart evidence |
| Direct authenticated `review_photos` insert | FAIL |
| Existing migration, fingerprint, reconstruction or trust record modified | FAIL |
| Extra migration, Mobile file, documentation or unbound evidence | FAIL |
| Client service-role/secret material | FAIL |
| Storage policy not mirrored by the migration predicate | FAIL |
| Production, Auth, Edge Function, Decision, Engine, protected source or D2/D3 parent drift | FAIL |
| Stale/foreign base, foreign head, tree mismatch or tampered artifact hash | FAIL |

For the V1.5 tooling PR itself, the source-aware deployment outcome must remain `NO_RUNTIME_DEPLOY`.
