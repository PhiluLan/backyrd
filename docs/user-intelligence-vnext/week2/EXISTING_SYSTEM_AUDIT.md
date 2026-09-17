# Existing System Audit

| Bestandteil | Befund | Einstufung | Week‑2-Nutzung |
|---|---|---|---|
| Phase‑2 Evidence/Authority | servergebundene, rekursiv prüfbare Grundlage | KEEP | keine parallele Product-Wahrheit |
| Phase‑3A Model/Lifecycle | deterministischer Full-/Incremental-State und Löschmanifest | KEEP | Lifecycle-Hash gebunden |
| Phase‑3B Calibration | synthetisch, nicht production-authorized | KEEP | keine Policy-Aktivierung |
| Phase‑3C Product Policy | fachlich freigegeben, Runtime aus | KEEP | Save/Familiarity-Grenzen gebunden |
| Phase‑3D Founder Lab | lokale Evaluation | KEEP | keine Runtime-Abhängigkeit |
| Week‑1 Dark Runtime | No-write, Consent, Export, Retention | KEEP | Release- und No-write-Hash unverändert gebunden |
| Legacy Taste Logger/Reducer | nicht kanonische Signalwirkung | PROHIBITED | kein Adapter und kein Fallback |
| Product Event Producer | echte Nutzerereignisse | DEFERRED | kein Consumer registriert |
| Decision Consumer | `RelevantUserProjection` | EXTEND | nur read-only, minimierter Handoff |
| Persistence/Network | Production-IO | PROHIBITED | keine Abhängigkeit vorhanden |

Die technische Lücke zwischen Week 1 und Week 2 war kein fehlender Taste Reducer, sondern ein fehlender, realistisch prüfbarer read-only Projection-Pfad: Feature-Gate, Authority, Ledger, Lifecycle und Decision-Handoff mussten gemeinsam beweisen, dass lokale Auswertung möglich ist, ohne Production-Ingestion oder Schreibfähigkeit einzuführen.
