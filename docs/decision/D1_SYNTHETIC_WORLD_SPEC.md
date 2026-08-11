# D1 — Synthetic World Specification

## Version contract

Generator `decision-lab-generator-v1`, Ground Truth `latent-utility-v1`. Eine Änderung an Verteilungen, Persona-Biases, Noise, Utility, Texttemplates oder Verhalten verlangt eine neue Version. Benchmark-Manifeste sind unveränderlich.

## Latent and observed boundary

Latent Truth enthält nur Lab-Wahrheit. Observed Product Data enthält nur Informationen, die Backyrd real sehen könnte. `productSeedSql()` schreibt User/Spots/Reviews/Documents/Embeddings/Decision History/ML Events in kanonische Contracts und Latent Truth ausschließlich nach `decision_lab.*`.

## Users

Jeder User hat Persona und Maturity sowie kontinuierliche individuelle Vektoren für acht Moods und acht Categories, Price Target, Novelty, Distance, Social Context und Action/Review Propensity. Personas verschieben Verteilungen; sie bestimmen keine Person vollständig.

## Spots

Spots variieren Category, Data Density, Mood Reality, Quality, Price, Social Fit, Indoor, Novelty, Distance und Open State. Coordinates liegen in einem künstlichen Basel-artigen Bereich. Product Status und Distribution enthalten permanente Integrity Fixtures.

## Contexts and time

Contexts enthalten Audience, Time Bucket, Mood Needs, Indoor/Open Constraints, Weekday und Weather. Historie reicht deterministisch von Day -180 bis Day 0; der feste logische Referenzzeitpunkt ist 2026-08-11T12:00:00Z.

## Observations

Description Coverage hängt von Density ab. Observed Moods sind zufällig ausgelassene Projektionen. Reviews verwenden reproduzierbare Synonyme und sind long-tail verteilt. Keine Review-Metadaten enthalten Persona oder Latent Utility.

## Behaviour

Exposure fällt mit Rank exponentiell. Actions hängen von Exposure, Utility, User Propensity und Noise ab. Top 1 ist nicht automatisch Erfolg. Event Types werden auf aktuelle ML-Contracts abgebildet.

## Independent utility

Soft Utility:

```text
0.20 category fit
+ 0.24 mood/context fit
+ 0.12 price fit
+ 0.10 social fit
+ 0.08 indoor fit
+ 0.08 distance fit
+ 0.06 novelty fit
+ 0.12 intrinsic quality
```

Open und Product Eligibility sind latente Hard Constraints. Diese Formel ist eine Evaluator-Hypothese für kontrollierte Synthetic Truth, keine Kopie und keine Empfehlung für Production Ranking.

## World Health

Eine Welt ist invalid bei fehlenden Cohorts/Categories/Density/Eligibility/Distribution Fixtures, unzureichender User-/Spot-Varianz, uniformen Reviews oder perfekter Latent→Observed-Kopie. Invalid Worlds dürfen nicht in D2-Metriken eingehen.

## Partitions

- DEVELOPMENT ist für Engineer-Debugging sichtbar.
- REGRESSION ist stabil und Änderungen benötigen Review.
- LOCKED_HOLDOUT wird in D2 operational separat gehalten; Engineer sieht vor Zertifizierung weder Seeds noch erwartete Utility-Ordnung.
