# Type-driven World Knowledge authoring

The Admin authoring flow is guided by three separate concepts:

1. `classification.primary_category` describes the primary discovery category.
2. `classification.place_types` describes what the place concretely is.
3. `offering.onsite` describes additional facilities without changing the primary purpose.

Question visibility is field-specific. It is derived from the primary category and the selected place types, never from a spot name or fixture position. Hidden questions do not delete claims. Existing values remain visible in the review and in the expandable historical section of their authoring step.

Canonical examples:

- `COFFEE_DAYTIME + BAKERY + CAFE`: baked goods, offerings, service and seating are relevant; cuisine and kitchen hours are not implied.
- `OUTDOOR_NATURE + ZOO`: Zoo is a permitted type; general group, accessibility, age and visit-context questions remain relevant; gastronomy seating and kitchen questions are not implied.
- `EAT + RESTAURANT`: cuisine, food specialities, kitchen hours, seating and reservation questions remain relevant.
- An embedded café or restaurant is recorded through `offering.onsite`; it does not reclassify the whole spot.

Knowledge states remain distinct:

- known value, including an explicitly empty list such as no special hours;
- unknown;
- not applicable;
- absent, meaning no claim was made.

The versioned `AUTHORING_GUIDANCE_VERSION` and hash bind the cross-category authoring extension and the field rules. The persisted World taxonomy and existing claims remain unchanged.
