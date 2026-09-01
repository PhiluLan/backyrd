# Supabase Production deployment control

Production deploys originate only from a `push` to canonical `main`. Pull requests execute the same fail-closed planner but cannot deploy. The workflow has no manual or feature-branch trigger.

Same-repository pull requests additionally authenticate read-only against the fixed Production project, verify the active JWT-protected Decision Function, and execute a real remote migration dry run. This proves the Production credential and database connection before the legacy integration is disabled without permitting a pull request to mutate Production.

Each enabled Edge Function is bound to its configured entrypoint, every transitively reachable repository-local static or literal dynamic import, its import map and ambient Deno/npm configuration, and its complete `[functions.<slug>]` block including `verify_jwt`. The deterministic source-set hash is compared between the exact before and canonical-main SHAs. A changed bound scope deploys only the affected functions. A non-literal dynamic import, unresolved or ambiguous local dependency, undeclared changed Edge source, unsupported static-file scope, ambiguous global Supabase configuration change, or function retirement blocks the deployment plan.

Migration planning permits only newly added, timestamped forward migrations. Production first performs a remote dry run and requires its pending filenames to equal the canonical plan exactly before applying them. Published migration mutation or deletion blocks.

The Production job pins Supabase CLI `2.98.2`, asserts `refs/heads/main`, binds the GitHub event SHA and Production project `hjgcrrzfjchzqoegcywn`, and records the plan hash, source-set hashes, migration hashes, before/after function versions, `verify_jwt`, bundle hashes and final audit hash. Identity, evidence and documentation changes produce an explicit `NO_RUNTIME_DEPLOY` result.

The legacy Supabase GitHub “Deploy to production” integration must remain disabled after this workflow becomes authoritative. Re-enabling both deployment paths would violate the single-deployer invariant and can produce an unbound Function version.
