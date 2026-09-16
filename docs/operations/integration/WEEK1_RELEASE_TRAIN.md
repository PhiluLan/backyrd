# Week-1 Integration and Release Train

The machine authority for this process is `delivery/integration/`. This runbook does not authorize Production execution. Every saved plan and report must retain `executionAuthorized:false` until a separate Founder/CTO release action is approved.

## Daily train

1. Refresh `origin/main` read-only and record its SHA. Never integrate from a report's claimed base.
2. Run `npm run integration:preflight -- --base-sha <canonical-main-sha> --head-sha <candidate-sha>`. A stale base, invalid identity, migration mutation, unknown flag, or missing required gate stops the train.
3. Domain owners run their fast lanes in their own paths. Integration owns routing and evidence, not semantic approval.
4. Seal each accepted domain candidate's PR, base, head, tree and shared artifact hash in `backyrd.week1-integration-manifest@1.0`. All three candidates must reference one identical `backyrd-decision-ci-build-artifact-v1` artifact hash.
5. Merge order is World, User, Decision, then Integration final revalidation. After every merge, rebase or recreate later candidates from current canonical Main and rerun affected fast lanes.
6. The final full risk gate is mandatory. A fast-lane PASS cannot replace it.
7. The push-to-main risk gate is the mandatory post-merge gate. A failed, cancelled, skipped, or missing required result is RED and stops all release work.

## Fast lane and full gate

Fast lanes provide short feedback: World build/typecheck/tests and migration coverage; User build/typecheck/tests plus Phase-3D fast/UI tests; Decision `decision-ci:fast`; Integration classifier, manifest and preflight tests. CI then builds World, User and Decision once in `decision-preflight`, hashes sources, lockfile, runtime, test plan and outputs, uploads one immutable artifact, and makes every independent Decision shard verify it before use.

The final gate remains `.github/workflows/risk-gate.yml`: repository security always runs; risk-selected surface, shared, Decision, database and delivery-contract jobs run in parallel where independent; `risk-gate` fails closed on any missing selected result. The same workflow on the resulting Main SHA is the post-merge gate.

## Change classification

- Unknown paths and workflow/package routing changes select every product, shared, database, Decision and delivery gate.
- Forward migrations select database and delivery controls; mutation of an existing migration blocks.
- Edge Functions and deployment controls select delivery verification; Supabase deployment controls additionally select database verification.
- Shared World/User contracts select shared plus Decision consumer recertification. World reader-port or Decision semantic changes select Decision semantic recertification.
- Only files proven non-executable by path and extension (`docs/**/*.md`, root `README.md`, root `AGENTS.md`) may take the documentation-only path. Machine-readable JSON, workflows, manifests, operations evidence and scripts are never assumed to be documentation-only.

## Track status

GREEN means all required identities and gates pass at the recorded SHA. YELLOW means safe work may continue but an explicit dependency or release decision is pending. RED means stop: authority collision, identity mismatch, failed/missing gate, migration mutation, unexpected Production scope, flag default-on, or unauthorized execution.

The daily source of truth is `delivery/integration/daily-integration-report.json`; update reasons with machine evidence and never convert YELLOW/RED to GREEN from prose alone.
