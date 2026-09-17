# World Knowledge Week 2 — World Basis and Dark Reader

This slice prepares the canonical World foundation for a later internal allowlist. It does not authorize Production inspection, migration, runtime activation, Decision wiring, User wiring, deployment, or automatic Founder confirmation.

## Canonical boundary

- Base: `f999e2185d9102ea59a2c6e2c0861a4122af359b`
- Pending World migrations: exactly nine, unchanged from Week 1
- Registry: `backyrd.world-knowledge.registry@2.1`
- Reader: `backyrd.world-knowledge.dark-reader@1.0` through `WorldKnowledgeReaderPort`
- `WORLD_PRODUCT_READ`: absent/unknown/`false` means OFF
- `WORLD_PRODUCT_READ_KILL_SWITCH`: absent/unknown means `ENGAGED`
- Enabled environments: `LOCAL_TEST` and `PROD_LIKE_TEST` only
- Production execution: `false`

The reader receives its loader by server-side dependency injection. When OFF it rejects before invoking the loader, so it creates no connection, query, write, or other side effect. Test-ON supplies only a read-only request bound to Registry 2.1 and the accepted Source Policy, and parses the returned canonical snapshot including its hash. The adapter imports no Decision or User contract and supplies no ranking, intent, eligibility, or taste semantics.

## Supabase compatibility audit

The source audit and disposable rehearsal use PostgreSQL 17. The nine migrations are hash-bound and ordered. The audit fails closed on destructive DDL, DDL against `auth`, `realtime`, or `storage`, an explicit extension version, a `logs.all` dependency, embedded secret names, or a `SECURITY DEFINER` without an empty `search_path`.

The audit follows the current Supabase boundaries reviewed on 2026-09-16:

- Data API exposure requires an explicit grant; RLS remains a separate row boundary.
- `UPDATE` authority requires both `USING` and `WITH CHECK` plus ownership/scope predicates.
- views must be `security_invoker` or inaccessible to client roles.
- `SECURITY DEFINER` is exceptional, uses `search_path=''`, fully qualified relations, and explicit execute revokes/grants.
- `service_role` is server-only; no secret is accepted by the reader.
- the locked `realtime` schema is not mutated.
- extension versions are not pinned.
- no workflow relies on the removed Management API `logs.all` endpoint.

## Thirty-candidate basis

`world-basis-cohort.aggregate.json` is derived from the existing Week-1 30-candidate Basel set. It contains no Spot identifiers, names, contacts, Actor identifiers, or Actor pseudonyms. It keeps the source candidate hash and aggregate coverage only. It creates no Claims, Verifications, Founder confirmations, Cohort memberships, projections, or Decision input.

The minimized Week-1 source proves field presence, legacy-prefill status and review requirements, but not per-value resolution. Therefore `CONFIRMED`, `UNKNOWN`, `NOT_CONFIGURED`, `NOT_APPLICABLE`, and `DISPUTED` are explicit, disjoint state slots with `null` counts instead of invented classifications. The gaps are concrete counts; absence is never converted to false.

## Real gaps

- primary visit purpose, visit situation, atmosphere, and typical daypart are documented for only 5/30 candidates;
- on-site offerings are documented for 4/30;
- accessibility is absent for 28/30;
- age access is absent for 30/30;
- price level has 29 review-required legacy values;
- category is present as candidate-selection metadata, but the minimized source does not prove a canonical Claim;
- a budget-boundary Product contract is not configured and is not inferred from price level.

## Deferred Product decisions

- authoritative per-fact Source/Verification policy for a future Production reader;
- budget-boundary semantics separate from the five-level price fact;
- internal allowlist authority and operator workflow;
- actual state reconstruction for the 30 candidates from an authorized snapshot source;
- Capability→Intent mappings, ranking, eligibility, and Unknown policy;
- Production apply, backfill, activation, monitoring, rollback authority, and retention periods.
