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
  **11 ordered pending migrations** (nine inherited World migrations, one
  Founder idempotency migration, one Product runtime migration), deployment
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
  and contextual reject. Client order has no ranking authority.
- `supabase/migrations/20260918182831_decision_vnext_product_runtime_v1.sql`
  is unshipped according to that committed ledger. Product control is
  generation zero / OFF and exposes no ON RPC. The repo authority remains
  `runtimeActivated:false` and `productionExecutionAuthorized:false`.
- Admin has a World authoring surface, but its rebuild endpoint requires
  identical local Supabase endpoints, and the UI labels itself Founder test
  environment. Product reads current World projection pointers. No
  Production-capable Admin write → rebuild → Product-read path is established.

## Finite blockers

1. **B1 — Product activation authority (release-blocking).** There is no
   reviewed, auditable, least-privilege Product ON transition. Manual SQL
   edits or relaxing the kill switch are not substitutes. The OFF and
   Emergency-OFF properties remain intact. A separate reviewed forward
   mechanism and its positive/negative security tests must be approved before
   any live smoke can succeed.
2. **B2 — Production World authoring/rebuild (release-blocking).** The Admin
   World path is intentionally local-only. Establish a Production-safe,
   explicitly authorized rebuild of canonical World projections after an
   Admin/Owner write, then prove its current pointer reaches the Product
   reader. Do not remove the local-endpoint assertion as a shortcut.
3. **B3 — Actual deployed state and recovery point (release-blocking).** The
   committed ledger cannot prove today's remote migration ledger, Function
   source, secrets, backup/restore readiness, or installed OTA cohort. These
   are read-only/operational Production checks requiring a later exact-SHA
   release decision. Until then the source-aware plan is a proposal.
4. **B4 — Physical-device acceptance (release-blocking).** The local browser
   test proves the existing Expo UI against synthetic transport fixtures. It
   does not prove an installed iOS/Android binary, network conditions, or a
   deployed Admin-write-to-Mobile-read journey. The exact candidate must pass
   a controlled device smoke after the prior gates and before rollout.

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
**not** a claim that the Production Admin write/rebuild path passed. Ranking,
consent and learning authority are separately tested by the Decision and SQL
contract suites. No personal fixture data belongs in Git or CI output.

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
   reviewed B1/B2 closures, and approved manual Production window. Read-only
   remote inspection must confirm migration ledger, deployed Functions,
   runtime identity, and no unplanned Auth/secret drift. A mismatch stops.
2. **Recovery point.** Verify the latest database and media backup, restore
   procedure and operator, pre-deploy Function identity, current installed
   Mobile update identity, and Emergency-OFF access. Record those identities
   without exporting Production data into Git/CI evidence.
3. **Migrations, if pending.** The source-aware plan determines the exact
   additive, ordered set from the shipped ledger. Require a clean dry run and
   migration immutability/ACL/RLS checks. Apply only in the manual protected
   workflow after GO. No manual schema edit or down-migration. Stop on drift.
4. **Runtime delivery.** Verify the downloaded artifact hash and deploy only
   plan-listed Functions/configuration. Keep Product control OFF. Confirm the
   single `decision-v13` transport and absence of a decision-copy or Founder
   Product route. A failed verification means Emergency-OFF and no OTA.
5. **Controlled activation.** Only after B1/B2 closure and explicit
   activation approval, bind the exact release/artifact/source-set/generation
   and perform the reviewed ON transition. A missing or mismatched binding
   leaves OFF. This step is **not** executable from the current candidate.
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
be reviewed while B1–B4 remain explicit. No blocked gate may be marked green
from reused historical evidence or a synthetic browser fixture.
