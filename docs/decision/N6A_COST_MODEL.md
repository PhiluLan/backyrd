# N6A Cost and Execution Guardrails v1

N6A cannot make an external call without both `DECISION_LAB_OPENAI_API_KEY` and a positive `DECISION_LAB_AI_BUDGET_USD`. Before every stage, the runner compares prior spend plus that stage's worst-case forecast with the configured hard budget and fails closed on equality violations or invalid configuration.

The frozen accounting ceiling is deliberately conservative and is not a provider price claim: USD 10 per million input tokens and USD 60 per million output tokens. It protects the lab even when current account-specific pricing is unavailable. Actual reports use returned token usage against the same ceiling, keeping preflight and enforcement comparable.

| Stage | Requests | Max input tokens | Max output tokens | Worst-case ceiling |
|---|---:|---:|---:|---:|
| Smoke | 5 | 60,000 | 12,000 | USD 1.32 |
| Pilot | 72 | 864,000 | 172,800 | USD 19.008 |
| Full | 378 | 4,536,000 | 907,200 | USD 99.792 |
| Total | 455 | 5,460,000 | 1,092,000 | USD 120.12 |

The numbers are worst-case caps, not expected spend. Each request is independently bounded to ten candidates, 12,000 estimated input tokens, 2,400 output tokens and 60 seconds. Identical calls use the uncommitted cache. The runner reports `LIVE_CALL` and `CACHE_REPLAY` separately.

The official Dry Run on 2026-08-18 made zero external calls. No budget was present in the process, so the result correctly recorded `BLOCKED_BUDGET_REQUIRED`. Smoke, Pilot and Full were not started. Production access and mutation remain absent.
