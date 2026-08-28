# D2/D3 Production Decision Re-Certification — 2026-08-28

## Verdict

The current deterministic Decision identity is intentionally different from the historical D2.1 baseline. The change is not unexplained drift: it is the single versioned Product change `dce92ef1379d7ab5140f7dc0813d8ee017933d4b` (`feat(decision): add canonical offering purpose semantics`), whose parent still contains the frozen engine bytes.

Production Supabase project `hjgcrrzfjchzqoegcywn` is actively serving `decision-v13` version 73 with JWT verification enabled and bundle hash `e72daec25d5199cb25f517eef60a322441906e6da9dc3d7038077507744c5102`. Its Decision source files match the canonical candidate repository. The active Production semantics therefore correspond to the consciously versioned Offering/Purpose Product contract, not to an accidental or unreviewed mutation.

**CURRENT PRODUCTION DECISION SEMANTICS MATCH AUTHORIZED PRODUCT STATE — PASS**

## Exact identity difference

| Identity | Historical D2.1 | Re-certified Production baseline |
|---|---|---|
| `decision-v13/index.ts` | `a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba` | `28e178dee7192cb303b07574f31f1e86f58bc80048b23ba00bf032ca02c2bfc4` |
| D2.1 freeze manifest | `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf` | `af0944d2f2618faffd67ad50ecc332342888e2f9fbee68db9820b0dd9011d191` |
| D2.2 treatment freeze | `9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053` | `ed0b02408b3fc156551ff8f233d8c0fde68a18ba63596a3950b43ff529ed9038` |

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
- Production function version, JWT setting, bundle identity and exact repository-source match;
- eight explicit semantic invariants.

The protected semantic source-set hash is `99304c0113db860ef7db0c93bc566cf72ddd4236497551acd66bc54e91ff9efb`. The evidence-set hash is `1c1d26f912b9e5bcca56cbd6d08795a4fdfee1de5529cf2bdec97af6bb7ffce1`. Any unapproved byte change to those sets invalidates D2.1 and blocks D3.1.

D2.1 retains all nine hard gates and all 45 adversarial cases with zero false pass, zero false fail and zero `NOT_EVALUATED` leakage. D2.2 was re-executed against the authorized parent and passed all 18 treatment validations over three seeds and six maturity classes. D3.1 now accepts only the re-certified D2.1 and D2.2 identities and the current engine source hash.

## Governance result

The historical D2.1 freeze remains preserved in Git and is explicitly named as the superseded baseline. The current freeze does not claim that the engine was unchanged: it records `engineMutation: AUTHORIZED_RECERTIFICATION`. This prevents an authorized Product evolution from being mislabeled as `NONE` while keeping an unexplained future change blocked.

Historical Wave 3C and Wave 4 evidence remains bound to the archived, content-sealed D2.2 parent under `decision-lab/config/archive/`; those negative experimental results are not rewritten against the new Product baseline. Active D3 preflight reads the newly re-certified D2.2 freeze. This separates historical reproducibility from current Production readiness.

No guard exemption was added and no protected path was removed. This re-certification narrows acceptance to one exact authorized semantic state.

**D2/D3 FREEZE — RE-CERTIFIED**
