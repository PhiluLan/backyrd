# Existing System Audit

| Bestandteil | Einstufung | Week‑3-Behandlung |
|---|---|---|
| `RelevantUserProjection` | KEEP | einziger Consumer-Output |
| Week‑2 Dark Projection Reducer | KEEP | unveränderte synthetische Quelle |
| Week‑2 Authority/Trust | KEEP | weiterhin für Event-/Projection-Quelle erforderlich |
| Internal Allowlist | ADD | geschlossene zusätzliche Consumer-Authority |
| Privacy/Legal Export | KEEP SEPARATE | niemals über Runtime Consumer erreichbar |
| Persistence/Network/Product Consumer | PROHIBITED | kein Port, kein Adapter, kein Import |
| Retention-Zeiträume | NOT_CONFIGURED | Founder/CTO/Legal erforderlich |
| Ranking/Eligibility/Learning | PROHIBITED | keine Autorität und keine Ausgabe |

Root Cause der Week‑3-Erweiterung: Week 2 bewies einen lokal integrierbaren Projection-Pfad, besaß aber noch keinen eigenen geschlossenen Consumer-Vertrag für interne Testsubjekte und keinen hashgebundenen Post-Deploy-Evidence-Vertrag. Week 3 schließt genau diese Integrationsgrenzen, ohne Runtime-Aktivierung oder neue Product-Semantik.
