# Founder Decision Pack — World Knowledge Slice 3B

Dieses Dokument trennt Entscheidungen von technischen Garantien. Die Empfehlungen sind noch keine aktive Policy.

## 1. Welche Autorität hat ein verifizierter Owner?

**Warum:** Der Owner kennt den Betrieb gut, hat aber ein Eigeninteresse.

- Option A: Owner-Angaben dürfen direkt öffentlich erscheinen, bleiben aber „behauptet“.
- Option B: Niedrigrisiko-Angaben erscheinen als Behauptung; Öffnungszeiten, Accessibility und harte Regeln brauchen Quelle oder Prüfung.
- Option C: Alle Angaben brauchen vor Veröffentlichung Admin-Prüfung.

**Empfehlung:** B. Gute UX und schnelle Aktualisierung ohne Trust-Aufwertung. Technisch garantiert bleiben eigener Spot, serverseitige Ownership und kein Trust-/Ranking-Effekt durch Abo.

## 2. Welche Autorität hat Admin?

- Option A: Admin-Eingabe ist automatisch verifiziert.
- Option B: Admin darf behaupten/beobachten; Verifikation ist ein separater Prozess.
- Option C: Vier-Augen-Prinzip für alle Admin-Angaben.

**Empfehlung:** B, mit C nur für sensible Konflikte. Adminrolle allein beweist keine Wahrheit.

## 3. Was reicht als offizielle Quelle?

- Option A: URL genügt.
- Option B: Identität, konkreter Inhalt, Abrufzeitpunkt und Attributbezug müssen gebunden sein.
- Option C: Zusätzlich unabhängiger Cross-check für alle Fakten.

**Empfehlung:** B; C gezielt für Accessibility, Altersregeln und andere harte Constraints. Eine URL allein erhöht Trust nicht.

## 4. Wann heißt etwas „verifiziert“?

- Option A: Owner/Admin setzt ein Häkchen.
- Option B: Ein freigegebener Prozess mit autorisierter Ausführung und unveränderlichem Record bestätigt den Claim.
- Option C: Immer zwei unabhängige Quellen.

**Empfehlung:** B. Mehrquellenbestätigung kann ein Prozess für ausgewählte Risiken sein. Selbstverifikation und AI-only bleiben ausgeschlossen.

## 5. Öffnungszeiten und Current State

- Option A: Owner-Angabe reicht für Eligibility.
- Option B: Referenzierte reguläre Zeiten; Sonderzeiten übersteuern nur ihr Datum; Current State braucht Ablaufzeit.
- Option C: Öffnungszeiten stets manuell verifizieren.

**Empfehlung:** B. Bei Konflikt oder abgelaufener Aktualität fail-closed für „jetzt geöffnet“, während der Spot allgemein sichtbar bleiben kann.

## 6. Preis

- Option A: Bestehendes Preislevel 1–5 übernehmen.
- Option B: Neues Währungs-/Von-bis-Modell; Legacy-Level nur Darstellung/Research.
- Option C: Beides dauerhaft parallel.

**Empfehlung:** B. Das alte Level darf nicht in einen Geldbereich umgerechnet werden. Konkrete TTL erst nach Messung festlegen.

## 7. Accessibility

- Option A: Ein globales „barrierefrei“.
- Option B: einzelne Komponenten; kompletter Besuchspfad nur aus allen erforderlichen Komponenten.
- Option C: nur manuell verifizierte Komplettprüfung anzeigen.

**Empfehlung:** B mit unabhängiger Prüfung für harte Constraints. Fehlende Komponente bedeutet unbekannt, nicht false.

## 8. Freshness und Reverification

- Option A: eine globale TTL.
- Option B: Klassen pro Fact-Typ, zunächst als beobachtete Kandidaten.
- Option C: nur manuelle Ablaufdaten.

**Empfehlung:** B. Current State immer mit `valid_until`; Preise kurzfristiger, Kontakt/Angebot mittelfristig, Identität/Standort langfristig. Konkrete Zeiträume erst als genehmigte Policy aktivieren.

## 9. Konflikte

- Option A: neuester Claim gewinnt.
- Option B: Quellenhierarchie gewinnt global.
- Option C: fact- und risikospezifische Regeln; Alternativen bleiben erhalten.

**Empfehlung:** C. Accessibility und Öffnungszeiten blockieren ihren Use Case; allgemeine Anzeige kann weiter möglich sein.

## 10. Öffentliche Spot-E-Mail

- Option A: bestehendes `spots.email` veröffentlichen.
- Option B: kein öffentliches E-Mail-Feld.
- Option C: neues explizites `contact.public_email` mit separater Provenance.

**Empfehlung:** C, aber erst nach Daten- und UI-Entscheid. Bestehende Owner-/Account-Mail niemals automatisch übernehmen.

## 11. Duplicate- und Merge-Autorität

- Option A: Provider-ID führt automatisch zusammen.
- Option B: System schlägt vor, Moderation bestätigt in zwei Schritten.
- Option C: ausschließlich Founder/CTO bestätigt.

**Empfehlung:** B; besonders riskante Reversals/Splits eskalieren. Beide IDs und Historien bleiben erhalten.

## 12. Legacy-Übernahme und Aktivierungsreihenfolge

- Option A: alles mit Mapping migrieren.
- Option B: zuerst Direct/Normalized mit Source-Bindung, dann review-pflichtige Klassen; subjektive/commercial Daten nie als World Truth.
- Option C: komplett neu erfassen.

**Empfehlung:** B. Reihenfolge: Identität/öffentliche Kontakte → Klassifikation → strukturierte Offerings → Hours → harte Regeln/Accessibility → Current State. Adapter läuft zuerst als Shadow/Diff, ohne Runtime-Autorität.

## Entscheidungen für Slice 3B

Founder/CTO sollen die empfohlenen Optionen B/B/B/B/B/B/B/B/C/C/B/B bestätigen oder gezielt abändern. Zusätzlich nötig: konkrete TTL-Kandidaten für Pilotmessung, zulässige Verification-Prozesse/Authority-Klassen, Konflikt-Moderations-SLA und Retention privater Evidence.

Unabhängig von jeder Wahl garantiert die Technik: append-only Historie, fehlend ≠ false, Current State ≠ dauerhafter Fakt, keine Self-Verification, keine Abo-/Payment-Trustwirkung, keine privaten Quellen im Decision-Port und keine automatische Spot-Zusammenführung.
