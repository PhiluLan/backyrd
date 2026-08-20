# Production N5.6.1 Relevant User Projection

Status: Sprint 3, server-side staging/shadow only.

## Runtime

`packages/decision-input-runtime/src/projection.mjs` calls the frozen Lab `buildMomentAwareRelevantUserProjection` directly. The adapter supplies the canonical Current Moment and latest persisted canonical User Card, then serializes only the minimum relevant output.

The package contains signed taste, scope, confidence, relevance, sufficiency, suppression summary, uncertainty, and knowledge mode. Raw history and evidence references are excluded.

## Authority and suppression

- Explicit current intent wins over historical taste. A current quiet/conversation request suppresses conflicting historical `vibe.lively` evidence.
- Context nodes from another audience are suppressed.
- Place-Type nodes are used only for a matching Place Type.
- Low-confidence and low-relevance nodes remain suppressed by the frozen contract.
- Portable Global taste may cross cities when the frozen contract permits it; local Spot IDs, visits, and evidence trails never enter the projection.
- A vague request does not trigger a Global profile dump.

Knowledge modes are a Product serialization of the frozen sufficiency result:

| Frozen sufficiency | Product mode |
| --- | --- |
| `HIGH` | `SUFFICIENT` |
| `PARTIAL` | `PARTIAL` |
| `LOW` / `UNKNOWN` | `LOW_OR_UNKNOWN` |

## Cold start

No User Card is a valid state. The adapter creates a deterministic empty transport shell marked as not learned knowledge. N3 and candidate preparation continue; N5 emits no personal claims and `LOW_OR_UNKNOWN`.

## Verified scenarios

The same canonical User Card produces distinct Friends, Date, Solo, and Family projections where corresponding context evidence exists. The Copenhagen fixture carries portable Global/Place-Type knowledge but no Basel evidence reference. Broad unknown remains `LOW_OR_UNKNOWN` with zero selected taste nodes in the real Product-path E2E.
