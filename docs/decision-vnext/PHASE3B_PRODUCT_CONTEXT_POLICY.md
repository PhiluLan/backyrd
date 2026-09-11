# Phase 3B Product Context Policy

Status: `DRAFT_PRODUCT_RELEASE`; `productionAuthorized:false`; `runtimeActivated:false`.

Phase 3B bindet die 19 Founder-Entscheidungen aus dem Phase-3A-Workshop in einen strikt validierten, gehashten Release. Der Context beschreibt nur die aktuelle Entscheidung. World bleibt Spot-Fakten-Authority, User Intelligence bleibt Authority für minimiertes längerfristiges Nutzerwissen. Es gibt keinen Context-Writeback, keine Product-Gewichte und keine Runtime-Aktivierung.

Die Policy führt hierarchische Intents, getrennte Occasion/Mood-Komponenten, minimale Companion-Referenzen, die fünf kanonischen World-Preislevel plus `FLEXIBLE`, getrennte Zeitkomponenten und drei Exploration-Modi ein. Unvollständige Taxonomien, Minuten-Grenzen, Session-Grenzen, Retention und rechtliche Age-Unknown-Semantik bleiben `NOT_CONFIGURED`.

Hard Constraints dürfen nur aus expliziter Muss-Sprache und einer objektiven Allowlist entstehen. Mood, Occasion und Exploration sind immer soft. Jede Hard-Rule besitzt eine eigene Unknown-Behandlung; `UNKNOWN` ist nie `FALSE`.

Release: `backyrd.decision-vnext.context-release@3b-1`. Der Release wird nicht durch seine eigenen Daten autorisiert, sondern durch eine separate Ed25519-Signatur und einen parameterlosen prozesslokalen Capability-Loader.
