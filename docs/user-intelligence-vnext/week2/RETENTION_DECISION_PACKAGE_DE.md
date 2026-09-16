# Retention Decision Package

Dieses Paket ist entscheidungsreif, aber nicht aktiviert. Für jede Klasse müssen Founder, CTO und Legal gemeinsam Zweck, Rechtsgrundlage, Start-/End-Trigger, Lösch- oder Anonymisierungswirkung, Abhängigkeiten und eine konkrete Dauer freigeben.

| Datenklasse | Zweck | Personenbezogen | Trigger | Wirkung | Dauer |
|---|---|---:|---|---|---|
| Minimiertes Event Ledger | lokaler deterministischer Replay | ja | Consent/Lifecycle | DELETE | NOT_CONFIGURED |
| Derived Projection State | read-only Decision-Handoff | ja | Consent/Lifecycle | DELETE | NOT_CONFIGURED |
| Privacy Export Ephemeral | gesetzlicher Export | ja | Exportabschluss | DELETE | NOT_CONFIGURED |
| Release Manifest | Integritätsaudit | nein | neuer Release | nur nicht-personenbezogen erhalten | NOT_CONFIGURED |

Verbotene Fallbacks: Fixture-Dauer, unbegrenzte Aufbewahrung, Source-Code-Default und clientgewählte Dauer. Eine spätere Freigabe benötigt einen neuen versionierten Release.
