# Events V1 production evidence re-certification (v23)

Founder authorization on 2026-09-06 permits only the evidence re-certification
required to bind the four already-applied Events V1 migrations to canonical
repository history. It does not authorize migration-ledger repair, history
rewrites, migration re-application, external event sources, or changes to
Decision, Gate 1–7, Mood, Ranking, Auth, Trust, Safety, or existing Product
semantics.

## Exact migration identity

Production project `hjgcrrzfjchzqoegcywn` reports all four versions in
`supabase_migrations.schema_migrations`. For every version, the statement count
and SHA-256 over the stored ordered statement array match a fresh canonical boot
from the repository migration bytes. Repository file SHA-256 values are enforced
independently by the fail-closed Production deployment planner.

| Version | Repository file SHA-256 | Statements | Production/canonical statement SHA-256 |
| --- | --- | ---: | --- |
| `20260905193445` | `69975ac8f4f9b04f218412fb260412c0b4940013c61a97b77d8f7d680475650d` | 54 | `8427ea390bf8a45bef6acbd1a7fe9ddbc89c7e0e50cee3e69d1ac4f8f8a55482` |
| `20260905203748` | `030d5b72fe0879390feb63ab448145ac62d6061d692660da8b82c94ec7f1da89` | 31 | `1bea4917ba7a1975509377f5927c57a331ffc4a53d74d806d449a82763387dc6` |
| `20260905212123` | `4b3a9b881a3e9dd562b40afa510b17c2d465d086c6f2e4616baab210bcae4a18` | 6 | `7a50e7960ccab611e29ddcc64289d8c4aef4bc031b8c4fe1482bd19e77535e4f` |
| `20260905212627` | `0a7814ce964860fb3c6cab4e0adc89c57588d9083064788660a125b86b8f71bc` | 1 | `7421d12d21d2f4c275931999280f159dc85381acdc46ae2e839ba8cdc30dee8f` |

## Exact Production/canonical state

- Application-schema catalog facts: `11023`
- Application-schema SHA-256: `1335d79ea194ba39e89ea56891f27b62c6134c4343446f7f83197e78126379dd`
- Public ACL SHA-256: `ce26543378b1e9c67cf89e29a0af2e4a434f5ca6aaf0afe679cebcac961e562e`
- Events tables with RLS enabled: `7 / 7`
- Canonical Storage policies: `22`
- Exact public `event-images` bucket: present
- Enabled external event sources: `0`
- Production manual events: `1`
- Production occurrences: `26`

The current fingerprints were first read from Production and then reproduced by
the fresh repository boot. Historical Gate 5, Gate 6, and Gate 7 schema and ACL
proofs remove only the exact later Events V1 objects/grants inside rolled-back
transactions and still reconstruct their immutable prior fingerprints.

## Result

`PASS` — Production and repository converge for the authorized Events V1 schema,
ACL, migration-statement identity, RLS, Storage, and external-source boundaries.
The Decision production identity remains v124 with its existing bundle and
41-of-41 repository source match.
