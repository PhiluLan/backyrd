# Sprint 5 Validation

## Final result

Sprint 5 is closed for controlled internal use. The real OpenAI Responses API,
canonicalization, strict validator, Shadow persistence, and deployed server
worker all completed with `VALIDATED` output. Public N6 routing remains off and
the deterministic Sprint-4 result remains authoritative.

The previous live failure was provider quota exhaustion. After credit was
restored, the first canonical response exposed one integration mismatch: the
provider schema allowed a Moment-sufficiency echo that contradicted the frozen
input. The request schema now constrains both sufficiency echoes to their exact
canonical input values, as it already does for candidate IDs. No model, prompt,
ranking, N3/N4/N5, confidence, or validator rule changed.

## Real provider proofs

- Initial response: `VALIDATOR_REJECTED` (`SUFFICIENCY_MISMATCH`), 10.716 s,
  5,438 input / 884 output tokens, USD 0.10742.
- Corrected local queue: `VALIDATED`, 11.625 s, 5,394 / 901 tokens, USD 0.10800.
- Real Supabase queue: `VALIDATED`, 12.215 s, 5,381 / 947 tokens, USD 0.11063.
- Deployed Edge worker: `VALIDATED`, 14.108 s, 5,398 / 1,051 tokens,
  USD 0.11704.

Total closure exposure: four logical runs and USD 0.44309, below the five-run
and USD 1.00 hard limits. Technical retries: zero. Calls stopped after the
deployed proof.

## Gates and operational state

- frozen candidate identity and candidate-specific reasons: PASS.
- LOW/UNKNOWN honesty and Current Intent authority: PASS.
- canonical response, usage extraction, and whole-output validator: PASS.
- errors/rejection/timeout fall back to deterministic: PASS.
- response-loss, consent/deletion races, rate/cost guards, and kill switch: PASS.
- Shadow → N2 events: 0; visible deterministic mutations: 0.
- cross-user and forged queue/trace operations: denied.
- `decision-engine-worker`: deployed, internal-secret protected, flags OFF.
- N6 public visibility: OFF; deterministic Product routing unchanged.

The Edge artifact is reproducibly bundled from the canonical shared runtime;
it is not a second N6 implementation.
