# ADR-004: Product Semantics & Calibration Foundation

Status: Proposed for Founder/CTO review
Scope: User Intelligence vNext Phase 3B
Production authority: none

## Entscheidung

Wir modellieren Product-Semantik als eigene, versionierte Registry und vergleichen drei unveränderliche Calibration-Policy-Kandidaten über einen deterministischen synthetischen Harness. Policy und Evidence benötigen voneinander getrennte, externe Acceptance-Anker. Ein Eigenhash oder ein Authority-Label ist kein Herkunftsnachweis.

## Gründe

Phase 3A beweist die technische Lernarchitektur, darf aber keine Backyrd-Signalstärken erfinden. Phase 3B muss deshalb Unterschiede sichtbar machen, ohne sie als Product Truth auszugeben. Die Registry definiert erlaubte und ausdrücklich verbotene Schlussfolgerungen; die Policy entscheidet innerhalb dieser Grenze, ob Evidence im Lab ignoriert, beobachtet oder als vorsichtige Hypothese behandelt wird.

## Kandidaten

- A – Conservative Explicit Evidence: ausschließlich qualifizierte explizite Zufriedenheit/Unzufriedenheit erzeugt Concept-Hypothesen.
- B – Balanced Behavioral Evidence: ergänzt vorsichtige, spotgebundene Save-/Visit-/Repeat- und praktische Navigation-Hypothesen.
- C – Context-Sensitive Adaptive: erzeugt explizite Concept-Hypothesen nur contextgebunden und untersucht Exploration/Familiarity als Research-Ebene.

## Invarianten

- Standard und Smart Review sind lernsemantisch identisch.
- Experience ist keine Satisfaction; fehlende Evidence ist neutral.
- Save Removal, Dwell, Quick Skip und Reject erzeugen keine Aversion.
- Eine Journey ist höchstens eine Independence Unit; mehrere Concepts teilen dieselbe Attribution Unit.
- Direct Spot, Practical, Contextual, Recent, Long-Term, Aversion und Exploration bleiben getrennt.
- Positive und negative Evidence bleiben gleichzeitig erhalten.
- Unsichere World-Zuordnung wird nicht zu Concept Taste.
- Production Projection bleibt neutral; Calibration Projection besitzt weder Eligibility noch Ranking Authority.
- Neutrale Decision-Projections werden vom Consumer gegen die kanonische nicht-personenbezogene Neutral-Identität geprüft; nur aktive Projektionen müssen den Actor-Subject-Hash tragen.

## Rebuild

Der echte Phase-3A-Incremental-Reducer bleibt für unveränderte Policy-/Registry-/Reducer-Identitäten zuständig. Jeder Wechsel eines Phase-3B-Kandidaten ist absichtlich ein neuer vollständiger Rebuild aus unveränderter Evidence. Das Calibration Lab ist ein Offline-Vergleich vollständiger synthetischer Szenarien und wird nicht als zweiter Runtime-Reducer ausgegeben.

## CTO Closure 3B.1

Calibration Evidence wird nicht mehr frei als autoritativ wirkendes Objekt konstruiert. Ein Adapter verifiziert zuerst den vollständigen Phase-2-Evidence-State und bindet State-, Chain-, Event-, Journey-, Authority-, World-, Context-, Consent-, Lifecycle- und Correction-Hashes. Eine getrennte synthetische Evaluation Authority akzeptiert anschließend exakt diesen minimierten Datensatz; weder Adapter noch Fixture behaupten Production Authority.

Authority-Anforderungen unterscheiden `ALL_OF` von `ANY_OF`. Projection-Fähigkeit ist ausdrücklich auf das Calibration Lab begrenzt und wird mit der Signal Registry cross-validiert. Sufficiency unterscheidet positive, negative, bidirektionale und tatsächlich konfliktbehaftete Evidence sowie Independence, Vielfalt und World-Relevanz.

## Folgen

Founder und CTO können anhand identischer Evidence konkrete semantische Unterschiede entscheiden. Bis zu einer separaten Freigabe bleibt jede Policy `CALIBRATION_ONLY`; Retention, Gewichte, Decay und Product-Sufficiency bleiben unkonfiguriert.
