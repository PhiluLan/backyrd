# D2/D3 Production Decision Re-Certification — 2026-08-28

## Verdict

The current deterministic Decision identity is intentionally different from the historical D2.1 baseline. The change is not unexplained drift: it is the single versioned Product change `dce92ef1379d7ab5140f7dc0813d8ee017933d4b` (`feat(decision): add canonical offering purpose semantics`), whose parent still contains the frozen engine bytes.

Production Supabase project `hjgcrrzfjchzqoegcywn` is actively serving `decision-v13` version 73 with JWT verification enabled and bundle hash `e72daec25d320f3733028ad1af6760e68999bfaa341b66462e42dce51a941e65`. A byte-for-byte comparison of the deployed bundle found all 37 repository-backed files identical to canonical `main`. The 38th file is the deployment-only entrypoint `supabase/functions/decision-v13/index.deploy.ts`; its complete content is `import "./live-index.ts";` followed by one newline and its SHA-256 is `4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299`. The active Production semantics therefore correspond to the consciously versioned Offering/Purpose Product contract, not to an accidental or unreviewed mutation.

The previously certified bundle hash `e72daec25d5199cb25f517eef60a322441906e6da9dc3d7038077507744c5102` was stale and did not identify the active version 73 bundle. It is retained here as forensic evidence only and is not an authorized Production identity. The corrected identity is a Production re-certification; no Decision source or runtime semantic was changed.

**CURRENT PRODUCTION DECISION SEMANTICS MATCH AUTHORIZED PRODUCT STATE — PASS**

## Exact identity difference

| Identity | Historical D2.1 | Re-certified Production baseline |
|---|---|---|
| `decision-v13/index.ts` | `a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba` | `28e178dee7192cb303b07574f31f1e86f58bc80048b23ba00bf032ca02c2bfc4` |
| D2.1 freeze manifest | `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf` | `9f76589ae9ff8bd3aa904619f4f11382eadd97302a6b34d4283b5595b7beb9d6` |
| D2.2 treatment freeze | `9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053` | `114d196b53896eaf64b153ec83ad6cc9ccd3d7ddb97d55da6a740dcff5a86e31` |

The Constitution, scenario registry, evaluator, hard-gate registry, framework acceptance code and result schema did not change. Their hashes remain identical to the original D2.1 certification.

Git history proves that the engine source at parent `6016d811b424e07cb957824a0ec9d4c49219cb8d` has the historical `a3618a...` hash and that `dce92ef...` changes it to the current `28e178...` hash. No later commit changes `decision-v13/index.ts`.

## Authorized semantic change

The authorized extension adds two typed Spot-fact axes:

- Offering availability, with explicit `AVAILABLE`, `NOT_AVAILABLE` and `UNKNOWN` states;
- visit Purpose suitability, with explicit `SUITABLE`, `NOT_SUITABLE` and `UNKNOWN` states.

The Edge Function interprets an explicit request into those facts, retrieves exact factual matches through the service-role-only `backyrd_retrieve_spots_by_offering_v1` RPC, and adds them to the bounded candidate universe. The same Product/Distribution eligibility pass still filters every candidate before fusion. Exact matches are tail-included as a recall guarantee and receive no score or ordering bonus. The deterministic factual tuple remains ranking authority, and explanation copy requires confirmed candidate facts.

This extension is deliberately not User Taste, not a completeness boost, not a replacement ranking engine and not permission to compensate for a failed hard gate. Requests without Offering/Purpose intent produce empty fact requirements and retain the prior Decision path.

## Re-certification evidence

The versioned authorization contract is `decision-lab/config/decision-v13-production-recertification-v2.json`. It fails closed over:

- the historical engine identity and exact authorizing parent/change commits;
- the current engine source hash;
- the protected Production semantic source set across the legacy engine, live wrapper, response adapter, deterministic orchestrator, canonical semantics and additive migration;
- the Product contract and focused Offering/Purpose test evidence;
- Production function version, JWT setting, bundle identity, byte-identical 37-file repository source set and exact deployment-only entrypoint;
- eight explicit semantic invariants.

The protected semantic source-set hash is `99304c0113db860ef7db0c93bc566cf72ddd4236497551acd66bc54e91ff9efb`. The evidence-set hash is `87decc4fcc2509115164f9e472936030d5d4b857ca74407a731576196fb7ef35`; it includes the re-certification validator, scope guard and their regression evidence. The combined re-certification identity is `27f400d1b76f13b4cc794558d41907bbd473cbb64fc7a2c0cb99623931563614`. Any unapproved byte change to those sets invalidates D2.1 and blocks D3.1.

D2.1 retains all nine hard gates and all 45 adversarial cases with zero false pass, zero false fail and zero `NOT_EVALUATED` leakage. D2.2 was re-executed against the authorized parent and passed all 18 treatment validations over three seeds and six maturity classes. D3.1 now accepts only the re-certified D2.1 and D2.2 identities and the current engine source hash.

## Governance result

The historical D2.1 freeze remains preserved in Git and is explicitly named as the superseded baseline. The current freeze does not claim that the engine was unchanged: it records `engineMutation: AUTHORIZED_RECERTIFICATION`. This prevents an authorized Product evolution from being mislabeled as `NONE` while keeping an unexplained future change blocked.

Historical Wave 3C and Wave 4 evidence remains bound to the archived, content-sealed D2.2 parent under `decision-lab/config/archive/`; those negative experimental results are not rewritten against the new Product baseline. Active D3 preflight reads the newly re-certified D2.2 freeze. This separates historical reproducibility from current Production readiness.

No general guard exemption was added and no protected path was removed. This re-certification narrows acceptance to one exact authorized semantic state.

The real protected-scope guard accepts downstream byte-pinned Product integrations only when the Engine is unchanged or this complete re-certification validates. Regression coverage proves: unchanged baseline passes; a one-byte Engine change without re-certification fails; a new Decision source fails; altered Production identity fails; altered protected source-set identity fails; and the complete valid re-certification passes. No glob or path-wide exception is introduced.

**D2/D3 FREEZE — RE-CERTIFIED**
