# Week 2 Dark-Wiring Release Train

Status: **YELLOW while domain PRs are not canonically merged or Production execution is not separately authorized.** Technical candidate/preflight GREEN cannot promote the release-train status. This runbook grants no Production authority.

## Fixed order and ownership

The only permitted choreography is `WORLD → USER → DECISION → INTEGRATION`. WORLD owns the read port and facts, USER owns `RelevantUserProjection`, DECISION owns shadow evaluation, and INTEGRATION owns only identities, hashes, routing, evidence, and release coordination. Integration must never resolve domain semantics.

Each step must bind the exact PR, base, head, tree, domain artifact, plan hash, flags, kill switches, and domain validation. A changed head invalidates every later step and requires a fresh rehearsal from the fixed canonical base `f999e2185d9102ea59a2c6e2c0861a4122af359b`.

## Read-only rehearsal

1. Verify each candidate is a descendant of the fixed base and that its tree and declared contract identities match.
2. Run the four-track merge-tree rehearsal without updating any branch or PR.
3. Materialize the frozen Decision head in an isolated temporary worktree, verify its commit/tree, canonical lockfile and pinned build/contract blobs, build with Node 20 in offline mode, execute the exact evaluator blob, and require its complete deterministic JSON output to equal the Integration evidence.
4. Materialize only the resulting ephemeral four-track rehearsal commit in an isolated local worktree.
5. Build one Node 20 artifact from that combined tree and make every World/User/Decision/Integration shard verify the same artifact hash.
6. Run OFF first. It must produce zero queries, ingestion, evaluation, writes, network calls, persistence, and Product output.
7. Run controlled Test-ON only with versioned synthetic fixtures in local or prod-like local infrastructure. It may exercise declared ports, but writes, network calls, persistence, and Product output must remain zero.
8. Run Integration, Delivery, Database, Classifier, World/User/Decision fast and full suites, Shared/Web/Admin/Mobile, repository/secret checks, source-aware plan, `git diff --check`, and the complete local Risk Gate.
9. Push only the Integration branch and open exactly one Draft PR. Do not merge.

## Stop conditions

Stop and mark RED for any identity/tree mismatch, Decision evidence/output mismatch, evaluator path/blob or build-input substitution, cross-head replay, merge conflict, unowned overlap, missing/unknown flag, activation-order bypass, nonzero OFF counter, write/network/Product output, migration mutation, auth, realtime or storage schema mutation, extension-version pinning, `logs.all` dependency, unexpected function/auth deployment, required gate not selected, failed/skipped required test, or `executionAuthorized` other than `false`.

Mark YELLOW for a still-open domain candidate, an unexecuted final rehearsal, unresolved but non-conflicting overlap review, or pending CTO decision. Production not being authorized is expected and keeps the release train non-executable.

## Owners and evidence

- Domain owner: contract semantics, fixtures, domain tests, and kill switch.
- Integration owner: lineage, compatibility matrix, combined tree, shared artifact, gate routing, and Draft PR.
- CTO: final review, later merge-train authorization, and any acceptable-deviation decision.
- Founder/CTO: separate Production execution or activation authority.

Canonical evidence lives under `delivery/integration/week2-*`. Generated outputs must be reproducible from committed inputs; no credentials, Production data, or personal raw data may be stored.
