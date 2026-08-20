# Sprint 2.1 validation

Local validation uses synthetic users and spots only. No provider or N6
call is made, and no production deployment occurs.

- `production_n4_read_adapter.sql`: canonical N4 serialization, explicit
  missing-N4 behavior, service-only access, comparative input availability,
  and the N5.8.4 absolute-negativity guard.
- `production_memory_bridge.sql`: Sprint 1 source-to-N2 semantics,
  idempotency, consent withdrawal, and service boundary.
- `production_user_intelligence_runtime.sql`: qualified review evidence,
  direct learning, deterministic rebuild, ledger, consent purge, and
  client denial.

The comparative test includes two N4-backed spots with opposite qualified
outcomes and one N4-unavailable spot. The unavailable spot produces no
invented comparative concept. Its review facts remain evidence-chain input
only.

The runtime reuses its existing N5.8.2 eligibility metadata and its N5.8.4
absolute-negativity condition: a comparative durable negative requires both
relative negative discrimination and net-negative concept-present evidence.
The fixture verifies that a merely weaker fit is not emitted as a durable
negative preference.

This adapter suite is not a replacement for the required Lab↔Production
golden parity suite; it establishes only the formerly missing production N4
read boundary. Visible decision-v13 behavior remains untouched: this is a disabled,
server-side background runtime and has no candidate, ranking, prompt, or UI
call site.
