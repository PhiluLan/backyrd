# Go-Live Gate 1 — Repository and Shipped Product Lineage

Audit date: 2026-08-28  
Repository: `PhiluLan/backyrd`  
Canonical integration branch: `codex/go-live-gate-1-canonical-head`  
Integration anchor: `c425ad1d61186e6d73ed2df1f9686780dcbf0e24`

## Executive verdict

`origin/main` is not the source tree from which the current shipped Product can be reconstructed. It is an ancestor of all relevant shipped lines, but it is 98 commits behind the conflict-free integration anchor and lacks the current Mobile, Consumer Web, backend/migration, and Gate-1 histories.

The shipped lines have now been joined on a separate integration branch. `origin/main` was not changed. Until the reviewed integration reaches the canonical default branch, the requested verdict remains:

**CANONICAL MAIN/HEAD REPRESENTS CURRENT PRODUCTION PRODUCT — FAIL.**

The candidate integration HEAD does represent every proven shipped line; the final branch-tip SHA is reported after validation because documentation/CI commits follow the merge anchor.

## Production Mobile

The EAS `production` channel points to update group `cfda09d4-c6eb-41e2-a57c-01888117e766`, created 2026-08-27 20:58:24Z for runtime `1.1.0` on both Android and iOS:

- Android update `01a04504-4b86-7031-95b9-5a1dadce10aa`
- iOS update `01a04504-4b86-7699-8404-32e9357d259b`
- Git commit `0414bd950ce2450be359352862189904b604f531`
- `mobile/` tree `ba37a044b96dd61b1dd38def9979dad1f2138f7f`

The Consumer-Web closure has the identical `mobile/` tree and makes no later Mobile change. The active Android worktree's committed base is also exactly `0414bd9`; its two local release-configuration modifications are uncommitted and were not read as shipped truth, modified, staged, or merged.

The latest native EAS store build is iOS build 50 from `5127a865ec0f249ab803caa8689a709be018a77c`, runtime `1.1.0`; the current Product JavaScript delivered to compatible native clients is the later Sprint-7 production OTA above. No Android store build is present in the queried EAS production build inventory; Android's proven shipped state here is the production OTA update.

## Production Consumer Web

The latest successful GitHub/Vercel Production deployment for `backyrd-web` is deployment `6146634581`:

- Git commit `925b69eb346a9cc4f83a8c3ea9358d50599667a8`
- `web/` tree `bff6828dea506138cd8789fb62171beb6052a72c`
- deployed 2026-08-28 18:40:07Z
- deployment state `success`

This commit is five commits after Mobile Sprint 7 and changes Consumer Web, root lockfile, and CI only. It is the direct head of the shipped Mobile/Consumer lineage.

## Production Admin / Intelligence Web

The latest successful Production deployment for `backyrd-intelligence` is GitHub/Vercel deployment `6089068443`:

- Git commit `c0b3e0e30b5f29ca518c5bbecb5701dffdcaec92`
- deployed 2026-08-25 18:01:26Z
- deployment state `success`

That commit is already an ancestor of the Gate-1 integration. Later Admin work exists in the backend line and PR #105, but PR #105 head `d8ecd866` is not deployed and is intentionally excluded.

## Production backend and migrations

- Supabase project: `hjgcrrzfjchzqoegcywn`
- PostgreSQL major: 17
- Production migration entries: 90
- Production/local aligned tip: `20260828192125_gate1_schema_convergence_v1`
- Tip source commit: `eae5abcb7c43e80017d8d0dc948d0caa490dfaa1`
- Active Edge Functions inventoried: 24, with deployed versions and bundle hashes frozen in `PRODUCTION_PRODUCT_LINEAGE.json`.

The Gate-1 integration contains the research-agent lineage (`a6cd794`), Decision/learning line, human intelligence/offering line, exact Production-applied migrations, Sprint-7 public-image Edge sources, and Gate-1 forward migration. It does not claim that every newer repository Edge source has already been redeployed; the manifest records the deployed function bundle identities separately from source HEAD.

## What `origin/main` lacks

`origin/main` is `b274084d12152d52c9f7f253dab71adad0d70c35`. Relative to the integration anchor it is behind by 98 commits and has no unique commit.

| Area | `origin/main` | Shipped/canonical integration | Missing state |
|---|---|---|---|
| Mobile tree | `1b7809e450fd…` | `ba37a044b96d…` | complete Production rebuild plus design Sprints 1–7 |
| Consumer Web tree | `456d2cd30ce3…` | `bff6828dea50…` | deployed Consumer Product closure |
| Database migrations | 54, tip `20260821233000` | 90, tip `20260828192125` | 36 Production migrations |
| Backend/runtime | older Decision/research/user-intelligence sources | Gate-1 integration | deployed and post-deploy canonical source lineages |
| Admin source | older Admin tree | Gate-1 backend tree | later canonical backend-line Admin changes; PR #105 still excluded |
| Production lineage evidence | absent | manifest + CI guard + report | no durable deployment-to-commit map |

The full path delta is 452 files: Mobile 169, Web 99, Supabase 65, packages 43, docs 31, Admin 20, scripts 17, Decision Lab 4, workflows 2, plus root lock/ignore files.

## Unmerged branches containing canonical work

| Branch | Role | Relationship/status |
|---|---|---|
| `origin/codex/mobile-design-closure-sprint-7` (`0414bd9`) | shipped Mobile | ancestor of Consumer Web and integration |
| `origin/codex/consumer-web-complete-product-closure` (`925b69e`) | shipped Consumer Web + same Mobile tree | second parent of integration anchor |
| `origin/codex/kultbaeckerei-save-contract-fix` (`93478bc`) | canonical backend/migration line before Gate 1 | ancestor of Gate-1 parent |
| `origin/codex/go-live-gate-1` (`9896c7c`) | Gate-1 DB convergence/evidence | first parent of integration anchor |
| `origin/codex/research-agent-async-reliability` (`a6cd794`) | deployed research function lineage | already ancestor of backend/Gate line |
| `origin/codex/admin-dashboard-complete-closure` (`d8ecd86`) | unshipped Admin PR #105 | not part of current Production; excluded |
| `codex/android-complete-product-parity` | active Android worktree | committed base equals Sprint 7; local changes preserved and excluded |

## Divergence and conflicts

Mobile and backend diverged after common commit `da7f571b5d0ac230e5bebbcaac1d09bf6e8c9d86`:

- Mobile Sprint 7 vs Gate 1: 25 Mobile-side commits and 23 Gate/backend-side commits.
- Consumer Web vs Gate 1: 30 Consumer/Mobile-side commits and 23 Gate/backend-side commits.
- Gate 1 vs Admin PR #105: two Gate commits versus one Admin commit after `93478bc`.

Git's three-way merge of Gate 1 and Consumer Web completed with zero textual conflicts. The resulting tree contains exactly the shipped Mobile tree, exactly the shipped Consumer-Web tree, the Gate Admin tree, and a combined Supabase tree with both Gate-1 migrations and Sprint-7 public-image function/config work.

PR #105 also has no current textual merge conflict with the integration, but it has a semantic migration-order conflict: its un-applied `20260828170059` and `20260828173349` versions predate the already-applied Gate tip. They must be re-versioned after `20260828192125` and fully revalidated; a clean Git merge alone is insufficient evidence.

## Integrated-head validation

- Mobile typecheck, lint, Product contracts, map discovery, canonical image, and carousel geometry: PASS.
- Consumer Web typecheck, contract tests, lint (warnings only), release validator, and Production build: PASS. CI now uses the Web package's declared Node 22 runtime.
- Shared TypeScript and all package-runtime tests: PASS (133/133). Four inherited assertions were updated to the already-canonical contracts: server-issued Decision IDs, whitespace-independent action detection, Offering snapshot persistence order, and event-time-pinned N4 review evidence. Product code was not weakened to satisfy them.
- Admin Production build/typecheck: PASS with Production-shaped placeholder environment. Admin lint retains the inherited advisory baseline (85 errors, 25 warnings); no new Admin PR #105 code was integrated.
- Repository sanity, secret guard, migration integrity, lineage guard, and clean Supabase bootstrap: PASS.
- Full Decision Lab: 314/316 PASS. The two inherited D2/D3 freeze-identity failures remain explicitly P2 and were not bypassed or hash-updated.

## Exact forward integration plan

1. Keep `origin/main`, Android worktree, and PR #105 unchanged during proof.
2. Use Gate-1 head `9896c7c` as the first parent so exact Production migrations and integrity controls remain authoritative.
3. Merge shipped Consumer head `925b69e` as the second parent; it transitively includes Mobile Sprint 7 `0414bd9`.
4. Freeze delivery IDs, commits, subtree hashes, database tip, and all 24 Edge deployment identities in `PRODUCTION_PRODUCT_LINEAGE.json`.
5. Enforce ancestry, exact Mobile/Web trees, migration tip, migration uniqueness, and manifest integrity in CI with full Git history.
6. Run Mobile contracts/type/lint/release checks, Consumer-Web contracts/type/lint/build, backend/package tests, clean DB bootstrap twice, lineage validation, and repository/secret guards from the integrated HEAD.
7. Push only the integration branch and open/retarget a reviewed PR to `main`; do not direct-push or rewrite `main`.
8. Rebase/re-version PR #105 only after the Gate baseline is accepted. Rebase the active Android work only after its owner is ready; never overwrite its local changes.
9. After the integration PR lands, verify `origin/main` equals the reviewed head and rerun the online EAS/Vercel/Supabase lineage check.

## Canonical-head verdict

- Candidate integration contains all proven shipped lineages: **PASS**.
- `origin/main` currently contains them: **FAIL**.
- Canonical default-branch remediation complete: **NO — reviewed integration is not yet merged to `main`**.

Therefore:

**CANONICAL MAIN/HEAD REPRESENTS CURRENT PRODUCTION PRODUCT — FAIL.**
