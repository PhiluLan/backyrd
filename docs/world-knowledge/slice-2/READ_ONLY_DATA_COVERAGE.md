# Read-only Data Coverage Report

Production was not queried. No approved read-only database credential was required or used; the local seed is empty and the local Supabase runtime was not available in the sandbox. Therefore production spot count, null distribution, cardinalities and empirical invalid-rate percentages remain unknown.

Repository-reconstructable coverage:

- base `spots`: identity, address/locality/country, coordinates, category, ordinal price and public-looking website/phone/email;
- `spot_hours`: regular weekly hours only;
- Gold/Restaurant catalogs: richer structured definitions and source/proposal/accepted-fact records;
- N4/suitability: subjective/derived evidence with numeric confidence, excluded from World trust;
- no universal field-level source, verification record, timezone, freshness or validity coverage can be proven from schema alone.

The package includes `profileLegacySpots`, which returns only aggregate counts for supplied records: total, field coverage, invalid hours and ambiguous categories. It emits no names, addresses, contacts, actor IDs or source URLs. A future authorized profiling run should supply a bounded read-only projection and commit only sanitized aggregates.

Remaining uncertainty is explicit: no claim is made about the number or percentage of production spots covered by Foundation attributes.
