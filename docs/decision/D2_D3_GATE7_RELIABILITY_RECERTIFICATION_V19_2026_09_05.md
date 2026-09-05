# D2/D3 v19 — Gate-7 reliability candidate re-certification

## Authorization and scope

Founder/CTO authorized Gate 7 reliability, capacity and cost remediation and,
on 2026-09-05, the explicit retirement of the three unused deployed legacy
Functions `cluster-mood`, `semantic-bridge-decision` and
`enrich-spot-description`. The authorized implementation commit is
`e1043603cba0f6880d74a19d52701510dfc97d48`, based on canonical Main
`7e1096615e0d6a5db14f9f2973e187fd5d3d76e4`.

This v19 record is the pre-deployment admission contract for that exact
candidate. It does not claim that the candidate bytes are already deployed.
Production remains Decision v123 until the normal PR is merged into canonical
Main and the source-aware deploy completes. A separate post-deployment evidence
re-certification must bind the resulting active version, bundle, deployed
source set and canonical Main SHA.

## Semantic review

The Decision change adds only deterministic request-cost admission before an
initial request and provider/database timeouts. Continuations remain governed
by their existing Product contract. Candidate retrieval, hard eligibility,
negation, Location, price, opening-hours treatment, ranking, Mood, Taste,
Trust, N4/N5/N6, Offering/Purpose, reasons, continuation identity and returned
result count are unchanged.

The full protected source-set review found no new ranking input, score, weight,
filter, prompt, fallback, reason claim or user-evidence interpretation. The
atomic database counter stores only operation, opaque actor key, time window
and counts. Ambiguous/missing counter state blocks the provider call. A reached
limit returns a bounded unavailable/rate-limited state; it never substitutes a
different recommendation.

## Evidence and negative controls

- full Decision Lab and all D2.1/D2.2/D3.1 identities must validate together;
- the source-aware deploy planner must bind the Decision entrypoint, transitive
  shared limiter, `verify_jwt`, migration and all changed Functions;
- unchanged repository state passes;
- one-byte Engine drift, an added protected source, Production identity drift
  and any non-recertified later change remain blocked;
- the three retirement targets contain no provider, database, environment or
  authentication access and always return `410 Gone`;
- no Gate-1–6 Product semantics, Security guard, Mood or Trust/Safety contract
  is weakened.

## Production closure requirement

After canonical-main deployment, read back the active `decision-v13` version,
`verify_jwt`, bundle and deployed eszip sources. Every repository-bound file
must match byte-for-byte. Re-run Production Decision capacity, the full
Decision Lab and dependent freezes. Only the post-deployment record may state
`PRODUCTION IDENTITY — PROVEN` for the Gate-7 runtime.
