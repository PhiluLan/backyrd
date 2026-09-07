# Recertification Tooling V1.3 — explicit verification modes

V1.3 separates candidate verification from active-chain consumption. Neither
mode writes or rewrites `origin/main`; both resolve the fetched
`refs/remotes/origin/main` object as the canonical trust boundary.

## Pre-merge candidate verification

`verify-candidate` verifies an unsigned artifact for one exact pull-request
head against one exact pull-request base:

```sh
node decision-lab/src/recertification-cli.mjs verify-candidate /tmp/candidate.json \
  --pr-base <canonical-pr-base-sha> \
  --pr-head <exact-pr-head-sha> \
  --receipt /tmp/receipt.json
```

The PR base must be present on the first-parent history of the fetched
canonical main. The artifact's `baseMainSha` and `candidateSha` must equal the
explicit PR base and PR head. The candidate must not already be reachable from
canonical main. Existing artifact, scope, repository diff, protected-source,
Decision Engine, Production identity, evidence and D2/D3-parent checks remain
fail-closed. This mode produces a receipt; it never declares the candidate
active.

`apply` accepts only that independently verified pre-merge receipt and still
requires the exact candidate commit to be checked out:

```sh
node decision-lab/src/recertification-cli.mjs apply /tmp/candidate.json \
  --pr-base <canonical-pr-base-sha> \
  --receipt /tmp/receipt.json
```

## Post-merge active-chain consumption

`consume-active` reads the freeze, records and lineage exclusively from the
fetched canonical-main commit, never from a PR working tree:

```sh
node decision-lab/src/recertification-cli.mjs consume-active \
  --canonical-main <exact-origin-main-tip> \
  --candidate <merged-candidate-sha>
```

When supplied, `--canonical-main` must equal the fetched `origin/main` tip.
When supplied, `--candidate` must be reachable from that canonical tip and must
occur as a candidate in the validated active lineage. Every active record is recursively validated to v44, including its original receipt,
base, candidate, first-parent base ancestry, lineage, hashes, Production
identity, protected sources, Decision Engine, Production entrypoint and D2/D3
parents. A pre-merge candidate therefore remains ineligible for active
consumption. Normal merge integration makes the same candidate eligible without
relabeling any local ref.

Unknown versions, skipped parents, forks, replayed lineage entries, tampering,
drift and unreadable Git objects remain failures. V1.3 changes no Decision,
Product, Supabase, runtime or Production semantics and does not alter historical
chain records.
