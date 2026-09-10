# Existing World Data Audit

This is a repository-derived audit, not a production data export. Canonical migrations, DTOs, RPCs, functions, mobile/web/admin consumers, and research contracts were inspected read-only.

| Component | Classification | Finding |
|---|---|---|
| `public.spots` and shared Spot DTOs | ADAPT | UUID identity and basic fields are useful; field-level actor/source/freshness are absent. `email` has ambiguous public/private meaning. |
| `categories` / `category_id` | ADAPT | Single relation aligns structurally, but legacy category IDs/names require an explicit allow-list to the 16 World categories. |
| `spot_hours` | ADAPT | Weekly venue times exist; timezone, source, observation, exception semantics and validity are not bound. |
| Gold fact catalog / proposals / sources | EXTEND | Strongest compatibility substrate; source and proposal lineage exist. Legacy `ADMIN_VERIFIED`, accepted status and numeric policy result must not become World verification/trust. |
| Restaurant Information V1 | ADAPT | Neighborhood, public social URLs, takeaway, cuisine, payment, capacity, areas, reservation and special-hours shapes are useful. Some enums differ and require value-level mapping. |
| `spot_intelligence_v1` | DO_NOT_MIGRATE | Best-for, occasions and atmosphere are subjective/mixed; row-level `is_verified` is not attribute verification. |
| N4 suitability facts/read adapters | DO_NOT_MIGRATE | Suitability and numeric confidence are Decision/User evidence, not objective World truth. |
| Admin authoring functions/UI | REPLACE | Current acceptance can supersede rows and uses admin authorization and numeric confidence. Preserve as legacy input only. |
| Owner dashboard/writes | REPLACE | Ownership/entitlement authorizes editing, never trust. Future writes must create source-bound claims. |
| Research/import/city bootstrap | ADAPT | Useful lineage and candidate discovery; canonical writes and provider evidence require explicit mapping/policy. |
| Decision v13 and `spot_is_open_now_safe_v1` | ADAPT | Current consumer owns operational eligibility; do not connect until a policy-backed World adapter exists. |
| Mobile/Web spot consumers | KEEP + ADAPT LATER | Presentation reads remain. They must not become authoring or World truth authorities. |
| Reviews/moods/moments | KEEP SEPARATE | User experience evidence stays subjective and user-domain scoped. |
| Events and event-to-spot relations | KEEP SEPARATE | Event entity remains separate; `spot_id` is a relation, not a World attribute. Temporary places can still be spots. |
| Owner tier/payment/advertising | PROHIBITED | No World, trust, verification, eligibility or ranking path. |

The machine-readable field matrix lives in `src/legacy-mapping.ts` and is SHA-256 bound. It records source system/location, field/type/meaning, authority, provenance, target, transform, status, loss, conflict risk, verification, eligibility and recommendation.

## Material semantic gaps

Current data often mixes objective facts with suitability, has row-level rather than claim-level trust, lacks time zones and validity on hours, uses ordinal rather than monetary price, and lacks component-level accessibility. Missing legacy data remains absent; the adapter never emits false or explicit unknown unless legacy input explicitly says so.
