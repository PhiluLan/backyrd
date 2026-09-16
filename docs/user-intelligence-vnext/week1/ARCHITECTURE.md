# Architektur

Der Trust-Einstieg lautet:

`Repository Trust Anchor → Dark Runtime Release → externe Authority → Command → Receipt/Preview`

Der Release bindet das kanonische Lifecycle-Manifest, Phase-3C-Policy, Signal Registry und Release Artifact. Eine Command-Eigenhash-Prüfung genügt nicht: User, Subject, Consent, Lifecycle, erlaubte Aktion, Gültigkeit und Release müssen exakt zum separat gelieferten Authority Record passen.

## Betriebszustände

- `PREVIEW_EVENT_INGESTION`: immer blockiert, null Write-Versuche.
- Full-/Incremental-Preview: ausschließlich synthetischer In-Memory-State.
- Withdrawal, Reset, Erasure: vollständiger manifestgebundener Plan, `completed:false`.
- Privacy Export: eigener Legal-Authority-Typ, minimierter Inhalt, nicht über normale Product APIs erreichbar.
- No Consent oder inaktiver Lifecycle: keine Subject-Bindung, Events oder Rebuild-Daten im Ergebnis.

Der synthetische State ist kein Production Store. Er dient Determinismus, Dedupe, Correction, Replay und No-Write-Nachweis.
