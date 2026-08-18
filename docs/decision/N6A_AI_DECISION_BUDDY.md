# N6A AI Decision Buddy — North-Star Lab Validation

## Executive summary

N6A implements an isolated, lab-only AI Decision Buddy adapter across the canonical N3 Current Moment, N5 Relevant User Projection and N4 Spot Intelligence boundaries. The deterministic authority and output validators are complete. The 126-decision, three-treatment evaluation matrix, cost controls, cache identity, failure attribution and frozen gates are implemented.

The official execution is currently **STOPPED BEFORE SMOKE** by the intended budget guard. `DECISION_LAB_OPENAI_API_KEY` is present, but `DECISION_LAB_AI_BUDGET_USD` was not set in the execution environment. The Dry Run made zero calls and projected a conservative worst-case ceiling of USD 1.32 for Smoke, USD 19.008 for Pilot and USD 99.792 for Full. No AI quality verdict is claimed.

## Architecture

The model receives structured current intent, the compact N3 moment, the compact N5 decisionspecific projection and ten N4 candidate profiles. Eligibility has already been enforced. The model returns a complete structured ranking, confidence, WHY-FOR-YOU, WHY-NOW and uncertainty codes. A deterministic validator checks identity, parity, schema, evidence support, authority and sufficiency. Invalid output falls back to the unchanged candidate order.

N2–N5 code and freezes are not mutated. No production, app, database or retrieval path is connected.

## North-Star behaviour

- Cold and low-sufficiency states prohibit unsupported personalization reasons.
- Mature/high-sufficiency states may use relevant taste and patterns, never raw history.
- Same User/Different Moment, Different Users/Same Moment and Cross-City are mandatory matrix arms.
- Intent/history conflict explicitly tests that today's request wins.
- Sparse spot intelligence remains UNKNOWN rather than negative.
- Commercial tier is absent from all inputs; identical intelligence is Premium-blind.
- Buddy Direction Alignment is evaluator-owned and includes a hard fundamental-failure rate.

## Controls and metrics

ACTUAL, NEUTRAL and OPPOSING share candidate and moment parity. The evaluator measures NDCG@10, Top-1/Top-3 utility, rank-weighted utility, personalization lift/harm, Mature and Cross-City benefit, contextual differentiation, current-intent robustness, direction alignment, reason support, confidence calibration, output integrity, latency, tokens and cost.

Historical Wave 3C.1, Wave 4 and D4.3 remain evidence only where contracts are not directly comparable. Their verdicts are unchanged.

## Dry-run result

- External calls: 0
- Model frozen by requested contract: `gpt-5.6-sol`
- Candidate count: 10
- Configured budget: absent
- Status: `BLOCKED_BUDGET_REQUIRED`
- Dry-run result hash: `2f59b1da3e24b6e94a05e59bf9d4bbd95718e934851ae12dca07595c5949696c`

## Current verdicts

- N6A AI DECISION BUDDY — **STOPPED**
- AI RANKING QUALITY — **INCONCLUSIVE**
- BUDDY DIRECTION ALIGNMENT — **FAIL (NOT MEASURED)**
- PERSONALIZATION VALUE — **INCONCLUSIVE**
- PERSONALIZATION HARM — **INCONCLUSIVE**
- CONTEXTUAL DECISION INTELLIGENCE — **INCONCLUSIVE**
- CURRENT INTENT AUTHORITY — **PASS (CONTRACT/VALIDATOR)**
- KNOWLEDGE SUFFICIENCY BEHAVIOUR — **PASS (CONTRACT/VALIDATOR)**
- CROSS-CITY PERSONALIZATION — **INCONCLUSIVE**
- CONFIDENCE CALIBRATION — **INCONCLUSIVE**
- EXPLANATION EVIDENCE ALIGNMENT — **PASS (DETERMINISTIC VALIDATOR)**
- AI COST PROFILE — **INCONCLUSIVE**
- AI LATENCY PROFILE — **INCONCLUSIVE**
- SCIENTIFIC VALIDITY — **PASS FOR FROZEN PRE-RUN HARNESS; OFFICIAL MODEL RESULT NOT RUN**
- NORTH-STAR DECISION BUDDY — **NOT VALIDATED**
- N6B PRODUCT INTEGRATION — **NOT READY**
- MODEL EFFICIENCY BENCHMARK — **NOT READY**
- N7 RELATIONAL EXPLANATION — **NOT READY**
- PRODUCTION — **UNCHANGED**

## Resume condition

Set an explicit positive lab budget after reviewing the Dry Run. Smoke may then start from the frozen identity. Pilot is allowed only if Smoke passes and its full worst-case projection fits the remaining budget; Full is allowed only after a passed Pilot and a remaining-budget forecast. No stage may be skipped.
