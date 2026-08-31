# Spot Intelligence Pipeline V1 Acceptance

Final Founder Product Acceptance measured 2026-08-31. Overall verdict:
**PARTIAL SUCCESS / CLOSED**.

## Final Founder closure — supersedes the earlier technical verdict

The Founder physically inspected the Product result and closed this V1
workstream. City discovery, identity resolution, duplicate prevention,
publication, and Admin Operations succeeded. Automated Launch Curation did not
meet the original Product objective: too many of the 415 Basel Product Spots
remain materially incomplete in objective basis data, factual description, or
the existing Gold questions, and the remaining Human Review load is too high.
Philipp would still need to perform too much routine Spot-by-Spot curation.

This is a Product-acceptance failure, not authorization for further V1
iteration. Existing Product Spots, accepted truth, UNKNOWN states, Research and
Evidence lineage, audit history, and open reviews are preserved. No pending or
conflicting proposal is accepted by this closure.

Production closure state:

- Basel Product Spots: 415.
- Intelligence ledger: 415/415 terminal; 0 nonterminal Spots.
- Research jobs for the completed Population run: 0 nonterminal.
- Population run `d6b5bfb0-4236-44f9-aa80-68be421bc289`: `COMPLETED`, with
  Discovery disabled.
- Open Human Reviews: 209 (`203 PENDING`, `6 CONFLICT`).
- Unsupported auto-accepted canonical facts: 0. Two accepted proposal records
  flagged by a conservative closure query have no Accepted-Fact record and are
  therefore not canonical Product truth.
- Active Basel Research/Population scheduler entries: 0.
- Further Basel Research scheduled: no.
- The forward fix merged in PR #160 before the stop directive was not applied
  to Production. The Founder stop directive takes precedence; no further
  migration or Canary is authorized.

```text
BASEL PRODUCT SPOTS — 415
CITY BOOTSTRAP — PASS
DISCOVERY — PASS
IDENTITY RESOLUTION — PASS
DUPLICATE PREVENTION — PASS
ADMIN OPERATIONS — PASS
AUTOMATED LAUNCH CURATION — FAIL
FOUNDER MUST STILL ROUTINELY CURATE TOO MANY SPOTS — YES
OPEN HUMAN REVIEWS — 209
UNSUPPORTED AUTO-ACCEPTED FACTS — 0
FURTHER BASEL RESEARCH SCHEDULED — NO
CITY BOOTSTRAP / SPOT INTELLIGENCE PIPELINE V1 — PARTIAL SUCCESS / CLOSED
```

### Future work

Any future effort may address objective basis-data coverage, factual
descriptions, Gold-question completion, and bounded review load as a separately
authorized workstream. It must begin from the preserved 415-Spot corpus and
existing Trust/Evidence contracts; it must not reinterpret this closed V1 as a
request for more Basel discovery, automatic acceptance, historical rewriting,
or silent enrichment.

## Historical technical Production closure — superseded

The following technical closure was measured 2026-08-29 and is retained as
audit history. Its PASS verdict was superseded by the physical Founder Product
Acceptance above.

- Canonical Production lineage: `main` through `c2c83f88eae74422952abc3752465b2375e620da`; all required GitHub checks passed and the additive migrations and worker were deployed normally.
- Spot Engine Admin Operations: PASS. The authenticated Admin surface exposes Basel runs, metrics, pause/circuit-breaker reasons, candidates, failed jobs, telemetry, and auditable review actions through the existing server-side contracts. No client secret or service-role credential is exposed.
- Founder self-service review: YES. The final Production UI showed the completed scale run and 11 isolated routine Research reviews with Spot, proposed fact, scope, evidence, validation, confidence, conflict context, and authenticated accept/reject actions.
- Controlled Basel scale run `0b6810dc-c427-48ea-8668-2ec6a85ce588`: COMPLETED / PASS after 13 contiguous small-batch checkpoints; 247 candidates, 246 published, 1 rejected, 0 processing, 0 bootstrap-review-required, and 0 failed.
- Basel launch corpus: 415 Product Spots, all discovery-ready. The curated eligible selection was exhausted; the numeric 500–600 planning range was not pursued by lowering relevance or truth standards.
- Corpus integrity: definite identity duplicates 0, fixtures 0, invalid coordinates 0, broken category references 0, invalid canonical facts 0, and unsupported automatic canonical AI facts 0.
- Human intervention: 15 resolved interventions across 316 newly onboarded Product Spots, or 4.75 per 100. The controlled scale portion required 2 resolved interventions across 246 published Spots, or 0.81 per 100.
- Research quality: 12 scale proposals, 1 Founder-accepted and 11 safely pending; all canonical acceptance remained human-attributed and auditable. Three Research jobs failed closed on instance-scope mismatch. No new systematic truth-error class was observed.
- Refresh: the real unchanged-source refresh completed for 30 candidates with 30 skips, 0 provider calls, 0 product writes, 0 canonical facts, and 0 reviews.
- Retry/resume: the scale resumed safely after an isolated review pause and a server-side ACL fix; checkpoint numbering remained contiguous. Finalization replay was idempotent and returned the original completion timestamp.
- Operational cost telemetry: 210 Google Text Search Pro requests, 1,962,509 Research input tokens, 225,811 output tokens, and 241 web-search calls were observed for the complete Production workstream. Gross public-list-price estimate was about USD 10.07, or USD 0.032 per newly onboarded Product Spot; actual billed cost was not persisted by the provider telemetry contract.
- Product verification: Production Search, Map, Places, and Spot Detail smoke passed; the Places surface reported 415 Basel locations. Mobile contract, map-discovery, and canonical-image suites passed. Decision Lab guards, N4 registry checks, and the User Learning firewall passed without semantic changes.

```text
SPOT ENGINE ADMIN OPERATIONS — PASS
FOUNDER CAN OPERATE REVIEWS WITHOUT CODEX — YES
BASEL PRODUCT SPOTS — 415
HUMAN INTERVENTIONS PER 100 — 4.75
UNSUPPORTED CANONICAL AI FACTS — 0
CITY BOOTSTRAP / SPOT INTELLIGENCE PIPELINE V1 — PASS
```

The remainder of this document is the preserved pre-Production baseline that originally blocked acceptance. It remains as audit history and is not the current verdict.

## Historical pre-Production baseline

Measured earlier on 2026-08-29. Historical verdict: **FAIL**. The implementation and local database acceptance were green, but the required real pilot, production deployment, scaled corpus, measured AI/provider cost, human-review sample, refresh run, and client validation did not yet exist. This section does not convert implementation readiness into production proof.

## Evidence completed

- Canonical base: `origin/main` at `962eeb449ffff1acf7fa000c45e3281c6db95c8a`.
- Additive migration: `20260829092530_create_city_bootstrap_spot_intelligence_v1.sql`.
- Canonical local database boot and reviewed DB-lint baseline: PASS.
- City Bootstrap runtime: 12/12 tests PASS.
- Existing Spot Research runtime: 25/25 tests PASS.
- Existing Production Gate-2 corpus validator: 60/60 checks PASS, read-only.
- Basel and Zürich configuration/schema validation: PASS; Zürich provider calls and writes: 0.
- Secret scan and migration validation: PASS.
- Shadow discovery: one OSM call, 1,081 retainable unique candidates, 921 relevant, 41 existing matches, 1,021 new identities, 19 ambiguous identities, 324 evidence-pending, 718 review-required, 0 Production writes.
- Shadow pilot selection: 30 strong new candidates across seven categories, 0 Production writes.

## Exact changes and data movement

Production mutations performed:

| Record | Count |
| --- | ---: |
| New canonical Spots created | 0 |
| Existing Spots updated | 0 |
| Spots archived | 0 |
| Candidate records | 0 |
| Evidence records | 0 |
| Accepted Facts | 0 |
| Sources | 0 |
| N4 rebuilds | 0 |
| Offering/Purpose changes | 0 |
| Embedding jobs | 0 |
| Review cases | 0 |
| Other operational records | 0 |

No destructive change occurred. The repository adds nine operational tables, six service-only RPCs, one server-only orchestration function, and one unique partial Spot Place-ID index. Local database tests use synthetic records inside a rollback scope.

## Before / after

Readiness definitions were unchanged.

| Metric | Before | After/current |
| --- | ---: | ---: |
| Basel launch Product Spots | 99 | 99 |
| Discovery Ready | 99 | 99 |
| Decision Ready | 69 | 69 |
| Detail Ready | 66 | 66 |
| Reason Ready | 39 | 39 |
| Product-visible fixtures | 0 | 0 |
| Definite active identity duplicates | 0 | 0 |
| Invalid critical coordinates | 0 | 0 |
| Broken category references | 0 | 0 |

The Production validator also measured 60 N4 registry dimensions, zero stale embeddings, and no pending/processing embedding jobs. One known exact-coordinate pair represents distinct co-located institutions and is not an identity duplicate.

## Human labor, cost, performance, quality, refresh, and coverage

- New Spots onboarded: 0.
- Automatic no-human onboarding: 0.
- Human-reviewed onboarding/interventions: 0; per-100 and median handling time are not measurable.
- Top projected review reasons: weak identity evidence and ambiguous relevance. These are shadow routing counts, not resolved review statistics.
- Discovery/API/AI/other provider cost: not measured; OSM access has no measured request charge. Cost per Spot, 500-Spot estimate, and refresh cost are unavailable until a billed pilot.
- Shadow machine wall time observed for the final discovery + existing-corpus comparison + manifest operation was about 2.8 seconds in this environment. This is one provider observation, not a capacity benchmark. Pilot throughput, median, p95, retry rate, worker concurrency, stuck jobs, and resume behavior in Production are unmeasured.
- Identity/relevance/category/fact/unsupported-inference error rates: not measurable without the required human-reviewed pilot sample. Local deterministic tests are not substituted for statistical quality evidence.
- Incremental refresh decisions, unchanged-source skipping, change detection, leases, retry, and resume are implemented and locally tested; a real refresh run is not proven.
- Category/geographic candidate coverage is present in the manifest. Core-intent depth, long-tail Product improvement, and scaled readiness remain unchanged because nothing was published.

## Remaining gaps

### BLOCKER

1. A dedicated server-restricted Google Places key is unavailable to this execution environment; a browser key is intentionally not reused.
2. The migration and runtime are not merged to canonical `main` or deployed to Production.
3. The real 20–50 Spot pilot, human validation, provider/AI cost observation, pause/resume proof, refresh proof, and client smoke are not executed.
4. Therefore the bounded scale run and justified 500–600 Spot Basel corpus do not exist.

### IMPORTANT_NON_BLOCKER

- Admin has no new dedicated City Bootstrap review UI; operational review is represented in schema/RPCs and canonical fact review remains in the existing Admin flow.
- The 324 OSM-strong candidates are insufficient alone to reach the target after accounting for the existing 99. Google/official-source corroboration is required without lowering identity standards.

### ACCEPTABLE_UNKNOWN

- Actual Google coverage, billed cost, official-site availability, long-tail enrichment yield, review resolution time, and venue churn cadence.

### FUTURE_WORK

- Trusted Community and verified Owner evidence adapters, using the same evidence boundary without direct canonical overwrite.
- Dedicated aggregated operations dashboard after the pipeline has real run data.

## Final verdicts — pipeline

```text
CITY BOOTSTRAP / SPOT INTELLIGENCE PIPELINE V1 — FAIL

DISCOVERY PIPELINE — PASS
RELEVANCE FILTER — FAIL
IDENTITY RESOLUTION — FAIL
DUPLICATE PREVENTION — PASS
EVIDENCE ACQUISITION — FAIL
STRUCTURED EXTRACTION — PASS
AI OUTPUT VALIDATION — PASS
CANONICAL RECONCILIATION — FAIL
HUMAN REVIEW — FAIL
PRODUCT PUBLICATION — FAIL
INCREMENTAL REFRESH — FAIL
RESUME / IDEMPOTENCY — FAIL
CIRCUIT BREAKER — PASS
COST OBSERVABILITY — FAIL
PIPELINE HEALTH — FAIL
SECOND-CITY CONFIGURABILITY — PASS
```

`FAIL` above means required real-pilot/Production proof is absent; it does not mean the corresponding local implementation test failed.

## Final verdicts — corpus and automation

```text
BASEL PRODUCT SPOTS BEFORE — 99
BASEL PRODUCT SPOTS AFTER — 99
TARGET ORDER OF MAGNITUDE — 500–600
TARGET JUSTIFIED — NO

DISCOVERY READY BEFORE — 99
DISCOVERY READY AFTER — 99
DECISION READY BEFORE — 69
DECISION READY AFTER — 69
DETAIL READY BEFORE — 66
DETAIL READY AFTER — 66
REASON READY BEFORE — 39
REASON READY AFTER — 39

PRODUCT-VISIBLE FIXTURES — 0
DEFINITE ACTIVE DUPLICATES — 0
INVALID CRITICAL COORDINATES — 0
BROKEN CATEGORY REFERENCES — 0
BROKEN PRODUCT SPOT DETAILS — 0 OBSERVED BY GATE-2 VALIDATOR

NEW SPOTS ONBOARDED — 0
AUTOMATICALLY ONBOARDED WITHOUT HUMAN REVIEW — 0
HUMAN-REVIEWED — 0
HUMAN INTERVENTIONS — 0
HUMAN INTERVENTIONS PER 100 ONBOARDED SPOTS — NOT_MEASURABLE

CAN BASEL SCALE WITHOUT MANUAL SPOT-BY-SPOT ENTRY? — NOT_YET_PROVEN
COULD THE SAME PROCESS REASONABLY INITIALIZE ZÜRICH WITHOUT PHILIPP BECOMING THE DATA-ENTRY BOTTLENECK? — ARCHITECTURALLY_YES, OPERATIONALLY_NOT_YET_PROVEN
```

## Final verdicts — truth and identity

```text
UNSUPPORTED CANONICAL AI FACTS — 0 CREATED BY THIS WORKSTREAM
SYSTEMATIC HALLUCINATION PATTERN — 0 OBSERVED LOCALLY; REAL PILOT UNMEASURED
UNKNOWN → FABRICATED KNOWN — 0 OBSERVED LOCALLY
WEAK SOURCE OVERWROTE STRONGER TRUTH — 0
DIRECT AI → CANONICAL DB WRITE — NO

SOURCE PROVENANCE — PASS
EVIDENCE LINEAGE — PASS
SOURCE CONFLICT HANDLING — FAIL (NOT PRODUCTION-PROVEN)
NEGATIVE TRUTH HANDLING — PASS LOCALLY
UNKNOWN HANDLING — PASS LOCALLY
FACT-FAMILY FRESHNESS — PASS LOCALLY

N4 REGISTRY CHANGED — NO
N4 DIMENSIONS — 60
OFFERING/PURPOSE SEMANTICS CHANGED — NO
GOLD SEMANTICS CHANGED — NO
ADMIN QUALITY SEMANTICS CHANGED — NO

EXISTING SPOTS DUPLICATED — 0
NEW DEFINITE DUPLICATES — 0
MULTI-BUSINESS OVERMERGES — 0 OBSERVED LOCALLY
NAME-ONLY DEDUPE USED — NO
GOOGLE PLACE IDENTITY — PASS LOCALLY
ADDRESS IDENTITY — PASS LOCALLY
COORDINATE IDENTITY — PASS LOCALLY
WEBSITE/PHONE IDENTITY EVIDENCE — PASS LOCALLY
AMBIGUOUS IDENTITIES SAFELY ROUTED TO REVIEW — YES LOCALLY
RENAMES — SAFE LOCALLY
MOVES — SAFE LOCALLY
MULTIPLE BRANCHES — SAFE LOCALLY
CO-LOCATED BUSINESSES — SAFE LOCALLY
```

## Final verdicts — research, review, refresh, reliability

```text
RESEARCH AGENT — NOT_READY FOR THIS PIPELINE UNTIL REAL PILOT
OFFICIAL WEBSITE RESEARCH — PASS LOCALLY
EXTERNAL CONTENT ISOLATION — PASS
PROMPT INJECTION — PASS
SSRF — PASS
MALFORMED CONTENT — PASS
AI STRUCTURED OUTPUT — PASS
AI SCHEMA VALIDATION — PASS
AI MODEL LINEAGE — PASS
AI COST CONTROL — FAIL (UNMEASURED)
AI RETRY POLICY — PASS LOCALLY
AI DIRECT PRODUCT AUTHORITY — NO

REVIEW QUEUE — PASS LOCALLY
REVIEW DEDUPLICATION — PASS LOCALLY
REVIEW PRIORITY — PASS LOCALLY
REVIEW EVIDENCE QUALITY — FAIL (UNMEASURED)
REVIEW ACCEPT/REJECT — FAIL (NO END-TO-END PILOT)
REVIEW AUDIT — PASS LOCALLY
RESOLVED REVIEW REOPENING — FAIL (NOT PROVEN)
OPEN HIGH-PRIORITY REVIEW CASES BLOCKING LAUNCH — NOT MEASURABLE; LAUNCH BLOCKED BEFORE RUN
FOUNDER REQUIRED TO RESEARCH ROUTINE SPOTS MANUALLY — NO MANUAL RESEARCH PERFORMED; AUTOMATION NOT YET PROVEN

INCREMENTAL REFRESH — FAIL (NO REAL RUN)
UNCHANGED SOURCE SKIP — PASS LOCALLY
SOURCE CHANGE DETECTION — PASS LOCALLY
NEW CANDIDATE DETECTION — PASS
CLOSURE HANDLING — FAIL (NOT PROVEN)
CONFLICT RE-EVALUATION — FAIL (NOT PROVEN)
RENAME/MOVE RE-EVALUATION — PASS LOCALLY
FULL CITY DEEP REPROCESS REQUIRED FOR NORMAL REFRESH — NO BY DESIGN

BOUNDED CONCURRENCY — PASS LOCALLY
IDEMPOTENCY — PASS LOCALLY
CRASH RESUME — FAIL (NOT REAL-RUN PROVEN)
FULL RERUN IDEMPOTENCY — FAIL (NOT REAL-RUN PROVEN)
RETRY POLICY — PASS LOCALLY
CIRCUIT BREAKER — PASS LOCALLY
QUEUE HEALTH — FAIL (NO PRODUCTION RUN)
UNEXPLAINED FAILED PIPELINE JOBS — 0 CREATED
UNEXPLAINED STUCK PIPELINE JOBS — 0 CREATED
DUPLICATE CANONICAL WRITES FROM RETRY — 0 LOCALLY
```

## Final verdicts — cost, provider, firewalls, history

```text
DISCOVERED CANDIDATES — 1081
RELEVANT CANDIDATES — 921
UNIQUE CANDIDATES — 1081
EXISTING PRODUCT MATCHES — 41
SELECTED DEEP-ENRICHMENT COHORT — 30 SHADOW; 0 EXECUTED
BOOTSTRAP TOTAL COST — NOT MEASURED
COST PER ONBOARDED SPOT — NOT MEASURABLE
ESTIMATED 500-SPOT CITY COST — NOT CREDIBLE BEFORE PILOT
INCREMENTAL REFRESH COST — NOT MEASURED
MACHINE ELAPSED TIME — ~2.8s SHADOW OBSERVATION ONLY
HUMAN HANDLING TIME — NOT MEASURED
PIPELINE THROUGHPUT — NOT PRODUCTION-MEASURED
1,700-SPOT OPERATIONAL MODEL — VIABLE BY MODEL, NOT TESTED
5,000-SPOT OPERATIONAL MODEL — VIABLE BY MODEL, NOT TESTED
20,000-SPOT ARCHITECTURAL PATH — CREDIBLE, NOT TESTED

GOOGLE PLACES USAGE — BLOCKED
WEBSITE RESEARCH POLICY — PASS
PROVIDER RETENTION CONSTRAINTS — DOCUMENTED
IMAGE RIGHTS — DEFERRED; NO IMAGE INGESTION
COPYRIGHT-SAFE EXTRACTION — PASS LOCALLY
PUBLIC GOOGLE PHOTO PROXY — REMAINS DISABLED BY THIS CHANGE
PUBLIC-SPOT-PHOTO — NOT REVALIDATED IN SCALED CORPUS
SERVER SECRETS EXPOSED — 0
UNNECESSARY PERSONAL DATA COLLECTED — NO

DECISION ENGINE CHANGED — NO
DECISION RANKING CHANGED — NO
DECISION WEIGHTS CHANGED — NO
N3 CHANGED — NO
N4 REGISTRY CHANGED — NO
N5/N6 CHANGED — NO
REASON SELECTOR CHANGED — NO
USER LEARNING SEMANTICS CHANGED — NO
N2 REINTERPRETED — NO
USER CARDS GLOBALLY REBUILT — NO
SYNTHETIC TASTE CREATED — NO
SOCIAL SEMANTICS CHANGED — NO
AUTH/PRIVACY SEMANTICS CHANGED — NO
OWNER SEMANTICS CHANGED — NO
CORPUS READINESS AFFECTS FINAL_SCORE — NO
PIPELINE PRIORITY AFFECTS FINAL_SCORE — NO

REAL USER HISTORY DELETED — NO
RAW ANALYTICS HISTORY REWRITTEN — NO
DECISION HISTORY REWRITTEN — NO
REAL REVIEWS DELETED — NO
REAL MOMENTS DELETED — NO
SAFETY HISTORY DELETED — NO
HISTORICAL SPOT TRUTH PRESERVED — YES
FACT SUPERSESSION — UNCHANGED
EVIDENCE HISTORY — PASS LOCALLY
```

## Final verdicts — repository, clients, reuse, documentation

```text
CANONICAL DB BOOT — PASS
MIGRATION LINEAGE — PASS
MIGRATION REPAIR — NO
HISTORICAL MIGRATIONS REWRITTEN — NO
SCHEMA CHANGES — 9 TABLES, 4 RPCS, 1 UNIQUE PARTIAL INDEX
ADDITIVE MIGRATIONS — 20260829092530_create_city_bootstrap_spot_intelligence_v1.sql
CANONICAL MAIN — 962eeb449ffff1acf7fa000c45e3281c6db95c8a
PRODUCTION MIGRATION TIP — NOT DEPLOYED; PROPOSED TIP 20260829092530
ALL PRODUCTION PIPELINE CODE IN MAIN ANCESTRY — NO
FEATURE-BRANCH-ONLY PRODUCTION CODE — YES, BLOCKER UNTIL REVIEWED MERGE
GATE-1 INVARIANTS — PASS LOCALLY
GATE-2 CORPUS REGRESSION — PASS READ-ONLY
DECISION LAB — NOT RUN FOR SCALED CORPUS
D2/D3 GUARDS — UNCHANGED; NOT RE-RUN FOR SCALED CORPUS

CONSUMER WEB NEW-SPOT SMOKE — FAIL (NO NEW SPOT)
IOS/MOBILE NEW-SPOT SMOKE — FAIL (NO NEW SPOT)
SEARCH WITH SCALED CORPUS — FAIL (NO SCALED CORPUS)
ORTE LIST WITH SCALED CORPUS — FAIL
MAP WITH SCALED CORPUS — FAIL
SPOT DETAIL WITH NEW SPOTS — FAIL
DECISION CANDIDATE RETRIEVAL WITH SCALED CORPUS — FAIL
CLIENT PRODUCT SEMANTICS CHANGED — NO

BASEL CONFIGURATION — PASS
CITY CONFIGURATION CONTRACT — PASS
SECOND-CITY CONFIG VALIDATION — PASS
BASEL-SPECIFIC PIPELINE FORK REQUIRED — NO
HARDCODED BASEL SPOT IDS IN PIPELINE LOGIC — 0
CAN ZÜRICH ENTER THE SAME PIPELINE WITHOUT A NEW SYSTEM? — YES ARCHITECTURALLY
ZÜRICH ACTUALLY INGESTED — NO

PIPELINE ARCHITECTURE — DOCUMENTED
CITY BOOTSTRAP RUNBOOK — PASS
TRUTH OWNERSHIP — DOCUMENTED
REVIEW FLOW — DOCUMENTED
REFRESH FLOW — DOCUMENTED
PROVIDER CONSTRAINTS — DOCUMENTED
BASEL_BOOTSTRAP_CORPUS_V1 — NOT_CREATED
CANDIDATE UNIVERSE MANIFEST — CREATED
PIPELINE ACCEPTANCE REPORT — CREATED
```

## P0/P1 standard and handoff

P0 remaining in the implemented/local change: 0 observed. P1 acceptance gaps: 4 BLOCKER items listed above. The workstream cannot PASS.

Admin handoff: base SHA `962eeb449ffff1acf7fa000c45e3281c6db95c8a`; proposed migration tip `20260829092530`; new Production Spot count 0; nine new operational tables/four RPCs pending merge/deploy; no Admin UI change; PR #105 must be revalidated only after a real scaled corpus exists.

Android handoff: base SHA as above; backend additions are service-only operational contracts; corpus scale remains 99; client semantic changes are none.

Gate-3 handoff: not issued. There is no final scaled Basel corpus identity. Gate 3 must not start.
