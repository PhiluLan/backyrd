# User Intelligence Week 2 — Dark Projection Runtime

Week 2 ergänzt die kanonische Week‑1-No‑Write-Foundation um einen realistisch integrierbaren, aber vollständig deaktivierten Projection-Pfad. Der Production-Schalter `USER_LEARNING_RUNTIME` ist `false`; fehlende und unbekannte Konfiguration bleibt `OFF`, der Kill Switch ist `FORCED_OFF`.

Der einzige Output in der lokalen synthetischen Rehearsal ist der bestehende `RelevantUserProjection`-Contract. Der Handoff ist read-only, zweckgebunden und enthält weder Raw Events noch Evidence, Dwell, Rohtext, präzise Standorte oder Commercial-Daten. Es existiert kein Product-Event-Consumer, kein Persistence-/Netzwerkadapter und kein Ranking- oder Eligibility-Pfad.

## Zustandsfluss

1. Ein separat akzeptierter Release- und Authority-Record bindet User, Subject, Consent, Lifecycle und erlaubte Aktion.
2. Ausschließlich synthetische lokale Events passieren die strikte Runtime-Grenze.
3. Das append-only Ledger dedupliziert und rekonstruiert Corrections deterministisch.
4. Nur Save-Planning-State und Familiarity nach drei unabhängigen Visits sind projection-fähig; Search, Skip und Dwell bleiben zurückgehalten.
5. Withdrawal, Reset und Erasure liefern weder persönliche Projection noch persönliches Rebuild-Material.

## Befehle

```bash
npm run user-intelligence-vnext:week2:fast
npm run user-intelligence-vnext:week2:report -- --full-output /tmp/user-intelligence-week2.json --verify-summary docs/user-intelligence-vnext/week2/dark-projection-runtime-release-summary.json
```

Der vollständige Report ist ein reproduzierbares CI-Artefakt. Nur die kompakte Summary wird versioniert.
