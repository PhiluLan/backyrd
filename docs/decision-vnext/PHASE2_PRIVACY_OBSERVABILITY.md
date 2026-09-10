# Decision vNext Phase 2 — Privacy and Observability

The harness is synthetic and has no network, database, Supabase credential, Production ID or persistence requirement.

## Report allowlist

Allowed for a later separately approved shadow design: pseudonymous subject binding (preferably only through an access-controlled envelope reference), contract/manifest/snapshot hashes, engine versions, status and reason codes, aggregate counts, candidate IDs already authorized for the Decision, and non-semantic runtime/cost diagnostics.

Forbidden in evaluation reports and logs: real user data, raw events, raw review/search/free text, precise raw location, private social data, complete User snapshots, secrets/tokens, private source URLs, Payment, Subscription, Owner or Advertising state, and raw AI output.

The current machine report contains no actor, request body or raw location. It contains only hashes, synthetic candidate references, counts, reason codes, fixture evidence, versions and a nullable non-semantic duration. Scenario and seed are derived display values whose authority is the hashed evaluation record; the complete synthetic config remains in the server execution envelope, not the report.

The local/CI trust anchor contains Git source/tree and artifact identities but no credentials. It proves consistency against an explicitly accepted synthetic execution record, not deployment provenance. A future shadow or Production runner must obtain its trust anchor from independently controlled build/deployment attestation and must not construct it from the artifact under validation.

## Retention and deletion direction

No store is implemented. A future shadow store requires a separate purpose/retention decision, access control, user export/deletion mapping and strict separation of short-lived exact replay from longer-lived forensic manifests. Exact User projections must not be retained indefinitely; long-lived analysis should prefer minimized hashes, version identities and aggregated outcomes.

## User Intelligence compatibility point

`DecisionVNextUserProjectionPort` remains the only User boundary. A future canonical Projection version must be accepted through a versioned adapter that validates and minimizes it; Decision will not consume Phase-2 Evidence Chains, raw events, journeys, review text or Memory stores.
