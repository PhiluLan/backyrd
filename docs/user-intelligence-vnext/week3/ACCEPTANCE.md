# Acceptance

- Allowlisted, denied, manipuliert, abgelaufen und `NOT_CONFIGURED` werden deterministisch geprüft.
- Purpose, Environment, Request, Consent, Lifecycle, Release und alle Hashes sind gebunden.
- No Consent, Withdrawal, Reset, Erasure, Request Kill Switch und Emergency-OFF ergeben keine personenbezogene Projection.
- OFF liest weder Trust Context noch Events.
- Test-ON erzeugt ausschließlich die kanonische minimierte `RelevantUserProjection`.
- OFF → TEST-ON → Emergency-OFF hinterlässt keinen Cache, State, Write oder Product Output.
- Correction, Dedupe, verspätete Lieferung, Full-/Incremental-Parität und Replay bleiben Week‑2-kanonisch.
- Privacy Export erfordert weiterhin die separate Legal Authority.
- Post-Deploy Evidence meldet ohne Production Authority ausschließlich `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`.
- Reports müssen zweimal byte-identisch sein; der vollständige Report bleibt CI-Artefakt.
