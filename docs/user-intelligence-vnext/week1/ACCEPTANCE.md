# Acceptance

- Alle Aktivierungsflags `false`, Kill Switch `FORCED_OFF`.
- Product-Ingestion blockiert, null Write-Versuche und null Writes.
- Unbekannte/fremde Authority, Subject, Consent und manipulierte Hashes fail-closed.
- Nicht gewährter Consent verarbeitet keine persönliche Evidence.
- Withdrawal, Full Reset und Erasure geben keine persönlichen States aus.
- Account Erasure plant `DELETE` für jeden persönlichen Store, meldet ohne Executor nie Completion.
- Privacy Export benötigt getrennte Legal Authority und enthält keine Rohtexte, Secrets, Tokens, Fremddaten oder präzise Standorte.
- Full Rebuild und echter Incremental-Pfad sind byte-identisch.
- Dedupe, Retry, Late Events und Corrections sind deterministisch messbar.
- Retention hat keine konkrete Dauer und keinen Fixture-/Code-Fallback.
- Keine Migration, Function, RPC-, Edge-, Auth-, Product-Wiring- oder Deployment-Änderung.
