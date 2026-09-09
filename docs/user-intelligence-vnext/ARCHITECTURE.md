# User Intelligence & Memory vNext — Phase-1-Architektur

Status: Contract-Foundation, ausschließlich synthetisch. Keine Production Truth, keine Product-Integration und keine neue Speicherung.

## Autoritäten

```text
Product Observation
  -> Canonical User Event (Tatsache)
  -> Evidence Chain (zusammenhängende Evidence, noch kein Production Builder)
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
- serverseitige Client-Observation-Bindung;
- getrennte Evidence-Chain-Segmente;
- Snapshot-, Projection-, Transparency- und Lifecycle-Contracts;
- maschinenlesbares Lifecycle- und Schema-Manifest;
- reine Memory-, World-, Context- und Decision-Ports;
- synthetische Fixtures und Negativtests.

## Nicht implementiert

Kein vollständiger Chain Builder, Reducer, Storage, Worker, Product Export, UI, Ranking, Shadow Traffic, Backfill, Supabase-Contract oder Production-Feature. Policy-Referenzen mit `UNRESOLVED_*` beziehungsweise `synthetic-*` sind bewusst keine Product-Freigabe.
