# Human Spot Editor V1 Validation

## Acceptance evidence

| Gate | Result | Evidence |
|---|---|---|
| Shared human language | PASS | Admin and Owner render the shared canonical authoring registry; technical keys are not the primary UI. |
| Founder/Admin | PASS | All-Spot read/write, proposal review and explicit accepted-fact correction are server-authorized. |
| Owner Basic/Pro | PASS | Own-Spot scope, capability enforcement, forged-Pro denial and downgrade truth retention are DB-tested. |
| Source and scope | PASS | Source identity is mandatory; Event/Program/Temporary proposals cannot enter general Spot truth. |
| Accepted-fact visibility | PASS | Current value, human source and checked date render per question. |
| Atomic qualification | PASS | Accept/retract rebuild accepted truth, N4 and readiness in one transaction; replay hash is deterministic. |
| Place type | PASS | Category adapter writes top-level and fact-level N4 identity consistently; invalid N4 becomes PARTIAL at Decision serialization. |
| Readiness | PASS | One human version; accepted contact satisfies Product contact; optional UNKNOWN does not block Gold. |
| Opening/daypart safety | PASS | Weekly schedule is distinct from open-now and cannot imply qualitative daypart suitability. |
| Commercial isolation | PASS | Owner tier is absent from N4 and organic inputs. |

## Museum acceptance path

The production Museum is not silently corrected. Historical `place_type=MUSEUM`, unscoped/event-derived family information, ambiguous `opening.status=OPEN`, and schedule-derived daypart claims are surfaced for Founder review. The Human Editor provides explicit supersede/stale actions while preserving history.

The controlled local transaction used a Museum-equivalent canonical flow:

1. Founder supplied source-bound `Environment = INDOOR` at Spot scope.
2. Founder accepted it.
3. The accepted fact produced `facts.environment=INDOOR` and only the frozen `environment.indoor` concept.
4. The Decision package retained the accepted-fact provenance.
5. A rainy request could authorize candidate-specific `INDOOR_MATCH`.
6. The transaction rolled back; no synthetic Production truth was created.

## Commands and outcomes

- clean local migration replay: PASS;
- Gold authoring SQL/RLS integration assertions: PASS;
- canonical semantics: 4/4 PASS;
- Research scope/opening/category regressions: 25/25 PASS;
- Decision input/orchestrator including Family + Age + Rain + Indoor: 32/32 PASS;
- targeted Admin and Owner lint: PASS;
- Admin and Owner TypeScript: PASS;
- Admin and Owner production builds: PASS.

Database lint reports only pre-existing extension functions and three unrelated legacy public functions; no Human Editor function is reported. The wider repository test suite has an existing local DB crash in `production_decision_input_runtime.sql`; the directly relevant transactional suite passes independently.

Frozen registries remain 45 Taste concepts and 60 N4 dimensions. Decision weights, N5, N6 and ranking are unchanged. Public Owner rollout remains off.
