# Backyrd Decision North Star — N4 Spot Intelligence

Status: **PASS — FOUNDATION VALIDATED, NOT PRODUCT-WIRED**

Date: 2026-08-17

Branch: `codex/decision-n4-spot-intelligence`

## 1. Architecture

`Existing Spot Data + Backyrd-derived Evidence + Owner Claims + Community/Outcome Evidence → validated Evidence → Fact/Interpretation aggregation → Global Profile + Contextual Adjustments → Confidence, Provenance, Contradictions and UNKNOWN → compact future N6 boundary`

N4 changes no retrieval, ranking or Product behavior. The canonical evidence/snapshot path is additive and service-only; Owner claims use a separate authenticated RPC.

## 2. Existing data mapping

N4 adapts the canonical `spots`, categories, `spot_moods`, reviews, ML documents/embeddings and Owner/Profile relationships as possible evidence sources. Existing rows remain authoritative in their own domains; no parallel Spot base record or Mood taxonomy is created. Existing Outcome availability is treated honestly: N4 defines its future evidence contract but does not invent N8 Outcomes.

## 3. Shared language and schema

The Spot model reuses Wave-3B.1's 45 canonical Taste concepts and N3's audience/time vocabulary. Eight Fact dimensions and seven decision-useful Spot extensions complete v1. Facts, interpretations and `UNKNOWN` remain structurally distinct. Full contract: [N4_SPOT_INTELLIGENCE_SCHEMA.md](./N4_SPOT_INTELLIGENCE_SCHEMA.md).

## 4. Evidence, provenance and Confidence

Supported source families are canonical Spot data, Backyrd-derived, Owner-provided, community-derived, Outcome-derived, external/imported and AI-derived. Every value carries source reference, observation/validity time, independent subject, provenance and contract version. AI-derived evidence additionally requires model/version and input hash.

Confidence combines bounded source reliability, freshness, independent subjects, evidence diversity, consistency and contradiction penalties. Repeated events from the same subject do not inflate independence. Stale data decays; conflicting evidence remains observable rather than being erased.

## 5. Context and temporal intelligence

A global Spot profile can be adjusted by one audience and/or one time Context. Thus a bar can be conversation-friendly in early evening and lively at night without thousands of profiles. `observed_at`, validity windows, calculation time and evidence watermark support rebuilds and stale handling.

## 6. Owner boundary and fairness

The immutable Product rule is **PAY TO BE UNDERSTOOD, NOT PAY TO RANK**. Premium unlocks richer structured Owner evidence only. It cannot enter organic ranking as payment, tier or completeness. A Free Spot with strong community evidence can be understood better than a misleading Premium Spot and can later outrank it when it is the true fit. Contract: [N4_OWNER_INTELLIGENCE_CONTRACT.md](./N4_OWNER_INTELLIGENCE_CONTRACT.md).

## 7. Security and privacy

The additive migration applies RLS and least privilege. Owners can submit/read claims only for Spots they own. Entitlements, canonical evidence, snapshots and audit rows are service-only; Premium is server-resolved. Client claim replay is idempotent, conflicts fail closed, floods are rate-limited and material changes are audited. Aggregated evidence never exposes private User profiles or histories to Owners.

## 8. Validation and performance

The prospectively frozen contract ran 3 seeds × 10 canonical scenarios. All mandatory gates pass: Fact Accuracy and Provenance `1.0`, Owner isolation/fairness/contradictions/Context/UNKNOWN/cross-city/security/N6 serialization/replay `1.0`, Confidence Brier below the `0.08` ceiling. Synthetic 300/1,000/10,000-Spot lookup and serialization paths remain far below the frozen local ceilings.

| Metric | Official result | Gate |
|---|---:|---:|
| Fact Accuracy | `1.0000` | `1.0000` |
| Provenance Completeness | `1.0000` | `1.0000` |
| Confidence Brier | `0.000649` | `<= 0.08` |
| Owner isolation / Free-Premium fairness | `1.0000 / 1.0000` | `1.0000 / 1.0000` |
| Context / UNKNOWN / Cross-city | `1.0000 / 1.0000 / 1.0000` | all `1.0000` |
| Security / N6 serialization / replay | `1.0000 / 1.0000 / 1.0000` | all `1.0000` |

Synthetic lookup p95 was `0.0384 ms`, `0.0318 ms` and `0.0245 ms` for 300, 1,000 and 10,000 cases; serialization p95 was `0.0047 ms`, `0.0022 ms` and `0.0013 ms`. These figures are local algorithm diagnostics only.

These measurements validate deterministic in-memory contracts, not Production database or network performance. Contract: [N4_SPOT_VALIDATION_CONTRACT.md](./N4_SPOT_VALIDATION_CONTRACT.md). Exact results and hashes are sealed in `decision-lab/baselines/n4-spot-intelligence-v1.json` and `decision-lab/config/n4-spot-intelligence-v1.freeze.json`.

## 9. Development findings

The first development assertion incorrectly expected misleading Owner claims to force low Confidence even when independent community and Outcome evidence formed a strong negative consensus. Before freeze, the evaluator was corrected: Owner claims remain isolated, while canonical evidence may confidently reject them. No failed development result is used as the official result.

`N4-MI-001`: the first freeze acceptance test required the official result file during the pre-result Preflight, contradicting the two-phase Freeze contract. Before any official run, the test was corrected to validate `PRE_OFFICIAL_RUN` while the result is absent and `SEALED_RESULT` afterward. Only the acceptance-test identity was re-frozen; Engine, migration, scenarios, metrics, thresholds and Validation Contract were unchanged.

`N4-MI-002`: the first disposable-database Preflight found that the new N4 SQL fixture omitted the existing non-null Spot coordinates. The fixture was anchored to fixed synthetic Basel coordinates, its DB-test identity was re-frozen, and the complete database acceptance was restarted. No schema, Engine, metric, threshold or scenario changed and no partial result was retained.

## 10. Boundaries and limitations

- no Product adapter populates canonical evidence or snapshots yet;
- no canonical billing system is invented; entitlement integration remains future Product work;
- community/Outcome aggregation is a contract boundary, not N8 Outcome Learning;
- no AI extraction pipeline is activated;
- calibration uses synthetic scenarios and requires later real-world evaluation;
- N5 must choose relevant User Intelligence, while N6 must choose relevant Spot fields and rank Candidates;
- no Owner UI, Analytics, sponsored ranking or Production rollout is included.

## 11. Readiness and verdicts

**N4 SPOT INTELLIGENCE — PASS**

**CANONICAL SPOT INTELLIGENCE — READY**

**USER/MOMENT/SPOT SEMANTIC COMPATIBILITY — PASS**

**SPOT CONFIDENCE & PROVENANCE — PASS**

**OWNER PREMIUM RANKING BOUNDARY — PASS**

**FREE/PREMIUM FAIRNESS — PASS**

**CONTEXTUAL SPOT INTELLIGENCE — READY**

**PRIVACY & SECURITY — PASS**

**SCIENTIFIC VALIDITY — PASS**

**N5 RELEVANT USER PROJECTION — READY**

**N6 AI DECISION BUDDY FOUNDATION — READY**

**PRODUCTION — UNCHANGED**
