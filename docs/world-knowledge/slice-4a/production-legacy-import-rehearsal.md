# Production legacy spot import rehearsal

Status: one authorized Production read-only export and one local import completed on 12 September 2026. The Production transaction was explicitly read-only and bounded; no Production mutation, migration, deployment, Function execution with mutation, or runtime activation occurred.

## Truth boundary

The pipeline has three separately hashed stages: a minimized `SELECT` export, a deterministic registry/mapping-bound transform, and an Admin-authorized local import. The import retains `public.spots.id`, archives the legacy Product row, marks it `TEST`/`FOUNDER_EVALUATION_ONLY`, stages proposals in the private schema, and creates no World Claim. Only the explicit preview-and-confirm action can produce append-only `ADMIN_CONFIRMED` Claims.

The imported catalog and Founder cohort are separate. Imported spots default to `cohort_selected=false`; the Admin may select 1–40 spots without changing identity or deleting unselected history.

## Repository source inventory

| Source | Current producer / consumers | Provenance | Mapping / decision |
|---|---|---|---|
| `public.spots.id` | database; all Spot consumers | durable database identity | `DIRECT`; retain as World Spot ID |
| `public.spots.name,address,city,country,lat,lng,website,phone` | Admin/Owner/import; Web/Mobile/Decision | no field-bound source | `MISSING_PROVENANCE`; prefill, require Admin confirmation |
| `public.spots.email` | mixed legacy Owner/Admin flows | public/private meaning not distinguished | `AMBIGUOUS`; never map automatically to public email |
| `public.spots.category_id` + `public.categories.name` | legacy taxonomy | taxonomy relation, no World verification | `NORMALIZED` only through explicit allowlist |
| `public.spots.price_level` | legacy Admin/Owner | incompatible historical ordinal semantics | `AMBIGUOUS`; no conversion to the five-level World contract |
| legacy description | no column in the audited Production `public.spots` shape | absent | no export and no invented value |
| `public.spots.status` | operations | lifecycle state | `NO_TARGET_KEY`; `approved` is the only auto-imported active state; all others separated |
| `public.spot_hours` | Admin/import | no field-level source/freshness | `MISSING_PROVENANCE`; typed schedule prefill only |
| accepted Gold facts/sources | Research/Admin authoring | partial source binding | value-specific `NORMALIZED` only after an explicit rule; not in the initial exporter |
| `spot_intelligence_v1` moods/fits | enrichment/Admin/Owner | mixed subjective | `SUBJECTIVE`; excluded |
| N4 suitability/confidence | system derivation | intent/ranking evidence, not World evidence | `UNSUPPORTED`; excluded |
| Owner, subscription, payment, billing, advertising | commercial/authority systems | not factual evidence | `PROHIBITED`; excluded |
| Current status/candidates | several legacy producers | status semantics not unified | not exported until a stable mapping exists |

Repository migrations declare RLS and grants. The authorized run verified the expected Production project and legacy source shape, but did not claim that repository declarations prove every effective live Grant or Policy.

## Import states shown to the Founder

- Bestätigt
- Aus Legacy übernommen – bitte prüfen
- Mehrdeutiger Legacy-Wert – manuelle Auswahl erforderlich
- Noch nicht angegeben
- Explizit unbekannt
- Nicht anwendbar
- Konflikt
- Nicht migrierbar

Absence creates no Claim and never becomes `false` or explicit `UNKNOWN`. Review and excluded rows remain private import provenance and are omitted from `WorldKnowledgeReaderPort` and Decision projection.

## Release evidence (sanitized)

- Access: authenticated Supabase MCP bound to the repository-declared Backyrd Production project; no credential was copied to the repository or browser.
- Read-only proof: `transaction_read_only=on`, `statement_timeout=15s` for export (`8s` for identity/fingerprint checks), `lock_timeout=1s`; query pack contains only `SELECT` plus transaction-local settings.
- Production identity/state evidence: database `postgres`; 139 migration records; migration fingerprint `8210b7bb223787607ad33f83c467ebc1fb3b1100834d9551e04526328dd23547`; relevant Function fingerprint `b0ea3bb30172634e43d6619847c3cd2d9f084c7210d00bd85d09e9b21b2aa53f`; legacy source-shape fingerprint `c5cfd34d71f2a039ed31e5ad7d7bc3d656c71f0c17a9ee2fe72d54884206839e`.
- Production status: 447 total; 410 active/published; 37 archived; 0 Draft, tombstoned, duplicate-candidate, or unclear under the observed legacy status contract; 447 unique IDs.
- Local import: 410 active spots, preserving `public.spots.id`; 4,208 private staging rows; 0 import-created Claims; 0 confirmed Legacy values. The two pre-existing synthetic cohort members and their two Claims/Verifications remained unchanged.
- Mapping: 447 identity `DIRECT`; 3,202 `MISSING_PROVENANCE`; 327 `NORMALIZED`; 269 `AMBIGUOUS`; 37 inactive lifecycle rows `NO_TARGET_KEY`. No subjective, commercial, N4, User Intelligence, private Actor, or private Source data entered the export.
- Review: 181 spots contain at least one ambiguous value; 83 active category values are outside the approved allowlist, 92 legacy emails remain non-public/ambiguous, and 94 ordinal prices remain semantically incompatible. A five-spot local preview batch has 46 prefilled and 11 review-required values, with no automatic confirmation.
- Safe active coverage: name 410; address 410; locality 406; country 377; coordinates 410; regular hours 110; website 387; phone 282; allowlisted primary category 327. Special hours, kitchen hours, price level, offering, cuisine, accessibility, capacity, and reservation have no safely mapped source in this export and remain absent rather than `false`.
- Export manifest: `328ced068ec8013419a3ae8b110a6f537a566168581ab3dc589ffc71df8ad05f`.
- Mapping: `backyrd.world-knowledge.legacy-mapping@1.1`, hash `8d64076491b0bac06e019b71160f10cd8a1c294a574481d141231de99ac6e497`.
- Transform manifest: `cc637d687b6e72377adff3abc8008a817f1a6d5ee3652719730a18118b05a99d`.
- Local import manifest: `2872a094340ed3c1bc96b9a4426cfe09acc38c60288597dd86ae54cedc41198a`.
- Replay: byte-identical export and transform artifacts; second local request reused the original batch and created no duplicate spot, staging row, or Claim.
- Production mutation/deployment/runtime activation: `NONE`.

No Spot names, addresses, contacts, private sources, actor identifiers, credentials, or Production rows are committed.
