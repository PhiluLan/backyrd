# Searchable Spot details

Task class: PRODUCT_RELEASE plus DATABASE_PR. Surfaces: World profile/schema,
shared Admin/Owner authoring, shared Mobile/Web presentation and Bibliothekar.

## Added facts and existing fields

- `participation.group_access`: individual registration versus group-only
  registration, on the offer. It does not establish private instruction.
- `participation.subscription`: no membership/subscription required versus a
  required membership/subscription, on the offer. A reservation is separate.
- Existing `sport.level` is also relevant to instructed and play offers,
  including bowling. Beginner suitability requires explicit level evidence.
- Existing `stay.minimum_nights` is visible in the main overnight questionnaire.
  A one-night requirement can use this minimum only on an actual overnight
  offer. A day-use room cannot establish an overnight stay or availability.
- Existing area `offer.temperature` has water-specific choices at a pool.
  Room heating does not prove warm water. Unknown water conditions stay unknown.
- Private celebrations can explicitly declare birthday or children's birthday
  activities. A generic celebration does not prove a children's party.
- Activities absent from the finite offer catalogue can be entered as a named
  activity under Other. Pottery/cooking courses have explicit choices under
  courses/workshops. Names alone do not become arbitrary search facts.

Common pet and external-food rules retain their existing single authoring path.
Profile-scoped permission exceptions remain optional and existing answers remain
editable. The shared pet rule proves unrestricted ordinary-dog access only when
indoor and outdoor rules agree, have no unstructured qualification, and are
current, verified and authorized for hard constraints. Assistance-animal access
never proves ordinary-pet access. Other cases remain unresolved.

Offer registration, subscription, expertise, stay and temperature evidence must
belong to an offer that witnesses the requested activity. An unrelated offer in
the same room cannot supply these facts. Conditions, exclusions, preferences,
explicit unknowns, old values and offer/area scope are preserved.

The shared presentation adapter displays the new facts in both Mobile and Web.
No extra bespoke consumer screen or independent Owner form is introduced.

## Delivery

Founder requested publication on 2026-11-28. The release proposal uses the
existing isolated SQL/artifact pipeline with an exact Spot Knowledge scope:
one hash-bound validator migration, only decision-v13 and
decision-admin-diagnostic, the unchanged four Booking exclusions, fresh backup
46134833366 and the existing verified database/media restore receipt. Auth,
retirements, other migrations and other functions remain excluded. The proposal
keeps executionAuthorized=false; manual exact-Main certification and deployment
are the execution authority. The new applied receipt may only be recorded after
live migration/validator/ACL and function verification.

The forward migration installs validator v4 and routes the existing v7 claim
validator to it. It preserves validators v1–v3, old claims, profile version,
public RPC signatures and entitlements. The new validator remains private with
no direct execution grant to public, anon, authenticated or service_role.

Deploy the certified migration and backend runtime before publishing Admin,
Owner or the Mobile update that authors/reads the added profile properties.
Rolling back to a parser that rejects these properties after new claims exist
requires retaining the compatible reader. Do not delete claims for rollback.

No production Spot values are backfilled or invented. Enabling an editor does
not prove that the corresponding fact exists at any particular venue.

## Acceptance and remaining audit work

Regressions cover positive/negative/unknown/preferred values, scope separation,
minimum stay, water versus room heating, birthdays, explicit music absence and
conditional rules. World tests bind the exact SQL schema to the shared schema.
SQL tests cover old/new profiles, invalid types, invalid scope, unknown values,
unchanged historical validators, dispatch and private execution ACLs. Shared
presentation and authoring scope tests cover all supported facts.

This closes the enumerated authoring/reader gaps, not the entire large-catalog
audit. Geographic inventory, target-area errors, personal history, missing trip
origins, external weather, price/group request binding, dated availability and
the 515 inputs without frozen expected meanings remain separate work. Existing
venue facts still need verified content where the audit found missing data.
