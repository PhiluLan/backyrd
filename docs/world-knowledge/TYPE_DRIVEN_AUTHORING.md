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

## Input continuity

An empty scoped property and its first local answer must retain the same React identity. Property input keys use the canonical question key and occurrence within that question, never the answer’s changing global array position or value. Editing another question must not remount existing inputs. Special-day row keys likewise exclude the editable date. This applies to the shared Admin/Owner editor and the historical Admin question editor. Preserve existing save actions: typing only changes the local draft.

Regression coverage: `admin-dashboard/test/authoring-input-focus.test.mjs` exercises empty-to-first-value transitions, later edits, unrelated answer insertions/removals and multiple same-question answers. Manual browser validation uses the actual React components with synthetic local data: reproduce first-digit blur with the old key, then verify retained focus for first numeric/name input, subsequent individual keystrokes and both special-date editors.

## Shared spot care and scoped exceptions

The shared Admin/Owner product editor groups care into basics, classification,
offers, areas, common information and review. Common opening and kitchen hours,
special hours, prices, booking, access and facilities retain their canonical
fields and existing per-field permissions. Moving a field into common information
does not expand Owner entitlements or change its write/readback contract.

New offer choices follow the category template. A museum does not suggest a
private celebration by default; an existing celebration offer remains editable.
Offer questions distinguish essential service details from expandable additional
details. Areas initially ask whether the experience is indoors or outdoors;
existing access, capacity and other area facts remain available under additional
properties. Nothing is automatically deleted, migrated or inferred from a name.

The simple offer setting writes explicit links to canonical indoor/outdoor areas.
It only manages minimal setting areas: named/custom areas must be edited through
the existing area controls. Changing a setting never deletes an area, changes
another offer, or overwrites prices, schedules or custom facts. Existing scoped
facilities remain accessible even where the common facility editor prevents
asking the same new question twice. Basic Owners without that common writer keep
their permitted scoped questions.

Unsaved scoped edits block workspace navigation until saved or discarded. The
confirmed “save and continue” action advances after the existing public-readback
check. Browser regressions use the real shared component with synthetic data and
cover category choices, data retention, common-field writes, Owner restrictions,
mobile overflow and unsaved navigation.

The research import uses the explicit browser entry point. Research parsing and
planning expose only pure code; discovery schema definitions are shared without
importing provider, HTTP or privileged server modules into the client bundle.
