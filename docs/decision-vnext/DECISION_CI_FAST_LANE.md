# Decision CI Fast Lane

Status: technische CI-/Testarchitektur, keine Product- oder Production-Semantik.  
Canonical Base: `8744d34e99413ea1f89f6df5fbc3814061abca39`.

## Existing system audit and measured root cause

Der bisherige Required-Decision-Job war ein einzelner serieller Job. Der Main-Lauf `34659163175` benötigte für den Decision-Job 675 Sekunden: 18 Sekunden Installation, 478 Sekunden für den vNext-Block und 149 Sekunden für `decision-lab:test`; die übrigen Lab-Gates benötigten zusammen rund 14 Sekunden. Einschließlich Klassifikation und Aggregation lag die beobachtete GitHub-Wall-Clock bei rund 699 Sekunden.

Die lokale Einzelmessung zeigte den dominanten Engpass: 21 Tests in `phase2-evaluation-harness.test.mjs` benötigten seriell 177,8 Sekunden. Die übrigen 85 Decision-vNext-Tests lagen zusammen deutlich unter einer Minute. Zusätzlich starteten `typecheck`, `test`, `sandbox:smoke`, `phase2:evaluate`, `phase3a:context` und `phase3b:context` jeweils erneut TypeScript-Builds der World-, User- und Decision-Packages. Die großen Welten, Evaluationsprofile und Decision-Lab-Gruppen waren unabhängig, wurden aber seriell ausgeführt.

Die maschinenlesbare Bestands- und Zielmatrix liegt in `DECISION_CI_EXECUTION_MATRIX.json`. Die Optimierung entfernt keine Assertion: Sie baut einmal, bindet das Artefakt an Lockfile, Node-Major, Source-Set und geschlossenen Testplan und verteilt anschließend unabhängige vollständige Gruppen. Innerhalb der Phase-2-Testdatei wird die unveränderliche Standard-Evaluation einmal erzeugt; getrennte Assertions prüfen dasselbe tief eingefrorene Result, während jede abweichende Authority-, Context-, World-, User- oder Manipulationsvariante weiterhin neu ausgeführt wird. Damit sank diese Datei lokal von 177,8 auf 60,2 Sekunden; die vier vollständigen Shards benötigen 36,3 / 19,1 / 16,4 / 19,2 Sekunden.

## Drei Ebenen

### Local Fast Lane

`npm run decision-ci:fast`

Der Befehl baut World/User/Decision genau einmal, führt den Decision-Typecheck, die geschlossene Phase-2-Routing-Prüfung, 31 Core-/Contract-/Integrity-Tests und die kleine deterministische Smoke-Welt aus. Gemessen: 18,2 Sekunden warm nach `npm ci`; der beobachtete Cold-Cache-Vorlauf durch `npm ci` betrug 13,0 Sekunden, zusammen 31,2 Sekunden. Er ersetzt niemals den finalen Gate.

Gezielte Gruppe:

`npm run decision-ci:group -- --group phase2-2`

### Required PR Decision Gate

Ein kurzer Preflight installiert strikt aus dem Lockfile (`npm ci --ignore-scripts`), prüft Routing/Aggregation, baut einmal und erzeugt ein SHA-256-gebundenes Artefakt. Danach laufen parallel:

- Decision Core und Context Integrity;
- vier geschlossene Phase-2-Shards;
- Founder Oracles und beide Workbench-Replays;
- beide vollständigen Welten und Phase-2-Profile;
- Decision Lab;
- vollständige World-/User-/Shared-Consumer-Regression.

Der stabile Check `Versioned Decision semantics and evaluation` ist nur erfolgreich, wenn jede Pflichtgruppe erfolgreich ist. Ein fehlender, übersprungener oder unbekannter Shard scheitert. Die vier Phase-2-Shards enthalten zusammen exakt die 21 kanonischen Tests; neue, gelöschte oder umbenannte Titel erfordern eine explizite Änderung des versionierten Plans.

### Post-merge / recertification

Ein Push auf `main` klassifiziert die Pipeline-Änderung erneut und führt denselben vollständigen, source-gebundenen Gate aus. Release-, Workbench-, Production-State- und Deployment-Verträge bleiben Bestandteil der übergeordneten Risk-Architektur. Es findet keine Production-Ausführung statt.

## Change classification

| Änderung | Routing |
|---|---|
| reine bekannte Dokumentation | Repository-/Secret-Gate, kein großer Decision-Gate |
| reine Admin-Oberfläche | Admin plus Repository, kein Decision Lab |
| World-, User- oder Shared-Contract | Shared und vollständiger Decision-Consumer-Gate |
| Decision Core, Context, Eligibility, Evidence, Replay, Manifest, Policy oder Evaluation | vollständiger Decision-Gate |
| Workflow, Package-Scripts oder Decision-Test-Routing | vollständige Pipeline-Selbstprüfung plus Delivery Contracts |
| gelöschter Test | als Test-Routing-Änderung erkannt; vollständige Selbstprüfung |
| unbekannter Repository-Pfad | fail-closed: Decision plus Delivery Contracts |
| Migration/Production-Vertrag | Database/Delivery-Gates zusätzlich; keine Ausführung |

## Artifact and cache integrity

Der Build-Manifest-Vertrag bindet:

- SHA-256 des Lockfiles;
- Node-Major-Version;
- Version des geschlossenen Testplans;
- Hash jedes relevanten Source-, Test-, Fixture- und Decision-Lab-Inputs;
- Hash jedes ausgelieferten World-, User- und Decision-`dist`-Bytes;
- kanonischen Manifest-Hash.

Jeder Shard verifiziert das heruntergeladene Artefakt gegen seinen eigenen Checkout. Cache Miss führt zum normalen Preflight-Neubau. Manipulierte Bytes, falscher Build-Hash oder ein Artefakt aus einem anderen Source Tree scheitern. `node_modules`, Secrets, Tokens, User- oder Production-Daten werden nicht als Artefakt geteilt. Der npm-Cache ist durch Betriebssystem, Runtime und Lockfile gebunden; Tests und Replay-Ergebnisse selbst werden nie aus einem Cache als PASS übernommen.

## Determinism and isolation

Jeder Shard besitzt einen separaten GitHub-Runner und dessen eigenes temporäres Verzeichnis. Seed-, Registry-, Release- und Trust-Identitäten bleiben unverändert. Die parallele Ausführung verändert weder Inputs noch Output-Hashes. Capabilities werden nicht serialisiert oder zwischen Prozessen übertragen; jeder Prozess validiert seine Inputs erneut.

## Developer runbook

- Fast Lane: `npm run decision-ci:fast`
- Einzelgruppe: `npm run decision-ci:group -- --group <group>`
- Routing/Aggregator/Artifact-Negativtests: `npm run decision-ci:test`
- Artefakt reproduzieren: `node scripts/ci/decision-build-artifact.mjs --create /tmp/decision-build.json`
- Artefakt prüfen: `node scripts/ci/decision-build-artifact.mjs --verify /tmp/decision-build.json`
- CI-Routing simulieren: `node scripts/ci/classify-change.mjs --base-sha origin/main --head-sha HEAD --checkout-sha HEAD --canonical-main-ref origin/main`

Fehler tragen die Gruppe und eine stabile Ursache, etwa `decision_test_not_routed`, `decision_artifact_integrity_mismatch` oder `decision_shard_missing`.

## Boundaries and remaining bottlenecks

Unverändert bleiben sämtliche Source-/Release-/Manifest-, Oracle-, Context-, World-/User-, Candidate-, Eligibility-, Ranking-Fixture-, Confidence-, Evidence-, Explanation-, Replay-, Privacy- und Commercial-Neutrality-Prüfungen. Phase 3C wurde nicht begonnen.

Der einmalige vollständige serielle Referenzlauf aller neuen Gruppen benötigte vor der sicheren Phase-2-Fixture-Wiederverwendung 481,6 Sekunden. Danach sank die vollständige unveränderte Decision-vNext-Suite mit allen 106 Tests von zuvor 197,6 auf 60,9 Sekunden. Der verbleibende Unterbau ist CPU-gebunden: abweichende Phase-2-Integrationsläufe erzeugen und validieren absichtlich vollständige rekursive Results; Decision Lab (190,8 Sekunden einschließlich aller Untergates) und die zwei großen Welten/Profile (101,0 Sekunden) bleiben eigenständige Beweise. Diese Arbeit wird parallelisiert, nicht abgeschwächt. Ein Cold Cache trägt zusätzlich die strikt gelockte npm-Installation. Reine nicht ausführbare Dokumentation löst diese großen Gruppen nicht aus. GitHub-Wall-Clock und kumulierte Runner-Zeit der optimierten Pipeline werden erst aus dem finalen unveränderten PR-Head eingetragen; bis dahin werden keine modellierten Werte als Messung ausgegeben.
