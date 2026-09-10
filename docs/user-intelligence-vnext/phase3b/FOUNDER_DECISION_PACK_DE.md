# Founder Decision Pack – Phase 3B

Dieses Pack beschreibt offene Product-Entscheidungen. A, B und C sind synthetische Calibration-Kandidaten, keine Production Policies; keiner besitzt finale Gewichte oder gilt als Gewinner. `ALL_OF`-Authority, Phase-2-Provenienz, Projection-Grenzen und mehrdimensionale Sufficiency sind technische Sicherheitsbedingungen, keine Product-Kalibrierung. Review Moods, Moments, Dwell, Quick Skip und Search bleiben bis zu einer eigenen Entscheidung `RESEARCH_ONLY` beziehungsweise `NOT_CONFIGURED`. „Dev“ bezeichnet die sicherste technische Empfehlung; „CTO“ bezeichnet eine architektonisch eindeutige Empfehlung, nicht die Founder-Entscheidung über Product-Wirkung.

## 1. Welche UI-Aktion bedeutet Satisfaction?

- Beispiel: Lea besucht ein Café und tippt danach bewusst „Hat zu mir gepasst“.
- A/B: erzeugen eine positive, nachvollziehbare Concept-Hypothese; C nur im autorisierten Context.
- Risiko: Save, Review oder Visit könnten fälschlich als Zustimmung gelesen werden.
- Dev: eigene explizite Antwort mit Experience-Referenz und Undo verwenden. CTO: servergebundener, auditierbarer Outcome-Contract.
- Founder-Frage: Soll ausschließlich eine bewusst formulierte Nachbesuchs-Antwort als Satisfaction gelten, und wie lautet sie genau?

## 2. Welche UI-Aktion bedeutet Dissatisfaction?

- Beispiel: Lea bestätigt nach dem Besuch „Hat nicht gepasst“ und kann die Aussage später korrigieren.
- A/B: eigene Aversion-Evidence; C contextgebundene negative Hypothese.
- Risiko: Skip, Removal oder Alternative wären leicht fehlinterpretiert.
- Dev: nur explizite Experience-Antwort. CTO: getrennt von Moderation, Qualität und Eligibility.
- Founder-Frage: Welche bewusste Formulierung autorisiert negative Präferenz-Evidence?

## 3. Welche Bedeutung hat Save?

- Beispiel: Lea speichert ein Restaurant für eine mögliche Reise, besucht es aber nie.
- A: ignoriert; B: vorsichtige Direct-Spot-Hypothese; C: vorsichtiger Recent-State.
- Risiko: Wunschliste wird als dauerhafter Geschmack ausgegeben.
- Dev: spotbezogen und Richtung `UNKNOWN`. CTO: keine Concept-Propagation ohne spätere Attribution Policy.
- Founder-Frage: Soll Save nur Planungsinteresse, Recent Preference oder gar keine Modellannahme erzeugen?

## 4. Wie wirkt Save Removal?

- Beispiel: Lea entfernt einen bereits besuchten Spot, weil ihre Liste aufgeräumt wird.
- A/B/C: neutraler Zustandswechsel, keine Aversion.
- Risiko: Aufräumen wird als Dislike behandelt.
- Dev/CTO: keine negative Wirkung ohne eigene explizite Dissatisfaction.
- Founder-Frage: Soll Removal ausschließlich den Save-Zustand beenden?

## 5. Wie stark wirkt ein bestätigter Visit ohne Bewertung?

- Beispiel: Ein serverbestätigter Besuch liegt vor, aber Lea gibt kein Feedback.
- A/C: keine Taste-Hypothese; B: bedingte Direct-Spot-Beziehung unbekannter Richtung.
- Risiko: Anwesenheit wird als Gefallen interpretiert.
- Dev: Experience/Familiarity dokumentieren, Richtung offenlassen. CTO: niemals Satisfaction ableiten.
- Founder-Frage: Darf ein Visit Direct-Spot-Familiarity erhöhen, ohne positiven Taste-Effekt?

## 6. Welche Wirkung besitzen Review-Moods?

- Beispiel: Lea wählt im Review „lebhaft“, ohne zu sagen, ob ihr das gefiel.
- A/B/C: `RESEARCH_ONLY`, nicht projectable.
- Risiko: Beschreibung des Ortes wird als persönliche Qualitätswertung gelesen.
- Dev: Mood zunächst als Experience-Beschreibung behalten. CTO: getrennte Direction-Evidence erforderlich.
- Founder-Frage: Welche Mood-Auswahl enthält ausdrücklich eine persönliche positive oder negative Wertung?

## 7. Welche Wirkung besitzen Moments?

- Beispiel: Lea postet ein Foto eines Treffens, weil ihre Freunde darauf sind.
- A/B/C: `RESEARCH_ONLY`, keine Taste- oder Social-Propagation.
- Risiko: Content-Erstellung wird als Spot-Like oder Freundesprofil-Signal missverstanden.
- Dev/CTO: eigene Inhaltsklasse, keine Taste-Wirkung ohne explizite Freigabe.
- Founder-Frage: Soll ein Moment überhaupt User-Taste beeinflussen; falls ja, durch welche zusätzliche Bestätigung?

## 8. Darf Dwell als Taste-Signal dienen?

- Beispiel: Der Spot-Screen bleibt zehn Minuten offen, während das Telefon auf dem Tisch liegt.
- A/B/C: `NOT_CONFIGURED`.
- Risiko: Inaktivität wird als starkes Interesse gezählt.
- Dev: nicht verwenden, bis Attention verlässlich unterscheidbar ist. CTO: niemals alleinige starke Evidence.
- Founder-Frage: Soll Dwell nur Evaluationstelemetrie bleiben oder später als sehr schwache, gebündelte Evidence untersucht werden?

## 9. Darf Quick Skip negativ wirken?

- Beispiel: Lea wischt schnell weiter, weil sie gerade keine Zeit hat.
- A/B/C: `NOT_CONFIGURED`, keine Aversion.
- Risiko: Situatives Verhalten verengt dauerhaft das Profil.
- Dev/CTO: ohne expliziten Reject-Grund kein negatives Taste-Signal.
- Founder-Frage: Soll Quick Skip vollständig neutral bleiben?

## 10. Welche Suchinformationen dürfen gelernt werden?

- Beispiel: Lea sucht „ruhiges Café nahe Bahnhof“; der Rohtext kann private Details enthalten.
- A/B/C: Search ist `RESEARCH_ONLY`; Rohtext wird nicht in Reports oder Projection übernommen.
- Risiko: unnötig langlebiger persönlicher Text und falscher Long-Term-Transfer.
- Dev: später nur erlaubte, minimierte Concept-/Context-Referenzen. CTO: Privacy-Allowlist und Purpose Binding vor Nutzung.
- Founder-Frage: Welche extrahierten Suchdimensionen dürfen gespeichert werden und wie lange?

## 11. Wann ist Wiederholung unabhängig?

- Beispiel: drei Besuche desselben Spots an drei serverseitig getrennten Abenden gegenüber drei Events in einer Session.
- A: nur explizite Outcomes; B/C: Repeat/Familiarity nur bei unabhängigen Journeys.
- Risiko: Retries oder eine lange Session vervielfachen Confidence.
- Dev/CTO: ausschließlich serveraufgelöste Experience-Journeys; ungelöst zählt nicht.
- Founder-Frage: Welche Product-Referenzen müssen zwei Erlebnisse verbindlich trennen?

## 12. Wie wird dieselbe Journey dedupliziert?

- Beispiel: shown → opened → navigation → visit → review → satisfaction in einem Erlebnis.
- A/B/C: höchstens eine Independence Unit; technische Retries werden entfernt.
- Risiko: sechs Events erscheinen als sechs unabhängige Erfahrungen.
- Dev/CTO: eine Journey-/Attribution-Unit, getrennte Observations bleiben auditierbar.
- Founder-Frage: Welche Signale derselben Journey dürfen zusätzlich unterschiedliche Domänen beschreiben, ohne Independence zu erhöhen?

## 13. Welche Context-Dimensionen dürfen langfristig gespeichert werden?

- Beispiel: „mit Freunden“ ist relevant; Rohstandort und Begleiteridentitäten sind nicht nötig.
- A/B: Context beeinflusst keine langfristige Speicherung; C nutzt minimierte Context-Hashes im Lab.
- Risiko: übermäßiges persönliches Profiling.
- Dev: kleine semantische Allowlist ohne Rohdaten. CTO: Privacy-/Retention-Freigabe pro Dimension.
- Founder-Frage: Dürfen Company-Type, Tagesphase und Zeitbudget gespeichert werden, und welche Dimensionen ausdrücklich nicht?

## 14. Wann darf Contextual Taste entstehen?

- Beispiel: Lea mag lebhafte Bars mit Freunden, meidet sie allein.
- A/B: globaler Conflict; C: getrennte Context-Hypothesen.
- Risiko: Widerspruch wird geglättet oder situative Präferenz generalisiert.
- Dev: nur mit autorisiertem Context und explizitem Outcome. CTO: `transfersToLongTermTaste:false` als Standard.
- Founder-Frage: Reicht ein explizites Outcome pro Context für eine erste Hypothese oder sind Wiederholungen nötig?

## 15. Wie soll zeitliche Abschwächung funktionieren?

- Beispiel: Eine fünf Jahre alte Präferenz widerspricht zwei neuen Erfahrungen.
- A: keine Zeitinterpretation; B/C zeigen austauschbare Fixture-Strategien, Decay bleibt `NOT_CONFIGURED`.
- Risiko: willkürliche Halbwertszeit löscht stabile Vorlieben oder konserviert veraltete Annahmen.
- Dev: domänenspezifisch und reconfirmation-fähig. CTO: Policy-Version erzeugt neue Interpretation, nie veränderte Evidence.
- Founder-Frage: Welche Domänen sollen stabil, welche recent und welche nur contextuell altern?

## 16. Wann ist ein Profil für eine Decision-Domäne ausreichend?

- Beispiel: viele Café-Erlebnisse, aber keine Evidence für Hotels mit Familie.
- A/B/C: getrennte Domain Sufficiency; synthetische Grenzen sind sichtbar und nicht produktkalibriert.
- Risiko: ein globaler Profil-Prozentwert täuscht universelle Kenntnis vor.
- Dev/CTO: Quantity, Diversity, Independence, Context, Conflict und World Certainty pro Domäne.
- Founder-Frage: Welche Mindestqualität muss eine begrenzte Café-, Hotel- oder Nightlife-Projection jeweils erfüllen?

## 17. Wie wird Exploration Preference gelernt?

- Beispiel: Lea fordert Alternativen an, besucht aber regelmäßig denselben sicheren Spot.
- A: unbekannt; B: Familiarity; C: getrennte Research-Hypothesen zu Alternative und Familiarity.
- Risiko: Alternative wird als Ablehnung oder Wiederholung als Angst vor Neuem gelesen.
- Dev: zunächst deskriptiv, nicht kausal. CTO: User Intelligence beschreibt; Decision steuert Exploration.
- Founder-Frage: Welche ausdrückliche Nutzeraktion signalisiert gewünschte Novelty oder gewünschte Sicherheit?

## 18. Wie stark darf ein Spot Concept Taste beeinflussen?

- Beispiel: Ein geliebtes Restaurant hat Pizza, Terrasse, Live-Musik und Freunde-Context.
- A/B: konkurrierende Concepts teilen eine Attribution-/Independence-Unit; C zusätzlich contextgebunden.
- Risiko: ein Erlebnis erzeugt vier vollwertige Präferenzen.
- Dev: Attribution-Uncertainty erhalten und Spot-Dominanz begrenzen. CTO: keine automatische Vollgewichtung jedes Facts.
- Founder-Frage: Wann darf aus mehreren Spots mit demselben Concept eine allgemeine Präferenz entstehen?

## 19. Wie behandeln wir positive und negative Evidence?

- Beispiel: Lea mag „lebhaft“ mit Freunden, aber nicht allein.
- A/B: Conflict bleibt; C trennt Context.
- Risiko: Summierung löscht eine Seite oder erzeugt falsche Gewissheit.
- Dev/CTO: positive und negative Evidence parallel halten; Conflict und Ambivalenz projectable erhalten.
- Founder-Frage: Soll Decision bei ungelöstem Conflict neutralisieren oder contextabhängig auswählen?

## 20. Was darf in Nutzertransparenz sichtbar und korrigierbar sein?

- Beispiel: Lea sieht „Möglicherweise ruhige Cafés – basiert auf zwei bestätigten Erlebnissen“ und widerspricht.
- A/B/C: Interpretation ist auf Evidence, Policy und Registry zurückführbar; Correction bleibt append-only.
- Risiko: Rohhistorie oder private Context-Daten werden unnötig offengelegt.
- Dev: verständliche Hypothese, Quelle auf Ereignisebene, Unsicherheit und Korrekturweg; keine Rohtexte/Rohstandorte. CTO: Export/Erasure/Lifecycle durchgehend binden.
- Founder-Frage: Welche Formulierungen und Detailtiefe schaffen Kontrolle, ohne sensible Historie preiszugeben?

## Empfohlene Founder-Reihenfolge

Zuerst 1, 2, 3, 4 und 5 entscheiden; danach 11, 12, 13 und 14; anschließend 15 bis 20. Review-Moods, Moments, Dwell, Quick Skip und Search sollten bis zu eigener Research-/Privacy-Evidence unkonfiguriert bleiben.
