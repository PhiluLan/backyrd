# Decision v13 Production identity re-certification v16

Gate 5 changes no Decision semantic source, ranking behavior, Mood, Offering/Purpose, N3/N4/N5/N6 behavior, or reason authority. The protected 43-file semantic source set and `decision-v13` Engine are byte-identical to v15.

The certification evidence set changes because Gate 5 removes an inherited public-read achievement-assignment policy, narrows the table grants to owner-readable/server-writable behavior, and re-certifies the resulting canonical ACL and application-schema identities. This is a Product authorization correction, not a Decision-semantic change.

The database re-certification is not a hash-only update. The canonical zero-data boot proves the exact hardened grants and policy. Within a rolled-back transaction it restores only the two prior SELECT policies and seven prior client privilege facts, reproduces the complete prior ACL and application-schema fingerprints, then proves the hardened state survived rollback. A separate two-user SQL contract proves owner read succeeds, cross-user read returns no rows, anonymous read is absent, and direct authenticated assignment mutation remains denied.

Production Decision remains active version 123 with bundle SHA-256 `edbccf870a30c850cde97c59444b9a2f8d6e9d212dda257a86adb1fbf4fc088a`, `verify_jwt=true`, the same 40/40 byte-matched deployed source modules, and the exact entrypoint `import "./live-index.ts";` (SHA-256 `4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299`). The source-aware deployment plan classifies the Gate-5 change as one pending forward migration and no Edge Function deployment.

This is a complete operational evidence re-certification through the existing fail-closed contract. D2.1, D2.2, and D3.1 are regenerated from their validators. The negative guard suite continues to block one-byte Engine drift, an additional semantic source, Production identity drift, and incomplete re-certification.

## Canonical deployment recovery addendum

The first canonical-main Gate 5 deployment stopped before applying the migration because the Production job had not linked project `hjgcrrzfjchzqoegcywn`. The immutable failed audit proves that no SQL or Edge Function was deployed. The recovery is not a manual feature-branch deployment: an additive repository manifest binds failed main `8e6c04e4b5b87e9f7836fda93074b6d6392e9d1b`, failed workflow run `33552000155`, the pre-apply failure stage, the exact migration path, and its SHA-256. The normal canonical-main merge plan admits that migration only while the manifest is newly added against the bound failed main, then links only the bound Production project, compares the remote dry-run to the exact planned forward-migration set, and retains the result audit. Missing, extra, duplicate, malformed, mutated, or contradictory migrations remain blocked. Production Decision stays at v123 and no Decision Edge source is redeployed.
