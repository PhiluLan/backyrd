# Decision vNext Product v1 — release candidate and execution runbook

Status: **DRAFT / PRODUCTION NO-GO**. This is a source-only plan; it authorizes no
Production query, migration, credential or secret read/change, deployment,
Function delivery, runtime activation, OTA, or traffic.

## Authority and observed state

- Canonical starting Main: `ef06ef1b776a6948d5e8f13d0923d99ed9cb860c`.
  PR #314 is merged. Its post-merge Product manifest v3 hash is
  `fed8e4373809870973cfa4b8ccbfe12fe3440d4dbc9b11a6f868769b461845ea`.
- The *committed* Production ledger in `delivery/production-state.json`
  identifies shipped Supabase source `d63c5ae66aa30aa017cc54c2ed8be47944b84889`
  (migration tip `20260909073004_close_review_capture_trust_v2`, 139 migrations)
  and shipped Mobile source `4810711a663efc75dbb03450b7864c277b7f0fb8`
  (runtime 1.1.0, Production channel). This is repository evidence, **not**
  a live Production observation. No live Production state was queried.
- The source-aware plan computed against that shipped source proposes exactly
  **12 ordered pending migrations** (nine inherited World migrations, one
  Founder idempotency migration, one Product runtime migration, one additive
  Product activation/authoring migration), deployment
  of `decision-v13`, retirement of `decision-copy`, no Auth configuration
  deployment, and `executionAuthorized:false`. This is not evidence that the
  remote migration ledger still matches the committed baseline.
- The installed Product client calls only `decision-v13`; its deploy entrypoint
  imports only `vnext-only.ts`. Invalid or unavailable responses show an
  unavailable state; there is no Legacy fallback.
- The server owns interpretation, canonical World candidate retrieval,
  consent-bound User projection, hard constraints, versioned ranking, and
  Product learning. The client shows only the server-selected primary and
  carries the identities of *actually presented* candidates on alternative
  and contextual reject. Client order has no ranking authority. Unproven hard
  constraints cannot enter ranking. Product World ignores an unexpiring SQL
  `state.current=OPEN` assertion because its expiry is not in the resolver
  projection; explicit CLOSED remains suppressive until an authorized rebuild.
- `supabase/migrations/20260918182831_decision_vnext_product_runtime_v1.sql`
  remains unshipped according to that ledger. The new forward migration adds
  a postgres-only, 1-minute to 24-hour ON lease with exact release/artifact/
  source-set/generation binding. Applying migrations alone leaves Product
  generation zero / OFF. The repo authority remains `runtimeActivated:false`
  and `productionExecutionAuthorized:false`.
- Admin and Owner now use Product-scoped claim RPCs backed by the existing
  append-only v3 writer and an actor-bound,
  service-only Product rebuild of approved spots. The local SQL rehearsal
  proved an actual REAL-spot correction through the canonical pointer and
  Product context into the Decision evaluator. This is **local evidence**, not
  a deployed Admin or Mobile journey.

## Finite blockers

1. **B1 — Activation authority: locally implemented, externally pending.**
   The additive migration leaves OFF by default. A postgres-only, versioned,
   expiring CAS lease binds release, artifact, source set and generation; a
   missing/expired/mismatched lease is OFF. The existing Emergency-OFF is
   serialized with Product authority checks, and the server checks control
   before and after each asynchronous boundary. No Founder UUID allowlist is
   used. Production activation still needs the later explicit release GO.
2. **B2 — World authoring/rebuild: locally proven, deployed path pending.**
   Admin/Owner Product claim writes remain append-only and are gated by Product
   ON even if the historical Founder-local test GUC is set;
   the service-only rebuild requires the exact authorized actor and approved
   spot, then calls the canonical World resolver. The SQL Product context
   validates the current manifest and returns its minimized Decision projection.
   A real local SQL→TypeScript evaluator rehearsal confirms the corrected
   spot name reaches Product. The deployed Admin/Owner→installed Mobile path
   remains a release smoke, not a CI claim.
3. **B3 — Actual deployed state and recovery point (release-blocking).** The
   committed ledger cannot prove today's remote migration ledger, Function
   source, secrets, backup/restore readiness, or installed OTA cohort. These
   are read-only/operational Production checks requiring a later exact-SHA
   release decision. Until then the source-aware plan is a proposal.
4. **B4 — Physical-device acceptance (release-blocking).** The local browser
   test proves the existing Expo UI against synthetic transport fixtures. It
   does not prove an installed iOS/Android binary, network conditions, or a
   deployed Admin-write-to-Mobile-read journey. The exact candidate must pass
   a controlled device smoke after the prior gates and before rollout. The
   locally visible iPhone 16 was `unavailable` to Xcode device control on
   2026-09-19; no installed-device acceptance or OTA was performed.

Resolved in this candidate: Mobile alternative/reject previously marked every
ranked spot as shown. It now shows and logs only the server-selected primary,
passes only presented identities, and displays no legacy fallback. The former
`product-release:e2e` synthetic HTML demo was replaced with a browser
journey through the existing exported Expo app.

## Evidence scope

The Product browser suite exercises the real Expo login form, authenticated
Decision tab, request, visible primary and reason, alternative, contextual
reject, consent-state response, reload, revised World-reader *fixture*, and
unavailable response. Supabase requests are intercepted with synthetic data
and no external network call. Its World version change is a transport fixture,
**not** a claim that the Production Admin write/rebuild path passed. A separate
isolated PostgreSQL clean boot applies all candidate migrations and runs the
real Admin claim → REAL-spot rebuild → canonical pointer → Product SQL context
→ TypeScript evaluator test transactionally. It also checks OFF, unrelated
actor denial and Emergency-OFF. Ranking, consent and learning authority remain
separately tested by Decision and User contracts. No personal fixture data
belongs in Git or CI output.

The final CI release artifact must be built once under Node 20 in
`PR_CANDIDATE` mode. Its manifest v3 binds exact source commit/tree,
World/User/Decision components, source set, tests, Mobile export, migration
set, and Production plan. A later merged Main needs its own
`POST_MERGE_MAIN` manifest with exact merge parents and candidate-tree parity;
the PR artifact is never replayed across identity modes. The manual release
must download and verify that certified artifact, never rebuild an unbound
replacement.

## Future execution order — contingent on a separate exact release GO

1. **Preflight.** Name the exact canonical Main SHA/tree and
   `POST_MERGE_MAIN` manifest hash. Require fresh recertification, all
   classifier-selected gates, valid artifact/source-set/plan verification,
   reviewed B1/B2 closures, and approved manual Production window. Run the
   source-aware preflight with a protected, read-only remote observation bound
   to the exact Main/manifest/plan. It must compare the shipped 139-version
   baseline, deployed Function source, installed Mobile source/runtime/OTA,
   and Recovery Point. No observation means `NO_GO_REMOTE_NOT_QUERIED`; a
   mismatch stops. Secret/Auth drift remains a protected manual check.
2. **Recovery point.** Verify the latest database and media backup, restore
   procedure and operator, pre-deploy Function identity, current installed
   Mobile update identity, and Emergency-OFF access. Record those identities
   without exporting Production data into Git/CI evidence.
3. **Migrations, if pending.** The source-aware plan determines the exact
   additive, ordered **12-migration** set from the shipped ledger. Require a clean dry run and
   migration immutability/ACL/RLS checks. Apply only in the manual protected
   workflow after GO. No manual schema edit or down-migration. Stop on drift.
4. **Runtime delivery.** Verify the downloaded artifact hash and deploy only
   plan-listed Functions/configuration. Keep Product control OFF. Confirm the
   single `decision-v13` transport and absence of a decision-copy or Founder
   Product route. A failed verification means Emergency-OFF and no OTA.
5. **Controlled activation.** Only after the exact separate Production GO,
   preflight and OFF-mode server checks, the protected postgres release operator records
   the approved authority hash and calls the ON CAS transition with the exact
   release/artifact/source-set/generation and a bounded expiry (at most 24h).
   Confirm the Product control RPC returns ON for that exact identity. Missing,
   expired or conflicting authority leaves OFF; renewal requires OFF then a
   fresh approved transition. This step is **not authorized here**.
6. **Mobile OTA.** Only after server smoke and a second exact artifact check,
   deliver the approved JS update to runtime 1.1.0 / Production channel.
   This candidate changes no native dependency, Expo plugin, app config,
   entitlement, or runtime version: **no new native binary is expected**.
   Validate against the accepted installed build before expanding a cohort.
7. **Smoke and monitor.** With explicitly approved synthetic accounts and
   spots, verify login, request, reasons, alternative, reject, consent grant
   and withdrawal, neutral/no-write without consent, reload, Admin write →
   rebuild → Mobile read, rate limit, idempotency, and no fallback. Monitor
   5xx/timeouts, latency, eligible/empty ratios, consent-bound writes,
   unexpected data access, and rollback triggers. Do not infer success from
   a CI fixture.
8. **Emergency-OFF and rollback.** On auth, privacy, World/User drift,
   elevated errors, unexpected writes, or Product mismatch, engage
   Emergency-OFF first and verify no later World/User reads, evaluations,
   learning writes or Product outputs. Stop OTA rollout or republish the
   exact prior compatible update if authorized. Restore prior Function bytes
   only via the protected workflow; database recovery is restore/forward-fix,
   never destructive ad-hoc rollback. Reopen only after a root-cause review
   and full affected-gate revalidation.

Current decision: **NO-GO for Production execution and OTA**. The Draft PR may
be reviewed with B1/B2 locally implemented and B3/B4 external. No blocked gate may be marked green
from reused historical evidence or a synthetic browser fixture.
