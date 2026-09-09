# ADR-001: Kanonisches vNext-Autoritätsmodell

Status: Accepted for Phase 1

## Entscheidung

Beobachtungen gehören ausschließlich in Canonical Memory. Ableitungen entstehen ausschließlich durch eine manifestgebundene Reducer-Version. Das vollständige interne Ergebnis ist ein immutable Snapshot. Decision liest ausschließlich eine minimierte Relevant User Projection; der User liest ausschließlich eine getrennte Transparency View.

World Knowledge, Situational Context und Decision behalten Spot-Wahrheit, aktuellen Moment, Eligibility und Gewinnerauswahl.

Ein Client liefert nur eine beobachtete Zielbehauptung und lokale Korrelation. Canonical Journey, Session, Decision, Candidate und Spot werden aus serverseitiger Product Truth gebunden; Abweichungen scheitern fail-closed. Eine ungelöste Journey ist ausdrücklich nicht independence-fähig. Persistierter Save-/Reservation-State besitzt einen getrennten server-verifizierten Adaptervertrag und kann nicht durch die Wahl eines Client-Eventnamens erzeugt werden.

## Konsequenzen

- kein Full User Card Payload für Decision;
- keine Raw Events im Ranking;
- kein SQL- und JS-Reducer als parallele vNext-Autoritäten;
- Experience und Satisfaction bleiben getrennte Evidence-Segmente;
- jeder Store benötigt vor seiner Einführung einen Lifecycle-Vertrag;
- Replay bindet Contract-, Code-, Registry- und Policy-Identitäten;
- fehlender Consent oder UNKNOWN erzeugt keine Personalisierung.

## Verworfene Alternativen

Legacy-Profile als Autorität, Max-Magnitude pro Journey, direkte Reviewtext-Inferenz, Universal User Score und Dual Write wurden wegen Semantik-, Replay-, Privacy- und Migrationsrisiko verworfen.
