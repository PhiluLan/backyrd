# D1 — Decision Lab Findings

## D1-LAB-F-001 — Full Fidelity not executed

- Area: Embeddings
- Evidence: kein `DECISION_LAB_OPENAI_API_KEY` in der D1-Ausführungsumgebung
- Behavior: Full Engine wurde mit explizitem FAST_SIMULATION Query Embedding ausgeführt
- Impact: keine semantische V13-Qualitätsaussage; Mechaniknachweis bleibt gültig
- Severity: P2 Lab limitation
- Status: OPEN FOR TIER 3

## D1-LAB-F-002 — D0-F-002 not yet automated end-to-end

- Area: Known-finding registry
- Evidence: Flight Recorder besitzt Source/Distribution-Felder, aber keine permanente semantic-only/fallback Assertion
- Impact: D0-F-002 bleibt dokumentiert, aber noch nicht als Lab Regression ausführbar
- Severity: P2 Lab limitation
- Status: OPEN; do not fix engine in D1

## D1-LAB-F-003 — Full world and full engine demonstrated separately

- Area: Scale
- Evidence: Full World 500/300/3.600/30.000/12.000; Full Engine controlled world with three runs
- Impact: Aufbau und Mechanik sind bewiesen, kombinierter Tier-3-Durchsatz nicht
- Severity: P2 Lab limitation
- Status: OPEN FOR NIGHTLY/TIER 3

## D1-LAB-F-004 — No new P0 integrity defect

- Area: Decision integrity
- Evidence: canonical Product Eligibility regression and three disposable Full Engine runs passed
- Impact: D1 Stop Rule not triggered
- Severity: informational
- Status: CLOSED
