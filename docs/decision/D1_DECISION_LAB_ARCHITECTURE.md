# D1 — Decision Lab Architecture

Stand: 2026-08-11
Scope: wissenschaftlich isolierte Messinfrastruktur; keine Ranking-, Retrieval- oder Gewichtsanpassung

## D1 Executive Verdict

**D1 DECISION LAB — PASS**

**SCIENTIFIC VALIDITY — PASS**

**D2 DECISION EVALUATION FRAMEWORK — READY**

Der D1-Unterbau erzeugt eine deterministische Basel-artige Welt mit unabhängiger latenter Wahrheit, leitet daraus lückenhafte und verrauschte Product-Beobachtungen ab, hält beides strukturell getrennt und kann den vollständigen kanonischen `decision-v13`-Handler gegen eine disposable lokale Supabase-Instanz ausführen. Es wurde keine zweite Ranking Engine implementiert. D1 macht ausdrücklich keine Aussage über die Qualität von V13.

Die kanonische Demonstration bestand aus zwei getrennten Nachweisen:

- **FULL WORLD + FAST SIMULATION:** 500 User, 300 Spots, 3.600 Reviews, 30.000 Interaktionen und 12.000 historische Decisions; deterministisch erzeugt und World-Health-validiert.
- **SMALL CONTROL WORLD + FULL ENGINE:** frische kanonische DB, synthetische Product-Daten, authentifizierte V12-Runs, semantischer RPC, Product Eligibility, Distribution, vollständiger kanonischer V13-Handler, Flight Recorder und anschließende Zerstörung. Query Embeddings waren deterministische `FAST_SIMULATION`-Embeddings, nicht `text-embedding-3-small`.

Ein `FULL WORLD + FULL ENGINE + FULL_FIDELITY`-Lauf wurde nicht behauptet. `FULL_FIDELITY` verlangt absichtlich `DECISION_LAB_OPENAI_API_KEY`; ohne diesen separaten Key gibt es keinen Fallback.

## 1. Decision Lab Architecture

```text
versioned config + seed
        │
        ▼
independent latent world ───────────────┐
 users / spots / contexts              │ evaluation only
        │ noisy observation model      │
        ▼                              │
canonical Product-shaped observations │
        │                              │
        ▼                              │
canonical DB + canonical V13 source    │
        │                              │
        ▼                              ▼
observed Flight Recorder trace ── independent latent utility
```

Ownership liegt geschlossen unter `decision-lab/`, der disposable Orchestrator unter `scripts/decision/`, das isolierte Schema unter `decision_lab` und die kanonische Dokumentation unter `docs/decision/`.

## 2. Scientific Validity Model

`latentUtility()` konsumiert ausschließlich latente User-, Spot- und Context-Dimensionen. Es importiert weder Engine-Code noch V11/V12/V13-Scores, Semantic Similarity, gelernte Taste-Gewichte oder Engine-Ränge. Die Utility besteht aus Category-, Mood-, Price-, Social-, Indoor-, Distance-, Novelty- und intrinsischem Fit sowie unabhängigen Hard Constraints für Open/Product Eligibility.

Observed Daten sind eine probabilistische Projektion: Descriptions können fehlen, Moods werden unvollständig beobachtet, Review-Sprache variiert, Aktionen enthalten Noise und Exposure-/Position-Bias. Gute Fits werden nicht immer geliked, schlechte nicht immer disliked, und viele Impressions erzeugen keine Aktion.

## 3. Isolation & Production Safety

Mutierende Lab-Befehle verlangen gleichzeitig:

- `DECISION_LAB_ALLOW_LOCAL=1`,
- eine explizite `DECISION_LAB_DB_URL`,
- Host `localhost`, `127.0.0.1` oder `host.docker.internal`,
- keine linked Supabase-Metadaten im tatsächlichen Lab-Workdir,
- keine bekannte Production Project Ref,
- keine gehostete Supabase-Domain.

Fehlende oder mehrdeutige Konfiguration führt zum Abbruch. Es existiert kein Production-Fallback. Die kanonische Demonstration erstellt ein temporäres Projekt mit eigenen Ports und zerstört es per Trap.

## 4. Reproducibility

Der Manifest-Vertrag enthält World ID, Seed, Generator-/Ground-Truth-/Scenario-/Evaluation-Version, Git SHA, Migration Hash, kanonischen Engine-Source-Hash, Embedding Mode, Counts, festen logischen Generierungszeitpunkt und World Hash. Laufzeitmessungen gehören nicht zur World-Identität.

Same-Seed-Akzeptanz vergleicht serialisierte Welten bytegleich. Multi-Seed-Akzeptanz verlangt abweichende IDs und latente Zustände bei gleichzeitig bestandener World Health.

## 5. Synthetic Basel World

Canonical World V1:

| Element | Count |
|---|---:|
| User | 500 |
| Spots | 300 |
| Reviews/Moments | 3.600 |
| beobachtete Interaktionen | 30.000 |
| historische Decisions | 12.000 |
| approved / pending / rejected / archived | 275 / 12 / 8 / 5 |
| NORMAL / REDUCED / QUARANTINED / EXCLUDED | 255 / 26 / 10 / 9 |

Category Counts: Restaurant 57, Café 46, Activity 35, Culture 35, Bar 33, Outing 33, Experience 31, Nightlife 30. Density: 77 sparse, 167 medium, 56 dense.

## 6. User Cohorts

Die acht Verteilungs-Personas sind `date_planner`, `social_explorer`, `quiet_regular`, `culture_seeker`, `family_planner`, `budget_discoverer`, `spontaneous_local` und `novelty_hunter`. Sie definieren Verteilungs-Biases, keine identischen Personen. Keine sensitive Identität wird modelliert.

Maturity V1: 71 cold, 54 onboarding, 110 sparse, 120 developing, 112 mature, 33 power.

## 7. User Latent Truth

Latent sind Mood- und Category-Präferenzen, Preisziel, Novelty, Distanz-Toleranz, situationsbezogener Social Fit, Action- und Review-Propensity. Diese Felder liegen nur im Lab-Artefakt beziehungsweise `decision_lab.latent_users`.

## 8. Spot Latent Truth

Latent sind reale Mood-Ausprägung, intrinsische Qualität, Preis, Social Fit, Indoor Fit, Novelty, Distanz und zeitabhängige Open-Wahrheit. Product Status ist bewusst beobachtbare kanonische Eligibility, nicht ein versteckter Qualitätswert.

## 9. Context Model

Contexts variieren Audience, Time Bucket, Mood-Bedarf, Indoor Constraint, Open Requirement, Weekday und Weather. Die Verteilung ist nicht uniform. Counterfactuals halten World/User konstant und ändern genau die deklarierte Request-Dimension.

## 10. Behaviour Generator

Aktionen entstehen aus unabhängiger Utility, User-Propensity und Noise. Rank beeinflusst die Wahrscheinlichkeit, dass ein Spot überhaupt beobachtet wird. Event Counts: 27.585 reine Impressions, 897 Opens, 519 Dislikes, 481 Likes, 310 Saves, 208 `was_here`-ähnliche Signale.

## 11. Observation Noise

Latente Mood-Vektoren werden nicht in Product-Tabellen kopiert. Product Descriptions und observed Moods sind lückenhaft. Reviews drücken nur eine zufällige Teilmenge starker Eigenschaften aus. Interaction Outcome ist probabilistisch.

## 12. Review / Mood Generation

Review-Text kommt aus versionierten deterministischen Templates mit variierenden Einstiegen und Synonymen. Spot-Zuweisung ist long-tail statt uniform; Review-Count-Varianz ist ein World-Health Gate.

## 13. Historical Simulation

Zeitpunkte liegen deterministisch zwischen Day -180 und Day 0. Der Product-Seed exportiert `decision_sessions`, `decision_impressions` und `backyrd_ml_events_v1` in die realen Product Contracts. Große generierte SQL-/JSON-Artefakte bleiben ignored.

## 14. Canonical Learning Integration

Die Acceptance-Fixture führt zwei unterschiedliche Synthetic Histories über `backyrd_ml_log_event_v1` aus und verlangt anschließend unterschiedliche `backyrd_user_feature_weights_v1`-Zustände. Sie beurteilt nicht, ob das Lernen optimal ist.

## 15. Embedding Strategy

`FULL_FIDELITY` verwendet ausschließlich den separaten Lab-Key und das aktuelle OpenAI-Modell. `FAST_SIMULATION` nutzt deterministisches tokenbasiertes Feature Hashing auf 1.536 Dimensionen. Diese Vektoren sind cosine-kompatibel und geeignet für Mechaniktests, aber nicht für V13-Qualitätsmetriken.

## 16. Ground-Truth Utility

Utility wird komponentenweise exportiert und enthält Hard-Constraint-Flags. D2 kann dadurch Candidate Recall getrennt von Ranking Failure messen. Noch existiert kein aggregierter „Decision Quality“-Score.

## 17. Decision Engine Adapter

Der Adapter liest `supabase/functions/decision-v13/index.ts`, prüft stabile Handler-Anker, transpiliert dieselbe Quelle und fängt nur die `Deno.serve`-Registrierung ab. Der vollständige Handler ruft die echten lokalen RPCs. Es gibt im Lab keine kopierten V13-Gewichte oder Ranking-Regeln.

## 18. Flight Recorder

V1 erfasst Run/Mode/Engine Hash, Input, User, Query Text, Intent, Stage Counts, Place-Type Profile, Contextual/Recent Memory, alle finalen Kandidaten einschließlich Fusion-Komponenten, Rank, Sources und Latenz. Observed Engine und Latent Evaluation sind getrennte Dokumente.

## 19. Scenario Library

Enthalten sind Cold Cozy Date, Mature Personalization Conflict, Sparse Unusual Indoor Solo, Guided Family und Exact Pending. Die D0-F-001-Invariante bleibt zusätzlich in `sprint_decision_product_eligibility.sql` permanent abgesichert.

## 20. Counterfactual Runner

V1 enthält Date→Friends, Quiet→Lively, Cheap→Premium, Solo→Family und Friday Evening→Sunday Morning. Runner/Export speichern Base, Counterfactual und deklarierte Dimension; D2 ergänzt Response-Metriken und Schwellen.

## 21. World Health

Gates prüfen Counts, alle Personas/Maturity/Category/Density-Klassen, Product-/Distribution-Fixtures, User-/Spot-Varianz, Review-Long-Tail und unvollständige Beobachtung. Degeneration führt zu einem invaliden Experiment.

## 22. Leakage Protection

`decision_lab` ist nicht in den API Schemas, und `anon`, `authenticated` sowie `service_role` erhalten weder Schema Usage noch Tabellenrechte. Ein permanenter SQL-Test versucht Reads als `authenticated` und sucht Public-Spalten mit `latent_`, `true_` oder `expected_utility`.

## 23. Determinism

14 Node-Akzeptanztests bestanden. Same seed ist bytegleich, unterschiedliche Seeds unterscheiden sich materiell, und Generatorlaufzeit ist nicht Teil der Weltidentität.

## 24. Multi-Seed Validation

Smoke Seed und alternativer Seed bestehen beide World Health; IDs und Präferenzzustände unterscheiden sich. Locked Holdout Seeds werden erst in D2 operational geschützt.

## 25. Product Eligibility Validation

D0-F-001 bleibt durch den permanenten Exact-Name/Broad-Query/V11/V12/Distribution-Test geschützt. Das Lab enthält zusätzlich absichtlich starke pending/rejected/archived Fixtures. Nicht-approved Utility wird durch das unabhängige Product Constraint auf null gesetzt.

## 26. Distribution Validation

NORMAL, REDUCED, QUARANTINED und EXCLUDED sind in jeder gültigen Welt erforderlich. Die kontrollierte Full-Engine-Fixture übt NORMAL/REDUCED/QUARANTINED aus. Policy und Prioritäten wurden nicht verändert.

## 27. Known Finding Reproduction

D0-F-002 bleibt als `KNOWN CURRENT DEFECT` registriert. Die Infrastruktur kann Source Membership und Distribution Priority erfassen; eine vollständig automatisierte semantic-only/fallback Reproduktion ist als D1-LAB-F-002 offen und blockiert keine wissenschaftliche Grundvalidität.

## 28. Current Engine Compatibility

In drei authentifizierten Runs wurden V11 indirekt, V12 direkt, semantischer RPC, Place-Type/Context Taste, Recent Memory, Distribution, Fallback und kanonische V13-Fusion ausgeführt. Candidate Counts waren 10+11, 10+11 und 2+2 vor Fusion/Fallback.

## 29. Canonical Demonstration

```text
fresh temporary directory
→ canonical migrations
→ D1 isolated schema
→ controlled synthetic Product fixture
→ canonical learning acceptance
→ full canonical V13 handler (3 runs)
→ Flight Recorder JSON
→ local stack stop
→ temporary directory deletion
```

Kein manueller DB-Eingriff und kein Production-Zugriff. Top examples waren Riverside Wine Bar für die ersten beiden kontrollierten Requests und Cabinet of Curiosities für Sparseville. Das ist Mechaniknachweis, keine Qualitätsbewertung.

## 30. Lab Performance

Canonical full world generation: ca. 0,26 s auf dem lokalen Mac; generierte ignored Artefakte ca. 16 MB. Full Engine Fast-Simulation Runs: 82,305 ms, 31,890 ms und 29,932 ms. Diese Werte sind weder Production- noch Full-Fidelity-Latenzen.

## 31. External API Cost

Ausgeführte externe Embedding Calls: 0. Kosten: 0. Cache-Rate nicht anwendbar. Der Full-Fidelity-Pfad wurde wegen fehlendem separaten Lab-Key nicht ausgeführt und nicht simuliert.

## 32. CI Strategy

- Tier 1 blocking candidate: Node smoke world, determinism, safety, leakage/source-adapter tests plus Lab-Schema SQL Acceptance.
- Tier 2 Decision PR: kontrollierte disposable Full-Engine-Demonstration.
- Tier 3 manual/nightly: 500-User Product Seed, History, Full Fidelity Embeddings und breitere Szenarien.

Nur Tier 1 wurde in den normalen Quality-Workflow aufgenommen. Der große World Run bleibt lokal/nightly.

## 33. Lab Findings

Siehe `D1_LAB_FINDINGS.md`. Keine offene Finding kompromittiert Seed-Determinismus, Separation oder den vollständigen Engine-Mechanikpfad.

## 34. Engine Findings

Keine neue P0-Finding. D0-F-001 bleibt **RESOLVED IN CODE — Production deployment pending**. D0-F-002 wurde weder behoben noch als korrektes Produktverhalten normalisiert.

## 35. Remaining Limitations

- Full Fidelity Embeddings wurden ohne Lab-Key nicht ausgeführt.
- Full World und Full Engine wurden separat bewiesen, nicht als kombinierter 500-User-Lauf.
- Historical Product Seed persistiert Events kanonisch geformt; der separate Learning-Proof verwendet die kanonische Lern-RPC. Ein kompletter 30.000-Event-Replay durch die RPC ist Tier 3.
- D0-F-002 ist noch nicht dauerhaft automatisiert reproduziert.
- Blinded human-review UI und finaler Holdout-Schutz gehören zu D2.

## 36. D2 Recommendation

D2 soll zuerst Hard Constraints und Candidate Recall etablieren, danach NDCG/Top-K Latent Utility, Personalization Lift, Context/Counterfactual Sensitivity, Fallback/No-result, Diversity/Repetition, Explanation Alignment und Latenz. MRR ist nur für Szenarien mit einem klaren Ziel sinnvoll; Novelty darf nicht gegen situativen Fit ausgespielt werden. Kein einzelner Score darf Fehlerklassen verdecken.

## 37. D3 Preparation

D3 hält World, Seed, observed History, Scenario Set, Ground-Truth- und Evaluation-Version konstant und ändert nur den Engine Snapshot. Erst nach freigegebenen D2-Metriken wird V13 quantitativ zertifiziert.

## 38–45. Delivery

- Lab schema: additive Migration `20260811220000_create_decision_lab_foundation.sql`
- Scripts: `decision-lab/src/cli.mjs`, `scripts/decision/run-d1-canonical-demo.sh`
- Tests: 14 Node Tests, SQL Isolation Acceptance, bestehende Product Eligibility Regression
- CI: Quality Smoke Job plus Canonical DB Boot
- Branch: `codex/decision-d1-lab-foundation`
- Commit/PR: werden erst nach finaler CI-Validierung erzeugt; Draft, kein Merge

## Verdict explanations

**D1 DECISION LAB — PASS:** Alle wissenschaftlich kritischen Fundamente sind implementiert und der reale Engine-Mechanikpfad ist ausführbar. Die Full-Fidelity-/Skalen-Kombination bleibt als klar ausgewiesene Tier-3-Limitation, nicht als versteckte Behauptung.

**SCIENTIFIC VALIDITY — PASS:** Ground Truth ist unabhängig, observed Daten sind noisy/incomplete, Exposure Bias ist vorhanden, Product Clients können Latent Truth nicht lesen, und identische Welten können künftige Engine-Versionen fair vergleichen.

**D2 DECISION EVALUATION FRAMEWORK — READY:** Candidate-Stages, finaler Rank, Fusion-Komponenten und unabhängige Utility sind getrennt exportierbar. Retrieval-, Ranking-, Constraint-, Context-, Personalization-, Distribution- und Fallback-Fehler können als getrennte Familien aufgebaut werden.
