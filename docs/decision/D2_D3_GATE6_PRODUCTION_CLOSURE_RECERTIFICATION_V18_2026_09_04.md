# Decision v13 Production identity re-certification v18

Gate 6 is deployed from canonical Main `47858625ab1436c56626b2117573cc0976b460a5`. The source-aware workflow applied exactly `20260904184507_gate6_social_data_integrity.sql` and deployed only `process-account-deletion`; it did not deploy `decision-v13`. Consumer Web deployed from the same Main SHA, and Production OTA group `b5e2790d-788a-42eb-a4d8-15d065b9cda4` carries the same Mobile tree.

The post-deploy three-user Production acceptance proved one final relation for repeated Follow, Comment, Moment and Message mutations, exact Like relation/count agreement under parallel calls, denial of self/cross-user mutations, and rejection of new interactions on archived Spots. Cleanup returned the Production population to its exact pre-probe counts. Read-only forensics then re-confirmed zero active relation orphans, duplicate relations, unexplained aggregate drift, cross-user ownership defects, or active fixture leakage.

The protected Decision semantic source set and `decision-v13` Engine remain byte-identical to v17. Production Decision remains active version 123, `verify_jwt=true`, with bundle SHA-256 `edbccf870a30c850cde97c59444b9a2f8d6e9d212dda257a86adb1fbf4fc088a`, 40/40 matched modules, and entrypoint SHA-256 `4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299`.

The completed Product Lineage ledger remains part of the certification evidence set, so later delivery-identity drift stays fail-closed. Decision Production identity is also directly bound inside this contract. Engine, semantic source, evidence, freeze and Production identity validation all remain mandatory; the negative guard suite still blocks Engine drift, new protected sources, Production identity drift and incomplete re-certification.

No Gate 1-5 Product semantics changed. D2.1, D2.2 and D3.1 are regenerated from their existing validators solely for this completed Production evidence state.
