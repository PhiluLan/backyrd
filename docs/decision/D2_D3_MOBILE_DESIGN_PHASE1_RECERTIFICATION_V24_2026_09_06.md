# Decision v24 evidence re-certification: Mobile Design Phase 1

Founder authorization on 2026-09-06 permits an additive, evidence-only v24
re-certification for PR #209. Its sole purpose is to bind the intentionally
changed Mobile Profile evidence and the canonical Product-lineage record for
the recovered Phase 1 Mobile design.

## Preserved Production identity

- Supabase project: `hjgcrrzfjchzqoegcywn`
- Function: `decision-v13`
- Active Production version: `124`
- Production bundle SHA-256:
  `a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13`
- Repository-matched deployed files: `41 / 41`
- Decision Engine source SHA-256:
  `cad2c4ea94817d2facbd54db92f55f3286acecf4d1e8a71dda414431b76cf000`

The protected semantic source set is byte-identical to v23. Ranking, Mood,
Taste, N4, Gold, Offering/Purpose, Product semantics, database semantics and
the Production Decision runtime are unchanged.

## Authorized evidence change

The recovered Mobile design source is
`0e6930dfd3b8547bef4813a8f5fa8bfd18688472`, based on canonical Events V1
`fbaca4422eba56cb337e4565b90b8612b732ef9a`. The exact 13-file Mobile change
set is independently fail-closed in
`docs/operations/PRODUCTION_PRODUCT_LINEAGE.json`. The v24 evidence set adds
the immutable v23 contract and this recovery evidence; it does not remove any
v23 protection.

## Result

`AUTHORIZED` — evidence identities may be re-derived for PR #209 only. No
Decision runtime deployment, semantic change, guard relaxation or Runtime
version change is authorized by this re-certification.
