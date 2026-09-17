# Architektur

1. **Fail-closed Mode:** Nur `LOCAL_TEST` und `PROD_LIKE_TEST` öffnen den synthetischen Pfad. Alles andere ist `OFF`; `EMERGENCY_OFF` stoppt vor Authority- und Eventzugriff.
2. **Externe Authority:** Release, Trust Anchor und einzelner Allowlist Record werden getrennt injiziert und rekonstruktiv geprüft. Selbst erzeugte Labels oder Eigenhashes autorisieren nichts.
3. **Absolute Privacy-Grenze:** Consent und Lifecycle werden vor persönlicher Verarbeitung geprüft. No Consent, Withdrawal, Reset und Erasure geben `null` zurück.
4. **Einziger Output:** Nur der bestehende kanonische `RelevantUserProjection`-Contract. Keine Raw Events, Evidence Chains, Texte, präzisen Standorte, Commercial-Felder, World-/Decision-Kopien oder Ranking-/Eligibility-Anweisungen.
5. **No Write:** Kein DB-, Persistence-, Network-, Product-Consumer-, Cache- oder Writeback-Port. Der Consumer ist zustandslos.
6. **Privacy Export:** Bleibt im Week‑2-Legal-Pfad mit separater Authority und ist aus der Runtime-Grenze nicht erreichbar.
7. **Post-Deploy Evidence:** Bindet kanonischen Main und Tree, Artefaktmanifest, Release, Trust Anchor, Allowlist Policy, Consent, Lifecycle und No-Write Proof. Ohne Production Authority ist der einzige ehrliche Status `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`.

