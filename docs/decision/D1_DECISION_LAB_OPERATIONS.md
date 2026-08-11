# D1 — Decision Lab Operations

Alle Befehle laufen aus dem Repository Root. Production ist verboten.

## Fast deterministic world

```bash
npm run decision-lab:smoke
node decision-lab/src/cli.mjs generate --config decision-lab/config/world-v1.json
node decision-lab/src/cli.mjs seed --config decision-lab/config/world-v1.json
```

`generate` erzeugt Manifest, World, Health, Scenarios, Counterfactuals und Human-Inspection. `seed` erzeugt zusätzlich `product-seed.sql`; es führt SQL nicht automatisch aus.

## Safety acknowledgement

Vor jeder mutierenden Lab-Operation müssen alle Werte explizit lokal sein:

```bash
export DECISION_LAB_ALLOW_LOCAL=1
export DECISION_LAB_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
```

Ein fehlender/remote/linked Zustand bricht ab. Niemals Production-Credentials einsetzen.

## Canonical zero-to-destroy demonstration

```bash
scripts/decision/run-d1-canonical-demo.sh
```

Der Befehl erstellt einen frischen temporären Supabase-Stack, führt Migrationen, controlled Product Fixture, canonical learning, drei authentifizierte Full-Engine Runs und Export aus und zerstört den Stack automatisch. Standard ist `FAST_SIMULATION`.

## Full Fidelity

```bash
export DECISION_LAB_EMBEDDING_MODE=FULL_FIDELITY
export DECISION_LAB_OPENAI_API_KEY='...separate lab credential...'
scripts/decision/run-d1-canonical-demo.sh
```

Ohne Key bricht der Lauf ab. Keys werden nie geloggt oder exportiert. Große Full-World Full-Fidelity Runs gehören zu Tier 3 und benötigen eine explizite Kostenplanung.

## Apply generated Product seed

Nur in einem bereits geprüften disposable Stack:

```bash
psql "$DECISION_LAB_DB_URL" -X --set ON_ERROR_STOP=1 \
  --file decision-lab/.generated/<world-id>/product-seed.sql
```

Die SQL-Datei enthält beobachtete Product-Daten in `public/auth` und versteckte Wahrheit in `decision_lab`; sie ist ignored und nicht für Production geeignet.

## Tests

```bash
npm run decision-lab:test
npm run decision-lab:smoke
scripts/ci/validate-supabase-local.sh
```

## Reset and destroy

```bash
node decision-lab/src/cli.mjs reset
node decision-lab/src/cli.mjs destroy
```

Diese Befehle entfernen generated Artefakte nach Safety-Prüfung. Der canonical demonstration runner besitzt seinen DB-Lifecycle selbst und zerstört ihn per Trap.

## Reproduce an experiment

Checkout des Manifest-Git-SHA, Prüfung von Migration-/Engine-Hash, Verwendung derselben Config/Seed/Generator-Version, Regeneration, World-Hash-Vergleich, danach identischer Scenario Set Run. Bei Full Fidelity müssen Modellname und gecachte Embeddings identisch sein; andernfalls ist numerische Gleichheit nicht behauptbar.

## Git policy

Commit: Generator, Configs, kleine Fixtures, Tests, Migration, Docs und Manifest-Schemas. Nicht committen: `.generated`, Exporte, DB-Volumes, große Traces, Keys oder temporäre Embeddings.
