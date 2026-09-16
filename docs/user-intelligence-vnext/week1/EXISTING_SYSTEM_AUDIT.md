# Existing System Audit

| Bereich | Befund | Einstufung | Week-1-Behandlung |
|---|---|---|---|
| Phase 2 Evidence | rekursiv verifizierte, servergebundene Evidence Chains | KEEP | keine neue Ingestion; spätere Adapter müssen diesen Port nutzen |
| Phase 3A Model | deterministischer Full-/Incremental-Reducer und Lifecycle-Manifest | KEEP | synthetischer No-Write-Replay übernimmt dieselben Integritätsprinzipien |
| Phase 3B Calibration | `CALIBRATION_ONLY`, keine Production Authority | KEEP | keine Kandidaten aktiviert |
| Phase 3C Policy | Product-Semantik, aber `productionAuthorized:false` | KEEP | Hash wird im Dark Release gebunden, Runtime bleibt aus |
| Phase 3D Founder Lab | lokale synthetische Evaluation | KEEP | bleibt alleiniger ausführbarer Testpfad |
| `user-intelligence-runtime` | älterer separater Runtime-Pfad | DEPRECATE / DO NOT WIRE | kein Import, keine Aktivierung, kein Parallel-Core |
| Product Events | keine autorisierte produktive Ingestion | NOT_CONFIGURED | fail-closed Disabled Adapter |
| Retention | Klassen vorhanden, keine finalen Fristen | NEEDS FOUNDER/CTO/LEGAL | maschinenlesbares Entscheidungstemplate ohne Defaults |
| Production Storage | kein freigegebener Store-/Write-Adapter | PROHIBITED IN WEEK 1 | No-Write-Proof und null Writes |

## Bestätigte Lücke

Die kanonische Modell- und Kalibrierungsarchitektur besaß noch keinen kleinen, einheitlichen Betriebsvertrag, der Consent, Lifecycle, Legal Export, Kill Switch, Retention-Entscheidung und nachweislich fehlende Writes gemeinsam bindet. Week 1 schließt genau diese Contract-Lücke. Es werden weder Product Producer angeschlossen noch bestehende Modellsemantiken erweitert.
