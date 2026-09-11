# Phase 3B Unknown- und Constraint-Policy

Candidate-Tiers sind strikt: `ELIGIBLE_CONFIRMED`, `UNCONFIRMED_FALLBACK`, `NOT_CONFIGURED`, `INELIGIBLE`. Bestätigte Kandidaten werden vor Unknown-Fallback eingeordnet; `KNOWN_FALSE` bleibt ineligible. Unknown-Fallback darf nie als bestätigter Fact erklärt werden.

Opening und Kitchen Current State bleiben konservativ `EXCLUDE_IF_UNKNOWN`. Accessibility wird komponentenweise bewertet: bestätigt vor Unknown-Fallback, bekannt falsch ineligible. Age/Legal bleibt `NOT_CONFIGURED`. Andere objektive Klassen verwenden im Draft einen transparenten Unknown-Fallback und höchstens eine Clarification je Decision Step.

Soft Preferences verändern Eligibility nie. Nur objektive Allowlist-Dimensionen können durch explizite Muss-Sprache hard werden. Subscription oder Owner Tier besitzen keinen Kanal.
