# User Intelligence vNext – Phase 3B

Phase 3B ergänzt den kanonischen Phase-3A-Kernel um eine ausschließlich synthetische Product-Semantics- und Calibration-Schicht. Sie aktiviert keine echte Interpretation und keine Personalisierung.

## Lieferumfang

- versionierte Signal Semantics Registry für 22 fachliche Eventtypen;
- drei extern gebundene Policy-Kandidaten A, B und C;
- explizite Bindung jeder Concept-Referenz an die synthetische Registry-Version und ihren Hash;
- 34 deterministische synthetische Nutzerverläufe (die geforderten 32 plus No Consent und Kill Switch);
- multidimensionale Sufficiency-/Uncertainty-Auswertung;
- getrennte Attribution, Independence, Context, Direct Spot und Exploration/Familiarity;
- strikt neutrale Production Projection und separate Calibration Projection;
- rekonstruktive Report-Verifikation gegen Policy- und Evidence-Trust-Anker;
- Lifecycle-Abdeckung für personenbezogene Calibration Reports und Rebuild-Materialien.

Normative Runtime-Verträge liegen in `packages/user-intelligence-vnext-core/src/calibration.ts`. Das Lab wird mit `npm run user-intelligence-vnext:calibration` ausgeführt. Der eingecheckte maschinenlesbare Nachweis ist `calibration-report.json`.

Das Lab berechnet pro Kandidat einen vollständigen deterministischen Rebuild. Es wird nicht als zweiter inkrementeller Reducer bezeichnet: Full-/Incremental-Parität bleibt Aufgabe des bereits kanonischen, checkpoint-gebundenen Phase-3A-Reducers und seiner Regressionen. Ein Policy-, Registry- oder Reducer-Wechsel verlangt weiterhin einen Full Rebuild.

## Harte Grenze

Alle Kandidaten tragen `authority: CALIBRATION_ONLY`, `productionAuthorized: false` und `productCalibrationStatus: CANDIDATE_NOT_APPROVED`. Die echte `RelevantUserProjection` bleibt neutral. Kein Kandidat besitzt Eligibility-, Ranking-, World-Write- oder Production-Autorität.
