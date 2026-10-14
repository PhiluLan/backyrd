# Scoped spot authoring release

Admin and Owner share linked offering and area cards, scoped prices and schedules,
category-specific detail questions, draft reuse of existing claims and a shared
product vocabulary. Human review precedes submission. Missing knowledge remains
unknown. Existing claims, moderation, consent, RLS and append-only history remain
authoritative.

The release includes the prerequisite World registry versions 2.2, 2.3 and 2.4.
The existing Decision resolver bridge accepts these alongside historical 2.1
projections. The experimental Luna/Bibliothekar runtime, model/prompt changes,
conversation schema and Mobile updates are outside this release.

Production publication requires the repository's clean database bootstrap,
authorization tests, Admin/Web builds, risk gate and source-bound release artifact.
Migration activation is separate from UI build success. No synthetic data is
written to production for verification.

The Founder explicitly approved publication ("Freigegeben", 2026-10-14) of
the actor-scoped discovery-preparation counters cleanup older than two days in
the 2.3 and 2.4 migrations. The authority record and release classifier bind
this approval to their exact paths and SHA-256 contents. Modified migrations,
other deletions and new migration paths are not covered by this approval.

The Founder separately approved exactly the three 2.2–2.4 migrations with
the remaining untested recovery risk on 2026-10-14. Backup workflow run
38529360391 successfully exported, encrypted and verified the Production
snapshot. This is backup evidence, not a restore drill or a guaranteed rollback.
The additive release scope pins all three immutable migration hashes.

Mobile authoring keeps the current spot fixed on its edit route, uses a named
section selector, and starts with offers before areas and optional shared facts.
Owners and Admins can create and explicitly link an area inside an offer.
Technical usage hints and public-source preparation are collapsed by default.
Unknown answers do not show empty condition forms; existing conditional values
remain editable. Review and save remain explicit and use the unchanged RPCs.
Mobile regression coverage includes 320/390 px input geometry, prices, schedules,
conditional properties, direct area creation and save/reload. The actual Admin
edit wrapper was also exercised locally with synthetic, intercepted responses.

The authenticated Production UI was inspected at 390 px on Consum Weinbar
without modifying Spot data. Its previous nested search control measured
240 px wide. The obsolete edit-page link to a missing source section is removed;
source preparation remains available inside the authoring editor.

Scoped answer controls use explicit choices for activity, atmosphere, drinks,
cuisine, participation rules and other categorical facts. Activity choices are
filtered by category/offer kind and use the existing finite product concepts.
Named themes, dishes and waterbodies keep a single-name input with examples.
Search is explicitly a UI filter; it searches choice labels as well as fields.
Additional answers are separate properties, retaining their own conditions.
No new arbitrary catch-all property entry is offered. Existing free or custom
values remain visible and are preserved through unrelated saves; replacing
them requires an explicit answer selection. Price packages retain one total
price and an explicit purpose rather than invented component prices.
This is an authoring UI change using the existing schema and RPCs; it adds no
model interpretation, semantic links, server-side restrictions or migrations.

The category-specific authoring catalog 1.1 removes irrelevant new-entry
questions by actual offer and area kind. Normal gastronomy does not ask for a
guide, language, skill prerequisites, entry ticket or recommended age. Zoo
visits, guided tours and embedded restaurants have distinct question sets.
SPORT is an additive stored profile category with bouldering, climbing,
training, courses, children's movement play and optional cafe offers. Equipment,
rental, registration and induction belong to their exact sport offer; cafe
facts are separate. Price purposes and examples follow the actual offer.
Confirmed classification initializes a new profile; an unsupported or missing
classification requires explicit selection. Existing profiles and saved
out-of-selection properties are retained. A compatible care-category change
preserves every card; incompatible conversions are disabled. Invalid stored
profiles fail visibly and cannot be overwritten by an empty profile.
The private SQL validator must accept catalog 1.1 before the new UI is shipped.
No authorization, RLS, moderation or registry-authority change is introduced.

The Founder approved ("Alles freigegeben", 2026-10-14) the single additive
scoped Sport catalog migration 20261014211339, including the remaining
untested database-recovery risk, and the subsequent category-specific forms.
The current release scope pins only that migration's immutable bytes. The
already shipped three-migration approval remains in Git history. The same
successful backup evidence remains available; no restore drill is claimed.
The Founder also approved storing the explicitly reviewed Zoo structure.
Deploy the private validator before exposing new Sport authoring. Deploy the
shared parsing code to the consuming runtime before publishing Sport profiles.
