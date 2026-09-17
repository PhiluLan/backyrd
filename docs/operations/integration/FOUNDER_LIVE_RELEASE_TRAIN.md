# Founder-only Live Mobile + Admin release train

Canonical base: `9c38946462c5698ee1ff6375d996463254dd829e`. Current technical state: GREEN, with all three approved domain candidates bound in order. Production remains NO-GO and no Production execution is authorized.

Bound domain train: World/Admin PR #302 at `239d73ab1b7229414363dc4b2a66bd625e71b9aa`, User PR #301 at `418c9bd0b87289769346052e3b681bde0cd9ed86`, then Decision PR #303 at `8acd3f40e8938c77f2d9f3a3c8139e71970ceab5`. The only conflict resolutions were the two additive Week-3 CI files, resolved to the stricter User implementation. No domain semantics were changed.

| Order | Track | Required immutable input | Exit condition | Rollback boundary |
|---|---|---|---|---|
| 1 | World migrations | Exact World PR base/head/tree, contract and artifact | Forward-only migration rehearsal; RLS and grants pass; no unrelated schema | Do not apply; if later applied, use the separately approved World rollback plan |
| 2 | World Reader | Exact reader contract and source identity | Admin save/rebuild is visible through the canonical reader | Disable new reader release; preserve canonical old reader |
| 3 | User Projection | Exact minimized projection contract and artifact | Consent, freshness, deletion, no raw evidence, no implicit writeback | Engage User kill switch and use neutral/missing projection |
| 4 | Decision API | Exact API contract, Decision head/tree and artifact | Old-client compatibility, deterministic eligibility, dark/dual-run and honest fallback | Engage Decision kill switch and route complete requests to existing engine |
| 5 | Mobile and Administration | Exact app/admin source tree and shared artifact | Real builds; small/large viewport checks; Admin-to-Mobile E2E | Keep existing Mobile engine and existing Admin authoring path |
| 6 | Founder allowlist | Server-side, pseudonymous, expiring authority | Exact Founder subject and release binding; missing/forged authority denied | Empty allowlist; no client override |
| 7 | Kill switches and rollback | Global, World, User and Decision controls | OFF and mid-flight Emergency-OFF rehearsed; no mixed output | All switches engaged; existing engine or honest unavailable state |
| 8 | Post-deploy verification | Exact released Main/tree/artifact | Health, identity, no-write and Product-output evidence for the released hashes | Stop; no recovery release without root cause and new authority |

Every phase is an evidence gate, not permission to execute the next Production action. Production commands remain in the separate runbook and require new explicit authority.
