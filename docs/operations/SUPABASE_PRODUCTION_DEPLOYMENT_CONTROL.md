# Supabase Production deployment control

## Source model

`delivery/production-state.json` records the last technically shipped Supabase source, migration tip and deployment run. It also records the exact Mobile OTA and separates technical shipment from Product acceptance. Review Media remained `productionVerified:false` and `OPEN_PAUSED` through the failed physical attempts. On 2026-09-09 the Founder explicitly passed both a normal Review and a Smart Review with visible Production media; the incident is therefore `CLOSED` and `productionVerified:true`. The historical partial test states remain preserved.

Candidate, Pending and Shipped are separate:

- Candidate is one immutable commit reachable from canonical Main. It may be the tip or an earlier unchanged Main ancestor.
- Pending is derived, never hand-selected: every migration, Auth config change and bound Edge Function source change from `supabase.shippedSourceSha..candidate`.
- Shipped is advanced only from a completed Production deployment audit. A later evidence or documentation commit does not erase earlier pending runtime work.

The source-aware planner rejects mutated migrations, unknown Production config, undeclared Edge sources, non-literal/unresolved dependencies, uncontracted function retirement and any mismatch between its plan and the remote dry-run output.

## CI and credentials

Ordinary pull requests never receive `SUPABASE_ACCESS_TOKEN` and never connect to Production. The risk gate proves candidate identity, migration immutability, isolated clean boot, SQL authorization behavior and deterministic plan contracts without privileged credentials.

The Production workflow runs on canonical Main pushes in plan-only mode. A controlled `workflow_dispatch` with an exact canonical Main candidate SHA and `DEPLOY_SUPABASE_PRODUCTION` performs the real read-only Production inspection and `supabase db push --dry-run`. The dry-run pending filenames must exactly equal the complete shipped-baseline plan before the protected Production job may execute.

The manual trigger is a technical release action. A Senior Engineer holding an unambiguous MODE-C delivery mandate may run it. Destructive data work, Trust-boundary relaxation, ledger repair, new credentials or provider/account changes remain separate STOP conditions.

## Runtime binding

Each enabled Edge Function is bound to its config block, entrypoint, transitively reachable local dependencies, import map and ambient Deno/npm files. Only changed bound functions deploy. Auth config is allowlisted and validates the fixed Production project, site/redirect scope and password floor.

The Production job pins the CLI, checks out the exact candidate, re-resolves canonical Main, rebuilds the plan from the shipped baseline, binds the candidate SHA and plan hash, and retains an immutable audit artifact. Feature branches cannot execute Production. Evidence-only candidates produce `NO_RUNTIME_DEPLOY` without inventing a release generation.

The legacy Supabase GitHub “Deploy to production” integration must remain disabled; two deployers would violate source identity.

## 2026-09-19 Product migration reconciliation

The Production migration ledger was observed read-only at 152 entries, ending
`20260919090423`, while `delivery/production-state.json` still records the older
139-migration shipped baseline. The previous 13 Product migrations were applied
under Founder authority, but no immutable apply-run receipt is available. Do not
describe the read-only ledger observation as an apply receipt or a restore drill.

`supabase/production/preapplied-product-migrations-v1.json` binds each of those
13 canonical files to its byte hash and observed remote statement count/hash.
The manual release plan treats only this exact, ordered prefix as pre-applied.
Immediately before any SQL apply, the linked Production ledger must still match
all 13 statement digests, 152 total entries and the expected tip. The CLI
dry-run must then show only the two World-Admin migrations from PR #319. Any
drift stops the train; no migration history repair or reapplication of the 13
is permitted. The 2026-09-19 off-provider backup run is evidence of a current
export, not proof that a restore would succeed; the Founder accepted the
remaining restore risk explicitly.

After an audited Production deployment, update the shipped baseline from the
actual deployment result in a separate evidence change. Do not advance it in
anticipation of deployment. World-Admin authoring is a separate default-OFF
control; Decision Product remains OFF until its own release gate passes.
