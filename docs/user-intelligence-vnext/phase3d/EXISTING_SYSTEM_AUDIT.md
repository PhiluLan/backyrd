# Phase 3D – Existing System Audit

Stand: kanonischer Main `8744d34e99413ea1f89f6df5fbc3814061abca39` (enthält den inzwischen kanonischen Decision-vNext-Phase-3B-Merge; keine ungemergten Parallelverträge übernommen).

## Ergebnis

Phase 3C ist die einzige fachliche Product-Policy-Wahrheit. Phase 3D ersetzt weder Evidence, Reducer noch `RelevantUserProjection`, sondern legt eine lokale Evaluation darüber. Die 3B-Kandidaten sind historische Kalibrierungsbelege und keine Basis für eine Production-Aktivierung.

| Bestandteil | Einstufung | Verwendung in 3D |
|---|---|---|
| Phase-2 Evidence Chains und Authority | KEEP | Nur rekursiv verifizierte/minimierte Phase-3C-Observations |
| Phase-3A Full-/Incremental-Reducer | KEEP | Paritätsbeweis und Checkpoint bleiben kanonisch |
| Phase-3B Calibration Harness | EXTEND | Muster für deterministische Reports und Artefakte |
| Phase-3C Founder Decisions, Registry, Product Policy | KEEP | Unveränderte fachliche Quelle |
| Lokaler CLI-Testnutzer und Report | KEEP | Rückwärtskompatibler Expert-/Automationspfad |
| Isolierte Founder-Lab-Browser-App | EXTEND | Deutsche Browsersteuerung auf `127.0.0.1`; kein Admin- oder Product-Surface |
| Lokaler Lab-State unter `.local/` | EXTEND | Versioniert, hashgebunden, atomar gespeichert und vollständig löschbar |
| `RelevantUserProjection` | KEEP | Einziger künftiger Decision-Port; nicht aktiviert |
| Legacy Taste-Faktoren/Eventgewichte | PROHIBITED | Kein Pfad in Kandidaten oder Lab |
| Admin-Navigation aus offenem World-PR #280 | PROHIBITED | Keine Übernahme; Lab bleibt isoliert |
| Decision-Contracts aus offenem PR #282 | PROHIBITED | Keine Übernahme und kein Runtime-Aufruf |
| Direkte Spot-Tabellenabfrage | REPLACE | Ausschließlich `WorldKnowledgeReaderPort` |
| Retention-Zeiträume | UNKNOWN / NEEDS LEGAL/CTO DECISION | Klassen sichtbar, Dauer nicht konfiguriert |

## Legacy-Lücken

Vor Phase 3D fehlten ein kontrollierter Testnutzer-Pfad, ein schneller Policy-Vergleich für die fünf offenen Regeln, verständliche Founder-Ausgaben und eine World-Cohort-Consumer-Grenze. Der erste Phase-3D-Stand stellte diese Funktionen nur über CLI und einen lesenden HTML-Report bereit. Die UI-Closure ergänzt die fehlende interaktive Browsersteuerung, ohne einen zweiten fachlichen Core, ein Admin-Wiring oder eine Production-Verbindung einzuführen.
