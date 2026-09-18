# Acceptance

## Positive synthetische Grenze

- pseudonymes synthetisches Subject in `LOCAL_TEST` und `PROD_LIKE_TEST`;
- extern akzeptierte Release-, Slot- und Subject-Authority;
- servergebundener User, Subject, Session, Consent, Purpose, Request und Hash;
- ausschließlich minimierte `RelevantUserProjection`;
- Full-/Incremental-Parität, Dedupe, Correction und deterministischer Replay;
- OFF → TEST-ON → Emergency-OFF mit null Writes, null Netzwerk und null Product Outputs.

## Fail-closed

- unbekannter oder real wirkender Subject;
- fehlende oder manipulierte Release-/Trust-/Slot-/Authority-Bindung;
- falscher User, Subject, Session, Consent, Purpose, Request, Environment oder Hash;
- clientseitige `user_metadata` als Authority-Versuch;
- No Consent, Withdrawal, Reset, Erasure oder Kill Switch;
- Production-Konfiguration und Production-Relabeling;
- Raw Evidence, Freitext, präzise Standorte oder Commercial Fields im Projection-Port.

## Unverändert offen

- reale Founder-Account-Bindung;
- serverseitige Production-Authority-Implementierung;
- konkrete Retention-Zeiträume;
- Runtime-Aktivierung und Product Wiring;
- User Learning, Persistenz und Writeback;
- Ranking-, Eligibility- oder Confidence-Einfluss.

Diese Punkte verlangen jeweils eine neue, versionierte und separat freigegebene Authority-/Release-Entscheidung.
