# ADR-005: Founder Live uses a portable server handler behind the existing hosting boundary

## Decision

Implement the Founder Live API contract and orchestration as a runtime-portable `Request -> Response` handler in `@backyrd/decision-vnext-core`. Keep the existing authenticated Supabase Edge/server boundary as the intended host, but do not create or modify an Edge Function in this release candidate.

## Why

The repository already has an internal authenticated Edge boundary, but it belongs to the active/legacy runtime and directly constructs Supabase repositories. Reusing that implementation would couple vNext to database tables and legacy orchestration. Creating a standalone demo server would establish a competing Product path. A thin future host adapter can supply authentication, authority, limits, idempotency, the canonical World reader, and the canonical User Projection port without duplicating Decision semantics.

## Consequences

- Client data cannot select identities, releases, policies, ports, rollout, or ranking.
- World/User/Context remain separate and runtime validated.
- The package is locally and prod-like HTTP testable without credentials or Production access.
- Deployment is intentionally impossible until a separately reviewed host adapter and Production authority exist.
- Idempotency is a required injected port; this release authorizes no durable store.
- Normal and expert responses are separate authorization paths.
- Candidate evaluation is injected through a versioned evaluator port; controlled dual-run is local/prod-like only and is not an HTTP capability.
- Request timeout aborts the execution capability, preventing post-timeout continuation into later stages.

## Rejected

- Extending `decision-v13`: violates independent vNext architecture.
- Direct Supabase/table adapter: violates canonical World/User ports.
- New demo web server: creates a second runtime truth.
- Client-driven environment or activation switch: violates server authority.
