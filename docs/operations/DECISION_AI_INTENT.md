# Decision Product intent interpretation

Status: opt-in Product release component; OFF by default. This is part of the
single `decision-v13` Product route, not a second Decision engine.

## Purpose and authority

After verified authentication, Product control and the existing Decision rate
limit, the server first uses the released deterministic lexicon. Only an
unresolved wish may be sent to OpenAI to map it to exactly one
of the seven released Product intent categories or `null`. The model receives
only the submitted wish. It receives no user identity, history, World Knowledge,
candidate list or service credential. The request sets `store: false`.

The model is **not** an authority for spot facts, age suitability, opening
hours, eligibility, or ranking. Its output is schema-bounded, locally checked,
then evaluated by the same canonical World/User/Decision Product path. An
unresolved main wish cannot authorize a ranked candidate. Provider, cache,
schema, and control failures fail closed; they never invoke a legacy route or
silently return unrelated spots.

The private cache binds one enum-only result to the authenticated user, exact
original request hash, model, release/artifact/source-set hashes and control
generation for at most 24 hours. It persists no raw text or provider response.
This makes repeated requests stable for the Product idempotency ledger. User
deletion cascades into the cache; expired rows are removed in bounded batches.

## Release and activation

This is a `PRODUCT_RELEASE` plus `DATABASE_PR`; Production remains a separate
manual `PRODUCTION_RELEASE` against the exact certified Main SHA. The new
versioned migration must pass clean boot, RLS/grants and allow/deny tests. Do
not apply it manually or bypass the recovery-risk gate. Deploy the certified
`decision-v13` artifact with `BACKYRD_DECISION_AI_INTENT_ENABLED` absent or
`false` first. Keep `OPENAI_API_KEY` server-side only.

On 2026-10-03 the Founder explicitly accepted the untested database-recovery
risk for migration `20261003111539_decision_ai_intent_cache_v1.sql` at SHA-256
`bb7f64fe1dfe2c99c920bae57eb3c50d1b6ccefddc63952b8560f310836c95b2`.
The Founder and CTO separately approved only its bounded deletion of expired
rows from the newly introduced private intent cache. This is not authority to
delete existing Product data or to execute the migration outside the manual
Production release.

The manual Production deployment run `37121530704` completed with `PASS` for
canonical Main `67296a000e7d82d15860b5e3a4d69bce8bce6c1c`; its immutable
audit lists only the migration above and `decision-v13`. Fresh read-only
Production inspection then found 174 migrations ending at that migration and
active `decision-v13` version 168. The shipped-source ledger was reconciled
from this evidence without editing Production migration history. The AI
feature remained OFF.

Before activation, verify the exact model named in
`BACKYRD_DECISION_AI_INTENT_MODEL` is available to the Production project and
supports strict Structured Outputs on Responses with `store: false`; confirm
latency within `BACKYRD_DECISION_VNEXT_TIMEOUT_MS`, rate/cost limits, privacy
notice, and a safe failure response. Run a controlled one-account pilot with
ordinary requests including "Familienausflug in Basel", "Regentag mit meiner
4-jährigen Tochter", plain food/coffee, and mixed/ambiguous wishes. Check the
sealed interpretation and whether any shown spot has verified core intent and
hard-constraint evidence. Do not equate an AI label with age suitability.
For the first pilot, `gpt-6-luna` is the intended low-cost classification
candidate; its request explicitly uses no reasoning effort to keep the 120-token
output bound suitable for a one-field result. Verify actual account access and
response timing before enabling even the pilot.

For the controlled pilot, set `BACKYRD_DECISION_AI_INTENT_ENABLED=true` only
alongside `BACKYRD_DECISION_AI_INTENT_USER_ALLOWLIST` containing the exact test
account UUID. An absent or empty list permits no AI calls. The explicit value
`*` permits all authenticated accounts and requires a separate
general-availability approval after the privacy notice is published. Malformed
lists fail closed. If a provider or quality failure occurs,
set it back to `false`; the deterministic Product path remains, with unknown
intents showing no unrelated ranked list. No model key or raw user wish should
appear in logs or release evidence.

The first Production pilot is controlled by the manual
`decision-ai-pilot-production.yml` workflow. It requires the exact current Main
SHA, the successful audited `decision-v13` deployment run, and literal mode
confirmation. The workflow verifies the deployed bundle and existing server-side
OpenAI key before setting `gpt-6-luna`, the one approved user UUID, and only
then the enable flag. `EMERGENCY_OFF` is a separate manual mode that sets the
flag false without waiting for model checks. The workflow reports
`PILOT_CONFIGURED_ONE_ACCOUNT_PROVIDER_NOT_YET_VERIFIED`, not pilot success;
the authenticated one-account request, provider result, costs, and ranking
evidence must still be checked before any broader activation.
