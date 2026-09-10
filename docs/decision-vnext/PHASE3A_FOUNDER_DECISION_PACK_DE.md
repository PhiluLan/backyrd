# Founder Decision Pack — Situational Context

Status: Entscheidungsgrundlage. Keine Empfehlung in diesem Dokument ist aktivierte Product-Semantik.

## 1. Intent-Gruppen

Problem: Freitext und beliebige Labels sind nicht stabil evaluierbar. Optionen: wenige breite Gruppen; hierarchische Gruppen; freies Intent plus späterer Resolver. Empfehlung: wenige versionierte Obergruppen mit optionaler Unterreferenz, Freitext nur ephemer. Kann bis vor Product-Ranking vertagt werden.

## 2. Occasion versus Intent

Problem: „Geburtstag“ ist Anlass, „ruhig essen“ ist Ziel. Optionen: strikt getrennt; ein gemeinsames Tag-System; Occasion nur Erklärung. Empfehlung: strikt getrennte Registry-IDs und Relations erst nach Evaluation. Muss vor kombinierter Fit-Logik entschieden werden.

## 3. Aktuelle Mood-Dimensionen

Problem: aktuelle Stimmung darf nicht Diagnose oder Long-Term Taste werden. Optionen: kuratierte Begriffe; wenige Achsen; ausschließlich Freitext. Empfehlung: kuratierte aktuelle Context-Begriffe mit „keine Angabe“ und separater World-Mood-Registry. Vertagbar bis Product-Ranking.

## 4. Begleitungsarten

Problem: Begleitung verändert den Moment, darf aber keine Personenidentität speichern. Optionen: kleine Typenliste; Gruppengröße plus Typ; nur Gruppengröße. Empfehlung: kleine Typenliste plus optional grobe Gruppengröße, nie Kontakte/Namen. Vor Consumer-UI nötig.

## 5. Budgetrepräsentation

Problem: situatives Budget muss zum World-Preiswissen passen. Optionen: kanonische fünf World-Level; relative Angabe „heute günstiger/flexibel“; CHF-Betrag. Empfehlung: World-Level plus „flexibel“, keine erfundenen CHF-Grenzen. Benötigt den kanonischen World-Preisvertrag.

## 6. Verfügbare Zeit

Problem: Minuten sind präzise, Buckets leichter. Optionen: Minuten; freigegebene Buckets; beides mit Normalisierung. Empfehlung: Minuten im technischen Contract, UI-Buckets später deterministisch darauf abbilden. Vor Duration-Eligibility nötig.

## 7. Radius und Distanzbereitschaft

Problem: Suchscope und Präferenz sind verschieden. Optionen: harter Radius; weiche Bereitschaft; beide getrennt. Empfehlung: serverautorisierter Maximalscope plus separate weiche Distanzbereitschaft. Vor personalisiertem Retrieval nötig, nicht für 3A.

## 8. Exploration pro Decision

Problem: „etwas Neues“ ist situativ und nicht automatisch Persönlichkeit. Optionen: binär; drei Stufen; kontinuierlich. Empfehlung: drei verständliche Product-Zustände, technisch als Registry-IDs. Vor Exploration-Ranking nötig.

## 9. Weather-Kategorien

Problem: Rohdaten sind nicht unmittelbar Decision-Semantik. Optionen: Wetterprovider-Rohzustände; kleine Decision-Kategorien; nur abgeleitete Outdoor-Eignung aus World+Weather. Empfehlung: Provider-Fakten getrennt halten und erst über freigegebene Regeln in Decision-relevante Zustände ableiten. Provider und Kosten separat entscheiden.

## 10. Location-Präzision

Problem: Genauigkeit verbessert Distanz, erhöht aber Datenschutzrisiko. Optionen: exakte Koordinate run-only; gerasterter Bereich; nur Stadt. Empfehlung: exakte Koordinate ausschließlich flüchtig zur serverseitigen Scope-Auflösung, Snapshot langfristig Stadt/Radius plus Accuracy-Klasse. Vor Production Adapter nötig.

## 11. Verweigerte Location

Problem: Nutzer sollen nicht unnötig blockiert werden. Optionen: Request ablehnen; Stadtwahl verlangen; letzte autorisierte Stadt verwenden. Empfehlung: explizite Stadtwahl verlangen; niemals still letzten Standort verwenden. Vor Client-Wiring nötig.

## 12. Hard versus Soft

Problem: Ein UI-Wunsch darf nicht versehentlich Kandidaten ausschließen. Optionen: Product entscheidet je Feld; Nutzer wählt hart/weich; hybrid. Empfehlung: Product setzt sichere Defaults, Nutzer kann nur bei klar bezeichneten Feldern „muss“ wählen. Vor neuen Eligibility-Regeln nötig.

## 13. Regelweise Unknown Policies

Problem: Unwissen ist je Constraint unterschiedlich riskant. Optionen: immer ausschließen; immer zulassen; regelweise Policy. Empfehlung: regelweise Policy mit sichtbarer Limitation/Clarification; kein globaler Default. Muss mit jeder neuen Hard Rule entschieden werden.

## 14. Accessibility als Hard Constraint

Problem: Fehlendes Wissen kann reale Zugänglichkeit gefährden. Optionen: Unknown ausschließen; Rückfrage; zulassen mit Warnung. Empfehlung: bei ausdrücklich erforderlicher Accessibility `EXCLUDE_IF_UNKNOWN` oder Clarification, niemals still zulassen. Founder/Trust-Abnahme vor Aktivierung erforderlich.

## 15. Altersanforderungen

Problem: rechtliche und venue-spezifische Regeln sind harte Fakten. Optionen: nur bestätigte World-Regeln; Client-Alter ableiten; Nutzerbestätigung. Empfehlung: nur bestätigte World-Regel plus datensparsame Berechtigungs-/Altersklasse, kein Geburtsdatum im Context. Vor Aktivierung rechtlich prüfen.

## 16. Gezeigte und abgelehnte Candidates

Problem: Session-Diversität ist nicht automatisch Taste. Optionen: nur aktuelle Session; mehrere Sessions; sofortiges Learning. Empfehlung: nur servergebundene aktuelle Session; Learning ausschließlich über separates Event. Vor Alternative-UX nötig.

## 17. Session-Länge

Problem: lange Historien erhöhen Payload und Privacy-Risiko. Optionen: feste Anzahl; feste Zeit; beides. Empfehlung: kurze Zeit plus maximales Candidate-Limit, genaue Werte nach Messung. Vertagbar bis Client-/Shadow-Design.

## 18. Context-Retention

Problem: Exact Replay konkurriert mit Datenminimierung. Optionen: vollständiger Snapshot kurzzeitig; nur Hash/Manifest langfristig; gar keine Speicherung. Empfehlung: kurze autorisierte Exact-Replay-Frist, danach forensische Hash-/Reason-Identitäten. Retention-Frist braucht Privacy-/Founder-Entscheid.

## 19. Context-Dimensionen mit möglichem Learning

Problem: einmalige Situation darf nicht Long-Term Taste werden. Optionen: kein Context-Learning; nur explizit bestätigte Events; implizite Übernahme. Empfehlung: ausschließlich separate, consent- und purpose-gebundene Observation Events; User Intelligence entscheidet anschließend über Interpretation. Vor jedem Writeback erforderlich.
