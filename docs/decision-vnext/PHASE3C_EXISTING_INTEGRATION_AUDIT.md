# Decision vNext Phase 3C — Existing Integration Audit

Status: technical Phase-3C evaluation slice; no Product or Production authority.

## Canonical starting point

The implementation starts at `ee71680ed81a9a93b20e2ad82166ef7b4db1190e`. The repository identities verified before implementation are:

- World authoring Founder evidence: `fb892599f3f623f53ec8efcd5fc084bd8e9f55e6a6317de7e23c8f7f0d168437`
- User Founder calibration record: `c7242a47ec14d71255f3a2b0db17918e1cc7d179683480399623723aab0d115f`
- User Product policy: `e6cecdd5107285eae1cb91b9ff29d2b4b8f2756cc3fff05bda14eb0fd6bb7be4`
- User signal registry: `2b6b502d14d68edb0f060708d456c119103e1af4823d37e67d18b674be6f4f13`
- Product Context combined release: `fa724e8a6616e502e34bc9ad0366bcb85a2ec05760074f411da18b5c1ed61725`

## Findings

Phase 3B is intentionally bound to World Registry 1.1. The current canonical World reader and authoring foundation use Registry 2.0. Phase 3C therefore introduces a narrow, content-addressed evaluation compatibility record. It does not mutate or silently reinterpret the Phase-3B policy.

No checked-in Founder World Cohort manifest exists. A valid externally supplied manifest and matching `WorldKnowledgeReaderPort` can be used together; neither may be supplied alone. The default lab therefore uses a deterministic synthetic fallback and identifies it in every result. Founder and synthetic World sources are never mixed.

The canonical User boundary remains `RelevantUserProjection`. The lab neither consumes raw events/evidence chains nor writes to User Intelligence. Neutral, no-consent, cold and kill-switch states stay neutral; any active synthetic projection is explicit and has no eligibility authority.

Direct Product/legacy tables, Decision-v13 calls, external providers, Product ranking weights and Production persistence are absent.

## Legacy and surface audit

Mobile, Web, Decision-v13, RPCs, Edge Functions and database state remain unchanged. The Founder UI is a new loopback-only evaluation surface. It is not wired into any Product client and does not imply parity with Legacy behavior.
