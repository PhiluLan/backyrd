# Production / Repository Coverage and Legacy Mapping

## Honest coverage statement

Production row coverage is **unknown**, not zero. No authorized connection existed and no Production query ran. The committed aggregate is bound to query-independent repository inputs and hash `25c0b5cf35b7ccda54db69413894b4d9dbc5b0c8d83a27c0563a9f5c5b8b0ea3`.

Repository evidence contains 139 canonical migration files through `20260909073004_close_review_capture_trust_v2.sql`, 25 Foundation areas and 47 World attribute definitions. Pattern counts such as 822 `SECURITY DEFINER` mentions are inventory leads, not unique live objects and not proof of effective Production state.

## Legacy mapping coverage

The canonical Slice-2 matrix contains 36 rows:

| Mapping status | Rows | Meaning for migration |
|---|---:|---|
| `DIRECT` | 1 | Shape aligns, but a future claim still needs provenance and policy. |
| `NORMALIZED` | 10 | Requires explicit value-level transform and audit trail. |
| `MISSING_PROVENANCE` | 9 | At most asserted legacy evidence; never verified automatically. |
| `AMBIGUOUS` | 4 | Requires review or a Product decision. |
| `SUBJECTIVE` | 1 | Explanation/research only; not World truth. |
| `UNSUPPORTED` | 1 | No safe semantic conversion. |
| `PROHIBITED` | 6 | Commercial/owner context stays outside World and Decision. |
| `NO_TARGET_KEY` | 4 | Keep in its original domain or add a later approved contract. |

Recommendations are 20 `ADAPT`, 8 `DO_NOT_MIGRATE`, 4 `KEEP`, 2 `EXTEND`, 1 `REPLACE`, and 1 `UNKNOWN_NEEDS_DECISION`. These counts describe mapped field classes, not Production values.

## What repository evidence proves

- `public.spots.id` is the strongest current internal identity. Slugs, owner IDs and provider IDs are not identity replacements.
- Base spot fields cover name, address/city/country, coordinates, one category, description, website, phone, ambiguous email, ordinal price and lifecycle state.
- `spot_hours` models regular venue hours but does not universally bind timezone, source, observation or validity.
- Gold authoring supplies source, proposal and accepted-fact lineage. `ADMIN_VERIFIED`, acceptance state and numeric confidence are legacy workflow semantics, not World `VERIFIED`.
- Restaurant Information adds neighborhood, social contacts, special hours, takeaway, cuisines, payment, capacity, areas, reservation and service fields, but enum/value transforms remain necessary.
- N4 suitability, moods, audience and atmosphere combine subjective and objective meaning and cannot become capabilities or World truth automatically.
- Owner and Admin write paths authorize actions; they do not prove the asserted fact.

## Structural gaps

No repository-wide proof exists for field-level provenance on base spot columns, IANA timezone coverage, date-specific and kitchen-hour coverage, component-level accessibility, explicit validity on mutable facts, canonical external-ID namespaces, duplicate/merge history, or a public-vs-private spot-email distinction.

## Data-quality risks

1. Ordinal `price_level` cannot become a currency money range.
2. Legacy category IDs require an allow-listed mapping to the 16 canonical categories.
3. A row-level `is_verified` flag cannot verify each attribute independently.
4. Missing data must remain absent; adapter-created `UNKNOWN` is allowed only from an explicit legacy unknown.
5. Opening-hour rows without timezone/source/freshness are not sufficient for eligibility.
6. Accessibility summaries may overstate a complete visit path; only component claims are safe.
7. Contact `email` is ambiguous and must not be published until its public-spot semantics are explicit.
8. Reused external provider IDs are duplicate candidates only, never automatic merge authority.

## Read-only query pack

The SQL pack opens an explicit read-only transaction, sets 10-second statement and 1-second lock timeouts, calls no application RPC/function and returns one aggregate JSON object. It selects no identifying values. Its output must pass the normalizer before any artifact can be reviewed. A later run must record execution time, connection authority, returned migration tip and normalized hash; raw output must not be committed.
