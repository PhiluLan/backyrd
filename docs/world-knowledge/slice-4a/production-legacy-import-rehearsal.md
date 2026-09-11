# Production legacy spot import rehearsal

Status: contract and local pipeline implemented; Production execution **not performed** because no pre-authorized read-only connection was present. All Production counts and coverage therefore remain `UNKNOWN`, not zero.

## Truth boundary

The pipeline has three separately hashed stages: a minimized `SELECT` export, a deterministic registry/mapping-bound transform, and an Admin-authorized local import. The import retains `public.spots.id`, archives the legacy Product row, marks it `TEST`/`FOUNDER_EVALUATION_ONLY`, stages proposals in the private schema, and creates no World Claim. Only the explicit preview-and-confirm action can produce append-only `ADMIN_CONFIRMED` Claims.

The imported catalog and Founder cohort are separate. Imported spots default to `cohort_selected=false`; the Admin may select 1–40 spots without changing identity or deleting unselected history.

## Repository source inventory

| Source | Current producer / consumers | Provenance | Mapping / decision |
|---|---|---|---|
| `public.spots.id` | database; all Spot consumers | durable database identity | `DIRECT`; retain as World Spot ID |
| `public.spots.name,address,city,country,lat,lng,website,phone` | Admin/Owner/import; Web/Mobile/Decision | no field-bound source | `MISSING_PROVENANCE`; prefill, require Admin confirmation |
| `public.spots.email` | mixed legacy Owner/Admin flows | public/private meaning not distinguished | `AMBIGUOUS`; never map automatically to public email |
| `public.spots.category_id` + `public.categories.slug` | legacy taxonomy | taxonomy relation, no World verification | `NORMALIZED` only through explicit allowlist |
| `public.spots.price_level` | legacy Admin/Owner | incompatible historical ordinal semantics | `AMBIGUOUS`; no conversion to the five-level World contract |
| `public.spots.description` | mixed editorial/Owner/import | authorship/objectivity mixed | `AMBIGUOUS`; manual review, never automatic World truth |
| `public.spots.status` | operations | lifecycle state | `NO_TARGET_KEY`; `approved` is the only auto-imported active state; all others separated |
| `public.spot_hours` | Admin/import | no field-level source/freshness | `MISSING_PROVENANCE`; typed schedule prefill only |
| accepted Gold facts/sources | Research/Admin authoring | partial source binding | value-specific `NORMALIZED` only after an explicit rule; not in the initial exporter |
| `spot_intelligence_v1` moods/fits | enrichment/Admin/Owner | mixed subjective | `SUBJECTIVE`; excluded |
| N4 suitability/confidence | system derivation | intent/ranking evidence, not World evidence | `UNSUPPORTED`; excluded |
| Owner, subscription, payment, billing, advertising | commercial/authority systems | not factual evidence | `PROHIBITED`; excluded |
| Current status/candidates | several legacy producers | status semantics not unified | not exported until a stable mapping exists |

Repository migrations declare RLS and grants, but this is not proof of effective live Production policy. A future authorized run must inventory effective schema/grants separately in the same read-only session.

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

- Production connection: `NOT_AVAILABLE`
- Production export executed: `NO`
- Production spots found/imported: `UNKNOWN`
- Export/transform/import manifest hashes: `UNKNOWN_UNTIL_AUTHORIZED_RUN`
- Production mutation: `NONE`
- Production deployment/runtime activation: `NONE`

No Spot names, addresses, contacts, private sources, actor identifiers, credentials, or Production rows are committed.
