# ADR-002 — Event Semantics und Evidence Chains

Status: vorgeschlagen für CTO-Review

Scope: User Intelligence vNext Phase 2, synthetische Foundation

## Entscheidung

Phase 2 führt vier getrennte Autoritäten ein:

1. Der Phase‑1-Eventvertrag belegt ein servergebundenes Product-Ereignis.
2. `CANONICAL_EVENT_CATALOG` legt seine zulässige semantische Klasse, References, Authority, Slots und verbotenen Interpretationen fest.
3. `resolveJourney` bindet ausschließlich autoritative Server-Links. Same-Spot oder zeitliche Nähe ergeben höchstens `PROBABLE_RELATED`, nie eine Journey oder Independence.
4. `buildEvidenceChains` erzeugt eine hashgebundene, pseudonyme und vollständig ledger-rückverfolgbare Chain. Sie erzeugt keine Taste-, Attribution-, Weight-, Confidence- oder Decay-Aussage.

Unklare Legacy-Events sind im Katalog sichtbar, aber `NOT_CONFIGURED`. Das ist ein Fail-closed-Zustand, kein unfertiger Alias.

## Deduplizierung

Event-ID, Idempotency Key und Product Source Record werden getrennt geprüft. Konfligierende Wiederverwendung scheitert. Standard-/Smart-Review desselben Review-Datensatzes wird als eine Product-Erfahrung dedupliziert. Verschiedene servergelöste Journeys werden auch am selben Spot nie zusammengelegt.

## Corrections und Replay

Corrections sind append-only und benötigen einen gehashten `SERVER_EVENT_LEDGER`-Lookup. Cross-User, Cross-Spot, nicht-vorherige Ziele und Zyklen scheitern. Das Ziel bleibt historisch enthalten, ist aber in der aktiven Chain inaktiv. Incremental Update führt denselben deterministischen Rebuild über den vereinigten kanonischen Ledger aus; Full und Incremental sind byte-identisch.

## World und Context

Der kleine `EventTimeWorldEvidenceProvider` ist ein User-Intelligence-Consumer-Port. Er übernimmt keine internen World-Verträge. Eine Bindung enthält nur Registry-/State-Hashes, Event-Zeit, referenzierte Concept-/Fact-IDs, Trust/Freshness, Provenance Summary, Conflicts, Unknowns und Exclusions. Evidence neuer als das Ereignis scheitert.

Context ist separat nach `USER_EXPLICIT`, `SERVER_AUTHORIZED`, `CAUTIOUSLY_INFERRED`, `UNKNOWN` und `NOT_CONFIGURED` gebunden. Rohstandort, private Social-Daten und Long-Term-Taste-Eignung sind strukturell `false`.

## Privacy und Lifecycle

Der Chain-Payload enthält keine direkte User-ID, Raw Review-/Search-Texte, Rohstandorte, fremde Profile, Payment, Owner Tier, Advertising, Sponsorship, rohe AI-Ausgaben oder Secrets. UNKNOWN/DENIED/WITHDRAWN Consent erzeugt keinen Chain-State. Account Erasure leert Ledger-Hashes, Chains, Pointer, Caches und Work Items und übernimmt die Phase‑1-Regel: jeder personenbezogene Store muss `DELETE` melden; nur nicht-personenbezogene Manifeste dürfen bleiben.

## Verworfene Alternativen

- Eventname als Semantik: verworfen wegen falscher Authority.
- Same-Spot-/Zeitfenster-Heuristik als Journey: verworfen wegen falscher Independence.
- Review, Visit, Save oder Dwell als automatisch positive Preference: verworfen wegen kausaler Überinterpretation.
- Kopie der parallelen World-Slice-2-Typen: verworfen, weil PR #272 nicht kanonisch ist.
- globaler Engagement-/Taste-Score: außerhalb des Nordsterns und explizit deferred.
