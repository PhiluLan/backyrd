# ADR-010 — Week-2 server-authorized dark request adapter

## Decision

Introduce a default-off public adapter and a separate local/CI rehearsal module. The public adapter cannot mint activation authority and cannot reach the canonical World or User ports. The rehearsal consumes the existing canonical ports and Phase-3C evaluation without creating Product output.

## Rationale

This is the smallest reversible step that proves the complete request path while preserving the Week-1 safety boundary. It makes integration failures measurable without exposing a recommendation, changing eligibility, persisting observations or learning from synthetic behavior.

## Consequences

- World and User types remain owned by their canonical packages.
- The small compatibility interfaces can later accept canonical Week-2 port implementations without copying their semantics.
- The Phase-3C lab accepts a prevalidated canonical `RelevantUserProjection`; its existing fixture behavior remains the default.
- Product thresholds, ranking, confidence calibration, Production sampling and activation remain separate decisions.
