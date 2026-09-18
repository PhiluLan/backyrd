# Founder two-account activation runbook

## Authority boundary

This runbook is preparation evidence only. It does not authorize a Production query, secret mutation, deployment, migration, mobile release, OTA, or runtime activation. The candidate and its source-aware plan must keep `executionAuthorized:false`.

The server accepts only the subject UUID obtained from a freshly verified authenticated session. Mobile and Desktop send the ordinary access token and no Founder, allowlist, email, or metadata claim. Membership is resolved from a private server configuration provider. Missing, malformed, stale, or wrong-environment configuration denies access.

No concrete email address or UUID may be copied into this document, Git, CI evidence, screenshots, logs, artifacts, PR text, or client bundles.

## Preconditions for a separately authorized activation

1. The exact candidate commit, tree, shared artifact, source set, and domain heads match the CTO-approved seal.
2. All required GitHub checks are green and the PII/secret scan reports zero findings.
3. The two expected server-side identifiers are injected through the approved private secret mechanism without being displayed or logged.
4. Default state remains OFF and the global kill switch remains ENGAGED while configuration is validated.
5. Learning, writeback, ranking influence, and shadow traffic remain OFF.
6. A named operator and rollback operator are present. Any identity mismatch, count other than two, missing configuration, or unexpected output is a stop condition.

## Atomic enable sequence

The following sequence may be performed only under a new explicit Production authorization:

1. Verify the sealed release identity without querying or printing account records.
2. Install the private allowlist value atomically and validate only its schema, environment binding, member count, and one-way configuration hash.
3. Keep the kill switch ENGAGED and verify that both permitted and denied requests still fail closed.
4. Enable the runtime flag for the sealed release only.
5. Disengage the kill switch in one atomic control-plane change.
6. Execute the bounded smoke checks below. Do not enable learning, writeback, ranking influence, shadow traffic, OTA, or any unrelated release mechanism.

## Post-enable smoke

- Each permitted session can perform one bounded evaluation through the normal authenticated client path.
- A non-permitted authenticated session receives a generic denial.
- Session-subject mismatch, email spoofing, `user_metadata` spoofing, revoked membership, missing configuration, wrong environment, and restart all deny access.
- World read, minimized User projection, Decision evaluation, result display, alternative, and situational reject complete without durable writes.
- Admin Authoring remains available independently.
- Logs contain only approved opaque request and release hashes; no email, UUID, raw query, token, or allowlist content.

## Immediate rollback

1. Engage the global kill switch.
2. Set the runtime flag to OFF.
3. Confirm no later World reads, User projections, Decision evaluations, product outputs, learning writes, or writebacks occur.
4. Remove or rotate the private allowlist configuration only under the same separately authorized operational change.
5. Preserve sanitized control-plane counters and hashes; preserve no account identifier, token, email, or UUID.

Rollback is successful only when repeated allowed and denied test requests both fail closed and the emergency-OFF counters remain zero after the cutoff.

## Stop conditions

Stop immediately on identity or artifact drift, member count other than two, any PII/secret scan finding, client-supplied authority, open learning/writeback/ranking/shadow control, unbounded logs, an unexpected durable write, a request after Emergency-OFF, or any required Production action outside the separately approved activation scope.
