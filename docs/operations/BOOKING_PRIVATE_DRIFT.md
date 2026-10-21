# Private Booking schema and permission drift

The legacy application fingerprint covers `public` and `decision_lab`. Booking
also stores guest capabilities, operation outcomes, team invitations, allocation
memberships and mail dispatch evidence in `booking_private`. The additional
private scope closes that catalog/ACL observation gap without changing historical
fingerprints or broadening application permissions. No migration or runtime UI
change is required for this tooling increment.

## Scope and contract

`delivery/database-scopes/booking-private-v1.json` binds the independently
observed private fingerprint to every canonical schema migration's exact bytes,
the normalized migration ledger, the certified historical data-operation list,
and the exact observer and shared catalog engine bytes. Any future migration or
query change requires an explicit refreshed record and independent clean boot.
Verification never updates the expected record.

`booking-private-fingerprint.sql` opens a repeatable-read, read-only transaction
with a fixed search path, statement timeout and fixed `booking-private-v1` scope.
It observes only system catalogs and the migration ledger. Missing private
schema, malformed output, connection failure, changed inputs, unknown/missing
schema migrations or a different fingerprint fail closed. Certified historical
data-only migrations may be present in Production and absent from clean boot;
they are normalized using the existing audited list. Unknown versions are not
ignored. The private record includes 879 facts for the current 210-source-file
candidate (208 schema migrations after the two certified data-only exclusions).

The shared engine's default scope and resulting legacy fingerprint remain
unchanged. Its explicit private scope includes schema/relation/function owners,
columns/defaults, constraints/indexes, views, executable function definitions and
settings, RLS/forced RLS/policies, trigger definitions and enablement, sequence and
type contracts, explicit ACLs with grant options, effective client grants
(including individual columns and types), relevant default privileges, client
role security attributes and inherited roles. Public/anonymous grants and roles
outside the three normal client roles are retained in explicit ACL entries.
Guest rows, email content, capabilities and provider payloads are not selected or
logged. A data-only correction does not change this catalog fingerprint.

## Mandatory CI and read-only operating check

The canonical `validate-supabase-current.sh` now runs the scope unit tests, actual
rolled-back drift fixtures and exact expected private-scope verification before
it can issue a full database receipt. Changes to the observer, acceptance harness,
private evidence or receipt implementation always route to the database and
delivery-policy gates. This only adds checks; the destructive-migration classifier
and `delivery/product-authority-v1.json` are unchanged. Private query/harness/test/
evidence bytes are included in receipt inputs, so a previously green receipt
cannot be reused after they change.

For an explicitly approved target whose migrations match this candidate, the
additional operating comparison is read-only:

```sh
BACKYRD_BOOKING_SCOPE_DB_URL="$BACKYRD_PRODUCTION_DB_URL" \
  node scripts/ci/validate-booking-private-scope.mjs --mode verify
```

Provide the connection through the secure operating environment. Do not put its
value in documentation, logs or shell history. A private-scope match supplements
the existing public ACL/application fingerprints and authorization checks; it
does not replace them. Production currently remains at the earlier verified
schema 191 and cannot be certified against candidate 210 by this record. No
Production connection or operation was performed for this change.

To prepare a future record, first build the exact migration candidate in the
canonical disposable gate with `BACKYRD_KEEP_SUPABASE_RUNNING=true`. An old private
record intentionally blocks the gate. Review the migration/query change, then
explicitly run `--mode record` against that disposable loopback database with
`BACKYRD_BOOKING_DRIFT_EPHEMERAL=1`. Review the generated evidence and rerun the
whole canonical gate in a fresh database with normal verify mode. Record mode
refuses remote targets and is never part of CI verification. This is an expected
schema attestation, not permission to bless a drifted production database.

## Acceptance and limits

The actual local catalog harness detects 20 deliberately introduced changes,
including executable body/search path, owner, RLS, forced RLS, policy, enabled
trigger, schema usage/create, table/column/type/sequence permissions, PUBLIC
function execution, default privileges, inherited column access, columns,
constraints and indexes. Every mutation is rolled back and baseline stability is
rechecked. Positive cases prove row-data independence and separation from
unrelated public catalog changes. The exact ledger query is tested with allowed
historical data-only entries and an unknown migration, all rolled back.

The final canonical clean boot through candidate 210 passed all 27 Booking SQL
suites, baseline authorization, existing independent-session races, the new 20
drift cases and DB lint. All 69 targeted gate/lineage/release/classification unit
tests and all 110 delivery-policy tests passed. Shell syntax and the canonical
secret scan passed. The final full-execution receipt is
`4ebedba740d5c3dfcb0e1e1d947266b2b30c3fbe0481e7f26f7433b3737d07e2`;
its final-head evidence replay must also pass. The independently reconstructed
private fingerprint is
`1388671eb836983a5270288a01606491fe939fc7de7d38a9d501d842e718e974`.
Initial discovery/recording runs are not reused as final acceptance. Tests use the pinned CLI 2.80.0 / PostgreSQL `17.6.1.095`; changelog
review does not establish acceptance of a different provider/runtime version.

A fingerprint proves neither backup recoverability nor successful guest delivery.
Full restore/reconciliation rehearsal, target-specific post-migration observation,
sender/scheduler/webhook acceptance and a real restaurant/device pilot remain
open. There is no new production activation, app release or Aleno-parity claim.
