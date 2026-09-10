# User Intelligence & Memory vNext — Phase-2-Architektur

Phase 3A ergänzt diesen kanonischen Evidence-Layer additiv um den in [`phase3a/ADR-003-USER-MODEL-LEARNING-KERNEL.md`](phase3a/ADR-003-USER-MODEL-LEARNING-KERNEL.md) beschriebenen Learning Kernel. Es existiert weiterhin keine Production Interpretation Policy und kein Product Wiring.

Status: Event-Semantik- und Evidence-Chain-Foundation, ausschließlich synthetisch. Keine Product-Integration und keine neue Speicherung.

## Autoritäten

```text
Product Observation
  -> Canonical User Event (Tatsache)
  -> Canonical Event Catalog + Journey Resolution + Dedupe
  -> Evidence Chain v2 (zusammenhängende, auditierbare Evidence)
  -> versionierter Reducer (in Phase 1 nur Manifest-Platzhalter)
  -> User Intelligence Snapshot (vollständiges internes Read Model)
  -> Relevant User Projection (einzige Decision-Schnittstelle)

User Intelligence Snapshot
  -> User Transparency View (einzige userlesbare Schnittstelle)
```

World Knowledge besitzt Spot-Wahrheit, Situational Context den aktuellen Moment und Decision vNext Eligibility und Gewinnerauswahl. User Intelligence darf keine dieser Autoritäten übernehmen.

## Implementiert

- TypeScript-Contracts und strikte Runtime-Schemas;
- kanonische JSON-Serialisierung und SHA-256-Hashes;
- serverseitige Journey-/Reference-/Temporal-Bindung für Client Observations;
- getrennte Adapterverträge für Client Observation und server-verifizierten Product State;
- zentrale Event-Reference-Matrix und Correction-Konsistenz;
- getrennte Evidence-Chain-Segmente;
- Snapshot-, datensparsame Projection-, Transparency- und Account-Erasure-Contracts;
- maschinenlesbares Lifecycle- und Schema-Manifest;
- reine Memory-, World-, Context- und Decision-Ports;
- synthetische Fixtures und Negativtests.
- versionierter kanonischer Eventkatalog mit fail-closed `NOT_CONFIGURED`-Zuständen;
- deterministischer Journey Resolver ohne erfundene Zeitfenster;
- Idempotency-/Dedupe-Vertrag für Retry, Offline Queue und Product Source Records;
- vollständiger `EvidenceChainBuilder` mit pseudonymer Subject-Bindung, getrennten Slots, Uncertainty und Limitations;
- event-time World-Evidence-Consumer-Port und minimierte Context-Bindung;
- append-only Correction/Supersedes sowie byte-identischer Full-/Incremental-Rebuild;
- Evidence-Lifecycle für Withdrawal, Full Reset und Account Erasure.

## Nicht implementiert

Kein Taste-/Attribution-Reducer, Storage, Worker, Product Export, UI, Ranking, Shadow Traffic, Backfill, Supabase-Schema oder Production-Feature. Policy-Referenzen mit `UNRESOLVED_*` beziehungsweise `synthetic-*` sind bewusst keine Product-Freigabe. Decision v13, Decision vNext und World Knowledge bleiben unverändert.
