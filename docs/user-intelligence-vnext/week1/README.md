# User Intelligence Week 1 — Dark Runtime & Privacy Foundation

Diese Foundation macht die bereits kanonischen User-Intelligence-Verträge für einen späteren serverseitigen Betrieb prüfbar, aktiviert aber nichts. Sämtliche Runtime-, Learning-, Write-, Projection-, Ranking-, Eligibility- und Shadow-Schalter sind fest auf `false`; der Kill Switch ist `FORCED_OFF`.

## Grenzen

- ausschließlich synthetische, lokale Inputs;
- kein Product-Event-Consumer, keine Datenbank und kein Persistenz-Port;
- Ingestion scheitert fail-closed mit `EVENT_INGESTION_DISABLED_FAIL_CLOSED`;
- Lifecycle-Aktionen erzeugen nur einen vollständigen Plan, niemals einen Completion-Nachweis;
- Privacy Export benötigt eine getrennte `PRIVACY_LEGAL_PROCESS`-Authority;
- Retention-Zeiträume bleiben `NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL`;
- Phase-3C-Policy und Phase-3D-Kalibrierung bleiben unverändert und inaktiv.

## Lokale Validierung

`npm run user-intelligence-vnext:week1:fast`

Der vollständige Release-Beleg wird reproduzierbar erzeugt. Das umfangreiche Artefakt bleibt CI-Artefakt; nur die kompakte Summary ist versioniert.
