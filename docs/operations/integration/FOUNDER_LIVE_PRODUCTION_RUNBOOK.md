# Founder-live Production runbook — prepared, not executable under this candidate

Status: `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`.

## Preconditions

All three domain candidates must be real and exactly sealed. The Integration PR must be merged through the regular protected path, its POST_MERGE_MAIN gate must be green, and a new explicit Production authorization must name the exact Main SHA, tree, artifact, migration plan, functions, auth plan, Founder cohort, and rollback controls.

## Later release sequence

1. Rebuild the source-aware plan from the authorized Main and compare it byte-for-byte with the approved plan.
2. Verify backup/restore evidence and the exact forward-only World migration set.
3. Apply only the explicitly approved World migrations.
4. Verify grants, RLS, reader version, and Admin authoring against the released World identity.
5. Release the User projection and Decision API with all routing switches OFF.
6. Release Mobile/Admin clients without activating vNext routing.
7. Add only the approved pseudonymous Founder subject to the server allowlist.
8. Enable the exact Founder release, observe bounded hash-only telemetry, and rehearse rollback.
9. Record post-deploy evidence bound to the released Main, tree, artifact, result hashes, and plan.

None of these steps is executed by this PR. It contains no credentials, real Founder ID, deployment invocation, OTA command, migration application, or runtime activation.
