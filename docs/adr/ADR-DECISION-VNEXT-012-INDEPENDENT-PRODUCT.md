# ADR-DECISION-VNEXT-012: Decision Engine as an Independent Product

- Status: Accepted architecture; implementation candidate is YELLOW until exact World, User, and Decision follow-up candidates are sealed.
- Date: 2026-09-17
- Canonical base: `9c38946462c5698ee1ff6375d996463254dd829e`
- Production authority: none

## Decision

The Decision Engine is an independent, server-side Backyrd product. It exposes a stable, versioned API to thin Mobile, Desktop, and Web clients. A client may capture situational input and present results, alternatives, and contextual rejects. It must not own eligibility, retrieval, ranking, explanation semantics, World facts, User learning, release routing, allowlists, or activation.

The engine consumes three canonical ports: the World reader, the consent-bounded User projection, and server-authorized situational context. Every response binds the exact World, User, Decision, API-contract, and release identities that produced it. Unknown or mismatched versions fail closed.

The internal pipeline is modular. Candidate retrieval, deterministic eligibility, ranking, explanation, and presentation assembly can be replaced independently. New modules enter through dark or dual-run evaluation and cannot affect Product output until their exact candidate and artifact identities are approved. Backward-compatible changes are additive. Removing or changing an accepted field requires a separately versioned API and old-client recertification.

Routing is server-side and release-bound. Founder eligibility, global and Decision kill switches, rollback, and release selection cannot be overridden by Mobile, Admin, environment UI, deep link, or an undocumented client flag. Failure of vNext produces one complete response from the existing engine or an honest unavailable state; partial results from two engines are never mixed.

User Learning is a separate consent-bound product. Decision may consume a minimized projection through the User port. It cannot read raw evidence or write learning events as a side effect of recommendation delivery. Alternative and reject interactions remain contextual Product intents until a separately authorized User candidate defines consent, attribution, retention, and writeback.

## Founder phase

The existing non-public Mobile app is the only Founder live client. The existing Admin Dashboard remains the World-authoring client. No second app, demo navigation, or expert-only Founder product surface is introduced. Until exact World, User, and Decision follow-up candidates exist, Mobile remains sealed to the existing engine and the generated vNext stub is local-test-only.

## Security and privacy boundaries

- Mobile and browser code may use only a publishable or legacy public key with least-privilege grants and RLS.
- Secret and `service_role` keys remain server-only and are rejected by repository gates.
- A fresh authenticated user must match the active session before each Decision call.
- Authorization never relies on user-editable metadata.
- Observability contains request, release, binding, and result hashes, status, and latency only. Raw request text and personal data are excluded.
- Admin authoring remains authenticated, authorized, auditable, and separated from Decision activation.

## Consequences

This candidate can prove compatibility, fallback, UI behavior, authoring-to-reader flow, and release controls locally. It cannot claim a live vNext binding while any domain candidate is missing. Production remains NO-GO and `executionAuthorized:false`.
