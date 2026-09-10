# Registry and key convention

Registry version: `backyrd.world-knowledge.registry@1.0`

- Explicit typed child definitions: 46
- Registry SHA-256: `a0e9b00400e3be6faa33fdf289d630bb61799a12d49201d03384ed1f5329a7ee`
- Derived rule registry: `backyrd.world-knowledge.derived-rules@1.0`
- Rule registry SHA-256: `e4550ce93b23d4a217bd296e8b83a01363a4459433309c953efae15def917e27`

## Rules

Keys are lowercase, language-neutral dot paths. Labels are bilingual metadata and may change only with a registry revision; labels never become identity. Attribute version is explicit and the complete canonical registry is SHA-256 bound.

One Spot has exactly one `classification.primary_category`. `classification.place_types` cannot select or rewrite it. There is no Secondary Category field in Slice 1.

Large areas use typed child keys rather than opaque objects:

- location: address, locality, neighborhood, country, latitude, longitude, time zone
- public contact: website, phone and individual social links
- capacity: total, indoor, outdoor and supported group range
- accessibility: step-free entrance, wheelchair paths, accessible seating, accessible toilet, accessible outdoor area
- time: regular venue hours, dated exceptions, kitchen hours and scoped Current State

Offering is separated into:

- `offering.cuisines`: Italian, Indian, Swiss and similar culinary traditions
- `offering.food_specialities`: Pizza, Burger, Sushi
- `offering.groups`: Beer, cocktails, snacks, full meals and meal periods
- `operation.service_model`: table service, self-service, hybrid
- `operation.service_format`: casual dining, fine dining, fast casual, counter service

Burger and Pizza are not Cuisine. Casual Dining is not Offering.

## Applicability

Every definition carries `ALL` or an explicit list of the 16 category keys. Applicability controls authoring and quality review; it never deletes existing claims after a category correction.

## Integrity

The registry hash binds definitions, labels, types, ranges, applicability, engine authorization, expiry behavior, and the fact-type validity policy. FNV and localized slug hashes from the research prototype are not accepted.

Unknown registry versions fail closed in claim parsing, resolution, derived-result parsing, and snapshot parsing.
