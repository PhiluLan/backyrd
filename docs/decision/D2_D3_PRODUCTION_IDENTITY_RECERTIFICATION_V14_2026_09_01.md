# Decision v13 Production identity re-certification v14

Date: 2026-09-01  
Authorization: Founder/CTO — Supabase Production Deployment Control acceptance

## Finding

Production `decision-v13` version 123 is the current deployed Decision runtime. Its Management API artifact is ESZIP 2.3 with body SHA-256 `397273eb242367acc34031ff05cbd91501e03328c98cf2341283c195feb34e58` and bundle hash `edbccf870a30c850cde97c59444b9a2f8d6e9d212dda257a86adb1fbf4fc088a`.

The official pinned `@deno/eszip` parser verified all 40 deployed Decision modules. Every deployed module is byte-identical to the source manifest generated from canonical main `024d40cb021f787e8eaf95ce69a3a0d9052e39bf`; there are no missing, unexpected, or mismatched Decision sources. The deploy entrypoint is exactly `import "./live-index.ts";`, SHA-256 `4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299`.

The complete machine-readable proof is stored in `docs/decision/evidence/decision-v13-production-v123-eszip-verification.json`. Its evidence hash is `7f8821b029da7e4c0930fdbdd8380bf3c1bb7f8a1c62544304616f6eb8d7ee72`. The deployable source-set hash is `79be8bac72b30b7a60b4396c3d3dd63ce8d2b2bc98b190cab356cb7f54e4c03b`; the function configuration hash, including `verify_jwt = true`, is `56771eeee30d34f03eaab5a52b161d39d3a2d18e7982343623514e1fade112eb`.

The earlier v122 identity remains preserved in v13 as forensic history. It is no longer the active Production identity and must not be treated as current.

## Deployment-control proof

PR #174 introduced the repository-owned, fail-closed Supabase Production workflow. PR #175 retained its visible audit artifact. Both were normally merged from review into canonical `main`. Their canonical-main executions classified the changes as `NO_RUNTIME_DEPLOY`; the active Production Decision version remained v123 across both merges. The previous blanket Supabase Production deployment toggle was disabled only after the replacement workflow had passed its source-graph, migration, identity-only, documentation-only, configuration, and unknown-dependency regressions.

The workflow binds every configured Edge Function entrypoint, literal transitive local imports, ambient Deno/import-map configuration, function configuration and `verify_jwt`. Unknown or ambiguous dependency state blocks deployment. Migration mutation or deletion blocks; only exact pending forward migrations may apply. Each execution emits an audit bound to canonical main SHA, plan hash, source-set hash, configuration hash, deployed versions and bundle identity.

## Semantic conclusion

Decision Engine source and protected semantic source-set hashes are unchanged. This re-certification changes no ranking, Mood, Offering/Purpose, Taste, Trust, N4, eligibility, reason, location, price, time, fallback, or continuation semantics. It authorizes only the proven v123 Production identity and the fail-closed deployment-control evidence.

`DECISION SEMANTICS CHANGED — NO`  
`SCOPE GUARD WEAKENED — NO`  
`PRODUCTION IDENTITY — PROVEN`
