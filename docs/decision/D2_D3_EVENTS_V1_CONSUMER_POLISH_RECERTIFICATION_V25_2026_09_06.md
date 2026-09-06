# Decision v25 evidence re-certification: Events V1 Consumer Polish

Founder authorization on 2026-09-06 permits the Events V1 Consumer Product
Polish to proceed through the normal guarded PR and canonical-main release
flow. This additive, evidence-only v25 re-certification binds the exact
presentation commit required by that instruction.

## Preserved Production identity

- Supabase project: `hjgcrrzfjchzqoegcywn`
- Function: `decision-v13`
- Active Production version: `124`
- Production bundle SHA-256:
  `a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13`
- Repository-matched deployed files: `41 / 41`
- Decision Engine source SHA-256:
  `cad2c4ea94817d2facbd54db92f55f3286acecf4d1e8a71dda414431b76cf000`

The protected semantic source set is byte-identical to v24. Decision,
Ranking, Mood, Taste, N4, Gold, Auth, Push, Deep Link, Gate 1–7, database,
RLS, Admin and Event-domain semantics are unchanged.

## Authorized evidence change

The exact Consumer presentation source is
`fc002f8a4d7e71b231504d1238e7c24744847bbb`, based on canonical main
`612209ba40ff42075e209a6731e6419a21f4e7d4`. It changes only the shared Event
presentation helpers, Mobile/Web Event views, the read-only grouping of
upcoming Event rows, and their presentation tests. No database object,
canonical Event value, Event/Occurrence behavior or Production Decision
runtime is changed.

## Result

`AUTHORIZED` — evidence identities may be re-derived for this exact Events V1
Consumer Polish only. No Decision runtime deployment, semantic change, guard
relaxation or external Event source activation is authorized.
