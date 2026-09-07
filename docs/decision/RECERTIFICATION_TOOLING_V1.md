# Recertification Tooling V1

This contract creates additive evidence for a changed Product tree while preserving the already certified Decision, Production, D2 and D3 identities. It does not certify Decision-source, database, authentication, security or Production changes.

The trust steps are separate:

1. `generate` reads explicit Git objects and emits an unsigned, neutral candidate-evidence artifact. It grants no status.
2. `verify` independently resolves the trusted base, recomputes every Git tree/file hash, validates the parent chain and scope, and emits a receipt only on success.
3. `apply` re-verifies the artifact and requires the exact receipt before writing only additive recertification, freeze and lineage records. Repeating the same apply is safe; conflicting output fails closed.

Example:

```sh
node decision-lab/src/recertification-cli.mjs generate --base v44 --base-sha <canonical-main-sha> --candidate <candidate-sha> --scope presentation --evidence <comma-separated-paths> --out /tmp/candidate.json
node decision-lab/src/recertification-cli.mjs verify /tmp/candidate.json --trusted-base <canonical-main-sha> --receipt /tmp/receipt.json
node decision-lab/src/recertification-cli.mjs apply /tmp/candidate.json --trusted-base <canonical-main-sha> --receipt /tmp/receipt.json
```

`--trusted-base` is deliberately supplied to the verifier and applier, not trusted from generator output. Candidate and base must be commits, the base must be the candidate's ancestor, and all evidence must exist in the candidate tree. Artifacts contain no credentials, environment values or network-derived state.

Scope policy is fail-closed. `evidence-only` admits only Decision evidence/config/tests/docs/scripts. `presentation` additionally admits Mobile, Web and Admin presentation files. Protected Decision source, Supabase functions/migrations/Production state, Auth/Security paths, unknown roots and any D2/D3 parent or Production identity drift are rejected. A Decision-source change requires the separate full semantic certification process.
