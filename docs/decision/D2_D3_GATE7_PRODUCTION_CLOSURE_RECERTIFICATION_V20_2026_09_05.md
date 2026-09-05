# D2/D3 v20 — Gate-7 Production closure re-certification

## Production proof

Founder/CTO authorized the Gate-7 remediation, canonical-main deployment and
complete post-deployment re-certification. PR #203 merged normally as canonical
Main `c1fcb4ad76e21b52c0d064192e129abe6f554e8e`; its source-aware Production
workflow applied exactly migration `20260904233000_gate7_launch_cost_boundaries`
and deployed the bound changed Edge Function scopes.

The active `decision-v13` runtime is version 124 with `verify_jwt=true`. Its
Management API ESZIP 2.3 artifact contains 41 repository-bound files. All 41
match canonical Main byte-for-byte, including the exact deployment entrypoint
`import "./live-index.ts";` and the new fail-closed launch-cost boundary. The
machine-readable proof is
`docs/decision/evidence/decision-v13-production-v124-eszip-verification.json`.

## Semantic conclusion

The version increment is an operational redeploy caused by the v19-authorized
request-admission dependency. Candidate retrieval, hard eligibility, ranking,
Location, price, opening hours, Mood, Taste, Trust, N4/N5/N6,
Offering/Purpose, explanations, continuation identity and result-count
semantics are unchanged.

The v20 contract jointly binds the Engine, complete protected source set,
certification evidence, dependent freezes, active Production bundle,
configuration, ESZIP body and canonical Main SHA. One-byte Engine drift, a new
source, changed Production identity or any later un-recertified evidence change
remains blocked.

## Gate-7 operational follow-up

The first off-provider backup execution proved canonical-main and AWS OIDC
admission but exposed two invalid IAM read-action names before any export was
accepted. The follow-up changes only those two read-only IAM actions to their
canonical AWS names. Backup export remains fail-closed until the corrected
template reaches canonical Main, the live stack is updated and daily plus
weekly encrypted exports are verified.
