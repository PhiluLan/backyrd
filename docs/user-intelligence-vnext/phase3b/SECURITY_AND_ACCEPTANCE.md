# Security & Acceptance

## Trust-Einstiegspunkte

`parse` prüft nur Form und bekannte Versionen. Eigenhash-Prüfungen erkennen zufällige oder partielle Manipulation. Vertrauen entsteht erst durch:

- `verifyCalibrationPolicy`: exakter Vergleich mit der kanonischen Candidate Registry plus unabhängiger Policy Acceptance Anchor;
- `verifyCalibrationEvidence`: Subject, Authority, Eventsemantik und unabhängiger Phase-2-Evidence Anchor;
- Concept-Attribution: jede Referenz bindet die separat akzeptierte synthetische Concept-Registry über Version und Hash; unbekannte IDs scheitern;
- `verifyCalibrationReport`: rekonstruktiver Replay des gesamten Szenarios einschließlich aller inneren Interpretation-, Result- und Projection-Hashes.

## Negativgrenzen

- Clientgewählte Policy, Signalband, Satisfaction, Independence oder Long-Term-Umklassifizierung: abgewiesen.
- unbekannte, umbenannte oder vollständig neu gehashte Policy: abgewiesen.
- fremde Concept-Registry, unbekannte Concept-ID oder abweichender Registry-Hash: abgewiesen.
- manipulierte oder fremde Evidence mit neuem Eigenhash: gegen unveränderten Trust Anchor abgewiesen.
- `ownerTier`, Payment, Subscription, Advertising, Sponsoring, Eligibility- oder Ranking-Anweisung: an der Runtime-Grenze abgewiesen.
- Dwell, Quick Skip, Reject und andere ungeklärte Semantik: `NOT_CONFIGURED` und ohne Interpretation.
- Research-only-Signale: niemals in der Calibration Projection.
- No Consent, Withdrawal, Reset und Erasure: ohne Subject, Evidence, Interpretation oder personenbezogene Projection.
- Account Erasure: `DELETE` für `calibration_reports_subject_bound` und `calibration_rebuild_material` sowie alle bisherigen personenbezogenen Stores.

## Production-Grenze

Die `RelevantUserProjection` wird nicht erweitert und bleibt mangels produktionsautorisierter Interpretation Policy neutral. Das Lab verarbeitet ausschließlich synthetische Fixtures, besitzt kein Netzwerk-, Datenbank-, Producer-, Migration-, Ranking- oder Deployment-Wiring.
