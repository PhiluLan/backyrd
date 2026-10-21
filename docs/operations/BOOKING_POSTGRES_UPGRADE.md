# Booking PostgreSQL upgrade readiness

## Scope and current decision

The canonical database gate remains CLI **2.80.0** with PostgreSQL image
**17.6.1.095**. Its previous passing receipts do not certify a different runtime.
No Production database upgrade, migration, extension change or reindex was made.

The [Supabase minor-release notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
identifies index, crypto and custom-operator compatibility checks for PostgreSQL
17.11. The [official image release](https://github.com/supabase/postgres/releases/tag/17.11.0.006)
was published on 2026-10-19. This investigation tests that actual image rather
than assuming that a new tag is operationally interchangeable.

## Isolated investigation, 2026-10-21

Source: canonical candidate `b10fb1fc2fc12688e5fbb25c2df5395a43e9f1f4`,
including migration 217. CLI 2.80.0 loads an exact image tag from its disposable
`supabase/.temp/postgres-version`; see its versioned
[configuration code](https://github.com/supabase/cli/blob/v2.80.0/pkg/config/config.go)
and [path definition](https://github.com/supabase/cli/blob/v2.80.0/pkg/config/utils.go).
Only temporary projects used this override. Canonical scripts were not edited.

Image: `public.ecr.aws/supabase/postgres:17.11.0.006`, manifest-list digest
`sha256:c141fd17ac6a76c4323e90b3aee8ff1a23d2e89e547c2b963cfadc309c079cc2`;
local arm64 manifest
`sha256:0dc4532986d493c8e424480112ac130f18090c80ce665251ac695d1fa1dd835a`.
The server reports **17.11**. No amd64 execution is claimed.

The exploratory clean boot applied the current canonical schema and passed the
existing baseline SQL, all **34 Booking SQL suites**, the existing actual
multi-connection races, and all **20 private catalog/ACL drift cases**. It then
stopped at private-scope verification. It did not reach DB lint or issue a
canonical gate receipt. The old input-bound receipt is not reused for this image.

A focused second bootstrap compared the actual catalog entries with an
independent 17.6 baseline:

| Scope | 17.6 entries | 17.11 entries | Exact difference |
| --- | ---: | ---: | --- |
| Private Booking | 1124 | 1123 | `EXTENSION\|pg_graphql` absent |
| Public/decision application | 11903 | 11902 | `EXTENSION\|pg_graphql` absent |

Every other compared entry matched. Effective public ACL fingerprint remained
`667f50dc521575226e0e9363ddbbc74c994f87d79add04d7f3f904b08c6b8232`.
This does not prove complete provider compatibility: managed extension objects
are deliberately outside these application fingerprints.

The 17.6 baseline installs `pg_graphql` **1.5.11**. The fresh 17.11 project did not
install it, while its available version was **1.6.2**. Creating 1.6.2 inside a
rolled-back administrative transaction succeeded. No persistent extension was
added. Changing the fingerprint to ignore this difference would hide a real
provider setup difference and is not an accepted fix.

## Repeatable metadata inventory

`scripts/ops/booking-postgres-upgrade-inventory.sql` runs in one read-only,
repeatable-read transaction with bounded statement/lock timeouts and a fixed
catalog search path. It emits server/extension metadata, candidate indexes and
custom operators with non-built-in estimators. It reads no guest rows, encrypted
payloads or function bodies and performs no reindex, grant or schema write.
Run using an explicitly selected database connection:

```sh
psql -X --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 \
  --file scripts/ops/booking-postgres-upgrade-inventory.sql
```

The complete synthetic 17.11 schema returned no ltree/GiST-float candidates or
custom-estimator operators. This is local evidence only. Candidate indexes
require follow-up; the inventory does not scan for NaN or deep ltree values.
`pgcrypto_data_scan: not_performed` explicitly prevents interpreting an empty
metadata result as crypto-data acceptance. Historical/dynamic/client crypto use
and restored encrypted values need their own assessment.

The verifier requires an explicit ephemeral flag and a loopback administrative
connection. It creates a uniquely named, empty test database and drops it in
`finally`; it does not use the connected database as fixture storage:

```sh
BACKYRD_BACKUP_EPHEMERAL=1 \
BACKYRD_UPGRADE_TEST_DB_URL='<explicit local administrator URL>' \
  node scripts/ops/verify-booking-postgres-upgrade-inventory.mjs
```

Real verification passed on both **17.6** and **17.11**: empty-catalog controls,
four positive index controls (ltree B-tree/GiST and plain/expression GiST float),
two exclusions (ordinary float B-tree and an INCLUDE-only float), and a custom
selectivity-estimator operator. Extension-owned operators were excluded. Missing
opt-in and remote connection inputs fail before database access. This is an
operator investigation tool, not another routine CI gate.

## Required before adopting the new runtime

1. Resolve and explicitly reproduce the managed extension baseline, including
   pg_graphql 1.5.11 → 1.6.2 behavior and the actual cloud provider setup. A local
   installation probe alone does not certify the GraphQL surface or restore.
2. Run the official detection checks against the intended source environment;
   establish crypto-data coverage separately. Any required online reindex or
   re-encryption needs a concrete reviewed operational plan.
3. Intentionally update the exact canonical runtime pin and its input-bound
   evidence, then pass the complete database gate including lint and positive /
   negative authorization. Preserve failure on unknown images and schema drift.
4. Repeat the populated cross-version logical restore, managed-control checks,
   guest-link/message-key recovery, original request replay and fresh writes.
   The existing 17.6 → 17.6 drill does not satisfy this requirement.
5. Keep Production activation separate and bound to a reviewed release,
   provider-version observation, recovery plan and post-upgrade smoke checks.

Local contact-free evidence is retained under
`.local/booking-postgres-upgrade-readiness-evidence.json`. Temporary databases,
projects and credential files are removed after inspection. No restaurant pilot
or practical equivalence with Aleno follows from this runtime investigation.
