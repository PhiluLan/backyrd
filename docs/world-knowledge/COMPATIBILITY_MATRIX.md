# Compatibility matrix

| Existing component | Classification | Slice 1 decision |
|---|---|---|
| `packages/shared/src/dto/spot.ts` | KEEP | Current presentation DTO remains unchanged. A future adapter may project public identity/contact fields from World Knowledge. |
| `packages/canonical-semantics` current Product keys | KEEP | Remains canonical for today's Product/Decision contracts. It is not imported as World Truth. |
| `CANONICAL_OFFERINGS` | EXTEND via future adapter | Existing offerings can be mapped to the new separated Offering groups, but Burger/Pizza and service format require different domains. |
| Current `FACT_KEYS` / suitability fields | DEPRECATE as future World authority | Keep for current consumers; do not write new World semantics into coarse suitability keys. |
| `packages/decision-input-runtime` N4 serialization | KEEP | No current Decision behavior changes. Future vNext must consume a dedicated adapter, not this package directly. |
| N4 numerical confidence and concept snapshot | REPLACE for World trust | Qualitative World trust cannot be downcast to current numerical confidence without a separately approved adapter policy. |
| User Intelligence proposed `WorldKnowledgePort` | REPLACE | It mixes World concepts with numeric strength/confidence. The new port keeps World evidence and user concepts separate. |
| `packages/spot-research-runtime` | UNKNOWN | Research extraction can become a claim producer only after source binding, moderation, and AI-inference rules are approved. |
| Existing Spot database schema and facts | UNKNOWN | No schema assumption or migration is made in Slice 1. A later read-only mapping audit must precede migration design. |
| Philipps Casa prototype / draft PR #270 | KEEP as research evidence | UX and fixture semantics inform tests; no runtime dependency or catalog import exists. |
| Decision v13 and N4 Production consumers | KEEP | No connection, ranking change, release record, or deployment is created. |

The only current integration is CI recognition of the new shared TypeScript package.
