# Librarian domain evaluation

Status: candidate implementation, not a declaration of production completeness.

The Librarian combines the structured Luna meaning with canonical World and
experience-profile evidence. It must preserve the request's family, modality,
subjects, alternatives and exclusions. Ranking cannot repair a failed duty.

## Execution contract

1. `compileLibrarianPlan` records each requirement, operator, potential evidence
   sources and software support before a venue is evaluated. An unsupported
   operator is a software limitation, not missing venue data. Open extensions
   remain unsupported duties; they are not discarded.
2. Existing structured and scoped witnesses establish the actual requested
   activities and areas. Non-consuming atmosphere evidence does not add a paid
   activity. Area evidence can describe an activity in that area without selecting
   an unrelated tour. Offer-specific music cannot describe another selected meal.
3. Domain operators evaluate rules against those selected witnesses. They do not
   combine dinner with a cheaper drink or a more permissive unrelated activity.
4. Venue, meal service and offer schedules must overlap the requested window.
   A same-day, imprecise window is clipped to the actual server time. Separate
   kitchen hours constrain food. Absent kitchen hours use venue hours under the
   existing product policy; explicitly unknown or disputed kitchen hours do not.
5. Every REQUIRED or EXCLUDED duty must be MET before admission. Optional
   preferences can affect ordering, never mandatory eligibility.
6. Projection and ranking share the evaluator-version authority. A new supported
   evaluator must not accidentally re-enter the legacy situation-only filter.

## Domain semantics

### Opening-hours inheritance (Founder rule, 31 October 2026)

An offer without its own weekly calendar inherits the verified venue opening
hours. This is an explicit product default, not a newly researched timetable.
Own calendars remain binding; a missing weekday in an existing calendar does
not activate inheritance. Venue closures, special hours, validity, kitchen hours
for food and all other eligibility / booking rules still apply. Missing venue
hours remain unknown. Source hashes include the inheritance policy and venue
provenance. Consumer details explain the inherited source and do not promise
free places, a booking or course admission.

Areas currently have no separate calendar in the shared profile contract. Their
linked offers use the rule above; area-only venue availability continues to use
venue hours. This change adds no parallel area calendar and writes no inferred
hours into stored profiles. Event occurrences keep their own dated availability
path and do not receive venue-inheritance copy.

Replay of the latest exact parent/child indoor request with updated canonical
profiles confirms ELYS Boulderloft, Basso and Hoppolino. All 444 canonical snapshot
hashes match the preceding live diagnostic. This is a deterministic candidate
replay, not an additional AI call or a production publication.

### Booking

Typed `rule.reservation` and scoped `participation.booking` / `entry_mode` are
read through one documented booking vocabulary. Recognized authoring labels,
enums and request terms map to NOT_REQUIRED, RECOMMENDED, REQUIRED or CONDITIONAL.
This vocabulary is versioned and included in the language fingerprint.

RECOMMENDED is compatible with a request not to have a booking obligation. It
never guarantees available seats, immediate admission or acceptance of a party.

The specificity order is offer, area, profile default, canonical venue default.
Only applicable, authorized evidence participates. Same-level contradictions,
uninterpreted values, uncertain group/time conditions and unknown rules remain
UNKNOWN with distinct diagnoses. A narrower explicit unknown is not replaced by
a broader convenient assertion. Source identity and policy version are hashed
into the assessment; no profile data are rewritten by the evaluator.

### Qualitative prices

A numerical budget continues to use scoped offer prices and the request's actual
amount, currency, coverage and party size. The evaluator never manufactures a CHF
limit from “nicht zu teuer”.

The candidate's current qualitative price mode is CLARIFY, pending the Founder
choice requested during implementation. The runtime returns a distinct
REQUEST_NEEDS_CLARIFICATION limitation; Mobile and Web ask for a per-person
budget. PRICE_LEVEL is an explicit alternative policy for venue price levels;
it is not enabled, and a venue price tier is not a proven price for every offer.
Before enabling it for offer-level decisions, define applicability and handle
contradictory scoped prices. Do not infer that a cheap drink proves a cheap dinner.

### Existing typed World facts

Typed cuisines, food specialities and atmosphere can use the existing World
language interpreter while a scoped profile exists, rather than becoming
invisible solely because that profile is present. Inheritance respects explicit
scoped values and unknowns. A global food list cannot identify a particular meal
when multiple different meals exist. Source-use permissions are preserved:
discovery-only cuisine facts cannot silently become hard eligibility evidence.
Those cases report SOURCE_NOT_AUTHORIZED rather than MISSING_DATA.

## Honest uncertainty

Fact diagnoses distinguish missing data, unsupported software, clarification,
uninterpreted values, conflicting data, unresolved conditions, insufficient
scope/evidence, and source-use restrictions. The evaluation plan is available in
the existing diagnostic search result. Consumer responses keep the existing
hashed contract and receive user-facing limitations, not internal fact tables.

The request catalogue contains more families than the authored Spot catalogue.
The candidate explicitly reports 47 native families without an evaluator, rather
than pretending that an automatic property lookup implements them. Approved
custom meaning registries remain supported by the existing configured matcher;
no new unapproved registry or model interpretation is fabricated in production.

## Validation and acceptance

Run:

- `npm run decision-vnext:test`
- `npm run decision-product:ci`
- `node --test mobile/scripts/test-wohin-model.mjs`
- Mobile and Web typechecks when consumer copy changes.

The domain scenarios cover booking languages and enums, broader/narrower rules,
conflicts, unknown text, group conditions, unrelated offers, World permissions,
qualitative budget policy, kitchen/venue intersections and current kitchen
closure. These checks protect invariants; their number is not a quality metric.

For experience quality, replay recorded real Luna outputs against the same
canonical catalogue and reference time. Record actual presented places,
selected offers, failed/unknown duties and reasons. Label deterministic replay
as replay: it is not a fresh model call, real-time availability check or a
production deployment. Compare prior successful requests as well as failures.
No candidate with an unknown/failed required condition may become ranked merely
to improve result coverage.

Pre-inheritance replay evidence (matching@19): 419 venue profiles plus 25 event occurrences; ten
recorded requests plus the exact dinner request. Café, vegan lunch and family
matches remain available; the first-date bar request resolves to Volta Bräu and
Alchemist. A separate replay of the current Main evaluator (matching@18)
confirms that all ten presented result lists are unchanged by matching@19; the
older recorded response alone is not used to attribute improvements to this PR. Six of ten requests still have no confirmed result, with specific
evidence gaps retained. For the dinner request the recommended reservation rule
now proves “without booking obligation”; the qualitative price remains a
clarification. Volta's recorded whole-venue closure remains effective for that
dated request. A manually modified control plan with an explicit 40 CHF per
person budget confirms Gifthüttli under matching@19; matching@18 remains partial
because of booking. This control is labelled synthetic, not a new AI interpretation.
These results do not justify a blanket production-ready claim.

No migrations, Spot edits, Auth, consent or moderation changes belong to this
candidate. Publish only through the normal certified release after acceptance
of the product behaviour and the outstanding qualitative-price policy.


## Child outings and regional retrieval (matching @21)

Generic `condition.children = Kinderangebote` does not establish an activity:
it may describe a children's meal or discount. A typed leisure offering such as
an exhibition can establish a family outing when its same-scope verified facts
jointly document all-age suitability and family-friendly atmosphere. Neither
family atmosphere alone nor admission alone is sufficient. Existing minimum-age,
accompaniment, indoor and time checks remain independent obligations.
Structured recurring activity conditions constrain an offering even when its
schedule is empty; inheriting venue hours cannot erase a Sunday-only activity.
Description text is not silently interpreted as an authoritative calendar.

Context/default Basel retrieves the versioned municipality cohort in
`product-librarian-geography.ts` through service-only context v7. It makes no
radius/distance claim. Required exact destinations still compare actual
localities; Muttenz is never renamed Basel. Other cities retain city retrieval.
The SQL and runtime region lists must match exactly; outside-region bindings,
missing region authority, invalid manifests, disabled releases and unauthorized
actors fail closed. Legacy context v5/v6 remain unchanged. Events follow the
same cohort, preserving their original locality and publication controls.

Replay of the recorded 31 October child-indoor request against 432 current
regional profiles admits ELYS, JUMP Factory, Hoppolino and Spielzeug Welten Museum;
Basso is unresolved and not recommended. This is a deterministic candidate replay,
not a production deployment or a fresh model invocation. No Spot edits are made.


## Playground facilities and location provenance (matching @22, prompt @9)

`offer.facility` reads the catalogue's Boolean amenity keys as well as textual
features. A PLAYGROUND area with a compatible movement-play/children offering
can establish a playground without a duplicated amenity flag. A legacy billiards
or darts room is not sufficient merely because it has that area kind. Playground
and indoor/outdoor obligations join on the actual area. A global facility flag
cannot locate the playground in an unrelated outdoor area. Explicit scoped
setting values or unknowns take precedence over catalogue setting defaults.

`explicit.targetCityRole` is optional and is either SEARCH_CONTEXT or
REQUIRED_DESTINATION. Mobile profile cities, Web search defaults and the Basel
diagnostic use SEARCH_CONTEXT. This city remains server-side retrieval context
and is removed from the model's explicitContext; Web no longer appends it to
the user's prose. A source-named destination remains required and wins over the
profile default. Explicitly selected/legacy cities retain their exact-city
retrieval and mismatch protection. All original model facts remain unchanged;
no mandatory destination is demoted by the matcher. Deploy the backend accepting
the optional field before releasing clients that send it.

Recorded playground query replay now selects St. Johanns-Park, Kannenfeldpark,
Schützenmattpark, Zoo Basel and Robi Bachgraben. The historical model's Basel duty
is deliberately retained in that replay. It proves facility matching, not the
new prompt behavior. Location provenance is separately checked at the real
provider input and routing boundaries; a fresh new-prompt server call requires
deployment of the versioned backend. No Spot data is rewritten to force results.
