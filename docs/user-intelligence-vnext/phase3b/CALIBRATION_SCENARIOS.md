# Calibration Scenario Matrix

Alle Szenarien sind synthetisch, deterministisch und in `calibration-report.json` vollständig mit Evidence-, Interpretation-, Sufficiency- und Projection-Hashes enthalten.

| # | Verlauf | Candidate A | Candidate B | Candidate C | zentrale Grenze |
|---:|---|---|---|---|---|
| 1 | Cold Start | neutral | neutral | neutral | keine Evidence ist keine Aversion |
| 2 | einzelner Save | ignoriert | Direct Spot, unbekannte Richtung | Recent, unbekannte Richtung | Save ist keine Satisfaction |
| 3 | Save + Removal | ignoriert | Save spotbezogen, Removal neutral | Save recent, Removal neutral | Removal ist kein Dislike |
| 4 | Navigation ohne Visit | ignoriert | Practical Hypothesis | ignoriert | keine Experience/Satisfaction |
| 5 | Visit ohne Satisfaction | ignoriert | Direct Spot, unbekannte Richtung | ignoriert | Experience bleibt neutral |
| 6 | Review ohne Satisfaction | ignoriert | ignoriert | ignoriert | Review ist keine Satisfaction |
| 7 | Standard vs. Smart Review | identisch ignoriert | identisch ignoriert | identisch ignoriert | Einstieg ändert Learning nicht |
| 8 | explizite Satisfaction | Long-Term-Hypothese | Long-Term-Hypothese | ohne Context unterdrückt | explizites positives Outcome |
| 9 | explizite Dissatisfaction | Aversion | Aversion | ohne Context unterdrückt | negative Evidence bleibt eigenständig |
| 10 | positiv + negativ | Conflict | Conflict | ohne Context unterdrückt | keine Verrechnung zu einem Score |
| 11 | drei Events derselben Journey | eine Unit | höchstens eine Unit | höchstens eine Unit | keine künstliche Independence |
| 12 | drei unabhängige Visits | ignoriert | drei Direct-Spot-Units | ignoriert | Wiederholung nur serveraufgelöst |
| 13 | Repeat Visits desselben Spots | ignoriert | Familiarity | Context fehlt | Familiarity ist nicht Taste |
| 14 | mehrere Spots, ein Concept | wiederholte Concept-Evidence | wiederholte Concept-Evidence | Context fehlt | Spot-Dominanz wird reduziert |
| 15 | ein Spot, mehrere Concepts | konkurrierende Concepts, eine Unit | dito | Context fehlt | keine fünffache Experience |
| 16 | Context Flip | globaler Conflict | globaler Conflict | zwei Context-Hypothesen | situative Unterschiede bleiben erhalten |
| 17 | Long-Term vs. aktueller Context | globaler Conflict | globaler Conflict | nur contextgebundener Teil | kein unkontrollierter Transfer |
| 18 | Practical vs. Concept | Concept | Practical + Concept | Context fehlt | Domänen bleiben getrennt |
| 19 | Direct Spot ohne Concept | ignoriert | Direct Spot | Recent Spot | keine Concept-Propagation |
| 20 | starke Aversion-Evidence | wiederholte Aversion | wiederholte Aversion | Context fehlt | negative Evidence separat |
| 21 | fehlende Evidence | neutral | neutral | neutral | nichts wissen bleibt sichtbar |
| 22 | widersprüchliche Evidence | Conflict | Conflict | Context fehlt | Ambivalenz bleibt erhalten |
| 23 | Correction | Ziel inaktiv | Ziel inaktiv | Ziel inaktiv | append-only, keine Historienumschreibung |
| 24 | verspätetes/offline Event | kein Zeiturteil | Fixture-Recency sichtbar | Fixture-Context-Recency sichtbar | kein Product-Decay |
| 25 | Policy-Wechsel | eigener Full Rebuild | eigener Full Rebuild | eigener Full Rebuild | historische Evidence unverändert |
| 26 | Exploration vs. Familiarity | ignoriert | Familiarity | Research Exploration + Familiarity | keine Ranking-Autorität |
| 27 | unsichere World Attribution | unresolved | unresolved | Context fehlt | unsicheres Fact wird kein Taste |
| 28 | Consent Withdrawal | neutral | neutral | neutral | keine personenbezogenen Inputs |
| 29 | Full Reset | neutral | neutral | neutral | keine Rebuild-Materialien |
| 30 | Account Erasure | neutral | neutral | neutral | personenbezogene Stores `DELETE` |
| 31 | Commercial Counterfactual | Boundary reject | Boundary reject | Boundary reject | kein kommerzieller Signalpfad |
| 32 | große Menge, geringe Vielfalt | neutral | neutral | neutral | Häufigkeit ist keine Präferenz |
| 33 | No Consent | neutral | neutral | neutral | kein Subject und keine personenbezogenen Inputs |
| 34 | Kill Switch | neutral | neutral | neutral | keine aktive oder persönliche Projection |

Die Unterschiede sind Kandidatenvergleiche, keine Empfehlung einer Product Policy. Alle synthetischen Thresholds stehen im jeweiligen `calibrationBasis` und tragen `productCalibrated:false` sowie `productionAuthorized:false`.
