# Week 2 CTO Review Checklist

The release candidate is eligible for CTO review only when the Integration Draft PR is fully green and still unmerged.

- Canonical base equals `f999e2185d9102ea59a2c6e2c0861a4122af359b`.
- World, User, and Decision PR/head/tree identities are exact and immutable.
- The dependency chain binds only declared ports and contains no Integration-owned domain semantics.
- All flags default false; missing/unknown is OFF; global and domain kill switches default engaged.
- OFF produces zero queries, ingestion, evaluation, writes, network calls, persistence, and Product output.
- Controlled Test-ON is synthetic, local/prod-like local, read-only, non-persistent, and invisible to Product.
- The combined four-track tree is conflict-free and every overlap has an owner.
- One shared Node 20 artifact is verified by all four tracks.
- Exactly nine pending migrations are classified `WORLD_INHERITED`; functions are empty; auth deployment is false; `executionAuthorized` is false.
- PostgreSQL 17, explicit grants/RLS, protected auth/realtime/storage schemas, unpinned extension versions, and no `logs.all` dependency are verified.
- Every risk-selected gate, local full suite, and GitHub Risk Gate passes.
- Release train, rollback, incident, kill-switch, and recovery evidence is complete.
- No merge or Production action occurred.

Technical candidate GREEN means “ready for a later explicitly authorized merge train,” not release-train GREEN and not ready for Production activation. The release train stays YELLOW while the domain PRs are not canonically merged or Production execution lacks separate authorization. Any unresolved identity, authority, compatibility, privacy, or safety issue is NO-GO.
