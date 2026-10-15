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

Production verification on 2026-10-15 (Europe/Zurich): the scoped Sport validator
was applied by workflow 38644107783. Canonical Main 85fdf7deffccdd263733b877f66f5c536d1128e1
passed exact post-merge certification 38645701911 (manifest
4d702acf504ce1ba6c1bc8adfdadabea174d9b085037f6b7b5508fc8f4fee0b3).
Workflow 38646336306 successfully deployed only decision-v13 with the shared
profile parser; there were no pending migrations in that second deployment.
Admin and Owner Production deployments also succeeded for that canonical SHA.
No Mobile OTA was published.

Authenticated Admin verification used real, explicitly approved profiles at
390 px. Consum now stores the compatible BAR care category while preserving
its two areas and Apéro offer. Activity, wine, named platter and the confirmed
no-reservation rule are separate scoped properties. Zoo stores visit, guided
tour and gastronomy offers with explicitly linked outdoor, animal-house and
gastronomy areas. The tour route remains unconfirmed. ELYS stores bouldering,
children's movement play and cafe offers with three separate areas. Bouldering
booking is not required; the movement-play arrival window requires booking.
The child's typical duration is 120 minutes; it is not a hard maximum. Equipment,
rental and first-registration facts are scoped to the sport offers, not the
cafe. Saved category, links and representative properties were verified after
reload. Unknown prices, ambiguous age exceptions and unverified area qualities
were not fabricated. Production profiles are not synthetic test fixtures.
Zoo visit hides guiding and languages; its guided tour exposes them; its
embedded gastronomy retains the entry-ticket question. ELYS cafe has no sport
equipment question. The ELYS page has no horizontal overflow at 390 px.

## Guided authoring pages (2026-10-15)

The shared Admin/Owner experience editor now has separate overview pages for
offers, areas and shared facilities, with deliberate reuse and review/save. One
offer or area is edited at a time. All applicable questions, prices and offer
schedules appear openly beneath each other on that subject’s editing page.
No nested offer/group/answer accordions remain. Optional answer conditions use
one disclosure level. Viewing or skipping a question does not create an answer.
The same whole-profile review and authorized submission RPC remain authoritative.

Categorical multi-value questions expose directly selectable answers. Four drinks
and three atmosphere values can coexist and survive reload. Each value is still
stored as its own scoped property; there is no new schema or lossy comma-list.
Single-value choices such as booking or entry mode replace the previous general
selection. Conditional variants, historical free values and unrelated properties
remain intact. The friendly atmosphere label “lebendig” retains the existing
stored value “lebhaft”. Missing knowledge remains distinct from false or not
applicable. Initial blank prices remain blank; explicit zero remains allowed.

Drafts survive changes between the three scoped profile sections. Leaving that
shared profile for other Spot sections or another Spot never discards a draft silently. Save failure
keeps the draft and does not announce success. Explicit discard restores the
latest successfully saved baseline, including saves earlier in the same session.
An invalid persisted profile is still blocked instead of overwritten as empty.
No source import, actor permission, Owner entitlement or moderation rule changes.

The older global authoring fields cannot be deleted in this UI release: the
currently deployed product evaluator still reads context.atmosphere, legacy
cuisine/offering fields, access rules and other global facts. Their existing
pages therefore stay editable and show a clear “Allgemeines Spotprofil” notice.
Scoped offer/area facts are not automatically flattened into that global profile.
Deliberate reuse creates only a target-specific draft and preserves its source.
Retiring these global writers requires a separate consumer migration; a UI-only
hide/delete would leave the current App without maintainable inputs.

Validation: 29 Chromium authoring browser cases, four iPhone/WebKit cases,
82 Admin and 19 Web contract tests, Admin/Web production builds and strict types
passed with synthetic local configuration. Targeted source lint passed (the
shared-code run emits the existing Next pages-directory configuration notice).
Mobile checks cover 320/390 px geometry, more than two simultaneous selections,
serialized save/reload, one disclosure level, failure/retry, deliberate reuse,
old conditional/free values and latest-baseline discard. No production Spot data
was modified by these tests.


### Pending follow-up: prerequisites and physical setting (2026-10-15)

The shared Admin/Owner prerequisite selector treats “Keine Vorkenntnisse” and
“Vorkenntnisse erforderlich” as mutually exclusive. “Begleitung erforderlich”
remains independently selectable. Existing conflicting unconditional answers
are shown with an explicit warning; saved claims are never silently rewritten.
Conditional and historical answers remain intact. This is an authoring guard,
not a new server-side invariant or database migration.

Area `location.setting` now permits explicit “drinnen” / “draussen” independently
of area purpose (boulder area, children's area, café). Existing area types are
not automatically assigned indoor status. The librarian consumes these values
only when linked to the actual requested activity. Deployment is pending.


Sport activity follow-up: sports offer kinds now prioritize their default
activity but allow selecting multiple supported sports activities on the same
offer. A movement-play offer may explicitly include climbing without creating
a second offer or copying the adult bouldering offer's minimum age. No activity
is selected automatically. The café retains its own activity choices. Each
selected activity is stored as a separate scoped experience.activity property;
existing prices, ages, schedules, IDs and conditional facts are retained.


## Universal catalogue 2.0 / registry 2.5 (shipped 2026-10-15)

The canonical `packages/world-knowledge-core/src/spot-catalog.ts` contains 16
groups (15 domain groups and Other), 111 place types, 57 independently composable
offers and 29 independently composable areas. Existing type keys, profile IDs,
properties and conditional values remain valid. Place types describe identity;
they never assert an offer or amenity. Directed subtypes have explicit parents
and curated aliases; neither parent membership nor classification can fabricate
a facility. Catalogue and profile-schema hashes are bound to the 2.5 registry
release. Registry 2.4 and its source policy remain supported for reading.

Admin and Owner use confirmed classification for recommendations, without a
second “Pflegeart” selector. The complete offer/area catalogues remain available
independently of that recommendation. Relevant questions derive from offer/area
modules, not a closed venue category. Existing draft protection, explicit review,
source consent, moderation, authorised RPCs and RLS are preserved.

Stay offers support check-in/out, booking-person minimum age, minimum nights,
occupancy, room type, included meals and correct room/person/site-night price
units. These are offer/area facts, not whole-spot assertions. A booking age must
never become a minimum age for every guest. The librarian conservatively reports
unresolved booking-person age or overnight price quantity/scope; no reservation
availability, room count or cost conversion is invented. Room type can directly
support a scoped `offer.kind` wish. Guest/member-only offers remain qualified
until the requested access is proven.

Migration: `20261015110000_universal_spot_catalog_v2_5.sql`, generated reproducibly
with `npm run world-knowledge:build` and
`node scripts/world-knowledge/generate-universal-catalog-migration.mjs`.
The migration adds accepted 2.5 registry/policies, a versioned validator, and
compatible authoring/resolver dispatch. The old validator and immutable history
remain intact. Category-first authoring is retained; 2.5 permits real combinations
such as Hotel + Restaurant + Wine Bar. No production content backfill occurs.

Rollout order: validate migration in an isolated database, establish the required
production backup/recovery evidence and release approval, apply the migration,
then deploy both Admin and Owner. Do not deploy the new form before the database
accepts the new catalogue. No production deployment or data rewrite was performed
as part of this implementation. The new librarian integration remains in its
existing development branch and is not an activation of the App's older path.


The signed legacy v1 intent policy remains pinned to its previously accepted
2.4 place-type universe. Adding catalogue types must not silently change its
incompatibility lists, policy hash, or active control-plane release. The new
librarian reads the full canonical catalogue independently; activating it is
still a separate rollout.


Validation for the universal catalogue (2026-10-15): 368 World Knowledge tests,
94 existing-engine/format compatibility tests and 142 Luna/Bibliothekar matching
checks passed. The latter ran in the existing Bibliothekar development worktree;
this catalogue PR does not publish or activate that runtime. All 51 shared
Admin/Owner browser scenarios passed, including all 16 catalogue groups, hotel
composition, type search, multiple selections, mobile geometry and save/reload.
Admin and Owner production builds and strict TypeScript checks passed.
The exact generated migration applied successfully to a fresh isolated clone
of the accepted 2.4 database (plus its Sport prerequisite); SQL tests covered
every new type/offer/area and actual Admin/Owner positive and negative access.
All fixtures rolled back. Production was not modified.

Targeted lint reports no new issues. The shared editor has a pre-existing
set-state-in-effect lint error and exhaustive-deps warning on unchanged lines;
the scoped lint check disables only the former rule and still reports the
existing warning. These are recorded baseline findings, not a claim of a clean
repository-wide lint run.


Production publication completed after the Founder explicitly accepted the exact
migration's untested recovery risk on 2026-10-15. Main PR #478, source
`abffaf73635bb227e304c6c16facc1120d2fe9f4`, passed all required gates. The sealed
Main artifact was deployed by run 38731727824; only migration 20261015110000 and
the existing decision-v13 backend were applied. Admin and Owner were held on
their previous domains until database success, then promoted to the matching
Main deployments; their original automatic domain assignment was restored.
The full encrypted database/Storage export succeeded in run 38729513498.
Live read-only checks confirmed registry 2.5, 182 migrations and unchanged
7,508 claims. The authenticated Admin form showed the new universal catalogue
and preserved Consum's saved offering. Full IDs and remaining limitations are
recorded in `docs/operations/releases/UNIVERSAL_SPOT_CATALOG_2026_10_15.json`.
The earlier statements about non-production implementation/test work above
remain historical context; this paragraph records the subsequent publication.


## Clock-order verification correction (shipped 2026-10-15)

Production 25hours authoring failed with verification_binding_invalid. A
synthetic +1 second device clock reproduces the same rejection: the authoritative
writer permits observed_at up to 60 seconds ahead, but the verification trigger
previously rejected any checked_at before observed_at. The forward correction
uses claim.created_at as the server receipt ordering boundary, while preserving
the existing 60-second observation tolerance and the verification future limit.
Original timestamps, content/result hashes, idempotency, actor ownership/admin
checks, source policies, private ACLs and RLS remain unchanged. Verification
before server receipt remains forbidden. No existing claims are rewritten.

Regression coverage exercises the actual Product Admin RPC, Owner writes,
unchanged request replay, excessive future timestamps, foreign Owner/non-admin
denial, anonymous/private ACLs and an explicitly forged pre-receipt verification.
A server-side-only fix lets an open failed form retry without discarding its draft.


The clock-order correction was published from Main source `f8af68d58e4569b456044e4b3c62f3df1dbf9686` through certified production run 38736379377. Read-only checks confirmed migration 20261015122708 and the new server-receipt ordering guard, with private validator ACLs retained. Existing phone drafts can retry against the corrected backend without a frontend reload. Full release identities are recorded in `docs/operations/releases/WORLD_VERIFICATION_CLOCK_FIX_2026_10_15.json`.


## Spot Studio interface redesign (2026-10-15)

The edit route now opens with a task overview: identity/contact, place type,
linked offers and spaces, hours, service, atmosphere, general prices,
reservation/capacity, equipment/access and profile review. Admin and Owner use
one shared layout. Offers, rooms/areas and shared facilities each have an equally
visible numbered main section in the overview, desktop navigation and mobile
section selector. “All areas” also returns to the overview. Offer/area editing
shows all matching questions in one open list. Unknown and not applicable are
directly selectable and remain distinct from negative answers or unanswered
questions. Public-text preparation still requires the existing consent and review.

Admin media/status editing is a separate workspace. Both workspaces stay mounted
so changing between them retains unsaved offer and field drafts. Navigating away
from unsaved authoring is blocked within the editor, and browser unload requests
confirmation. Ordinary field drafts can be explicitly discarded. This is browser
memory protection, not persistent draft storage or a guarantee against tab crashes.
Existing claims, scoped values, links, RPCs, permissions and schema are unchanged.

Validation commands (synthetic fixtures, no production writes):

- `cd web && npx playwright test e2e/world-knowledge-authoring.spec.ts --workers=1`
- `cd web && npx playwright test --config playwright.admin.config.ts`
- `npm --prefix admin-dashboard run test:contracts`
- strict TypeScript and production builds for Web and Admin.

The dedicated Admin Playwright configuration starts its own local server with
synthetic credentials. Screenshots cover 390/1280 px; shared authoring also covers
320 px. UI build success does not itself claim publication to production.


## One authoring location per fact (2026-10-15)

The shared product editor now opens offers, physical spaces and shared facilities
through separate numbered main sections. The former five inner workspace tabs are
removed. Offers have named edit actions; adding a new offer/space is explicit.
A directly reachable save bar submits the whole existing scoped
profile through an explicit save action, including edits in other workspaces. Workspace switching preserves the
same draft. Validation, failed saves and explicit discard retain their previous
semantics. Public source preparation retains its consent and review flow.

`experience-authoring.ts` determines where NEW answers are presented. Physical
access is authored with precise area questions (step-free access and stroller
access); the former catch-all `participation.accessibility` is not offered at
three scopes. Offer participation conditions remain on the offer. Shared WC and
changing-table questions are not repeated when an explicit positive facility is
already present in the general profile. Existing claims at other scopes remain
in their original locations and can be inspected in the open historical-answers section.
No historical property, condition, price or link is automatically migrated,
re-scoped, removed or inferred.

Read-only references show source scope, linked area names, negative and unknown
values and recorded temporal conditions. Only explicitly linked areas appear at
an offer. A step-free entrance never confirms a step-free path to every room.
Facility/entrance claims are no longer offered as copy suggestions into a room;
intentional cuisine/dish reuse remains available. References do not change engine
evidence or matching behavior. Stored schema, registry hashes, RPCs, permissions,
consent and RLS remain unchanged; no database migration is required.

Regression coverage includes all catalogued offer kinds, 320/390/1280 px layouts,
source provenance, conditional negative access, unlinked area exclusion, direct
save/retry, old values at all scopes and original payload preservation.

## Profile status and separate review notices

The shared Admin/Owner editor distinguishes required-field readiness, missing
optional answers, explicitly unknown answers, current snapshot conflicts and
separate open review work items. It deliberately does not calculate a blanket
completion percentage or imply that every offer detail was reviewed. The existing
readiness evaluator determines required field issues; actor-visible contextual
fields determine the optional list. Optional discovery text preparation is not
a completion requirement.

Review notices are grouped by attribute, class and reason codes without changing
or resolving their underlying work items. Concurrent-authority notices explain
that different verified versions within five minutes create a review task, even
during incremental editing. A conflict-free snapshot does not close that task.
Unknown reasons retain an honest generic explanation. Field buttons navigate to
the actual editor and focus the target. Normal optional fields are openly listed. Unsaved drafts
block that navigation. No production Spot facts, review decisions, RPC contracts,
schema or permissions are changed by this UI release.

The status explanation stays expanded on the review screen; the entry overview keeps it behind “Alle Prüfhinweise”.
During field editing it is collapsed behind “Profilstatus ansehen”, preserving
mobile space for the actual form while keeping notice counts discoverable.

## Open question lists and complete section navigation (2026-10-15)

The main editing sequence contains three peer sections for offers, rooms/areas
and shared facilities. Next advances through them in order. The two subordinate
workspace shortcuts are removed. Mobile has the same complete section selector
as desktop navigation. All category-relevant ordinary fields are rendered openly
within their section, including optional general fields. Opening or scrolling
through an unanswered question creates no answer. Only special conditions,
read-only provenance, technical diagnostics and optional source import remain
progressively disclosed.

A single mounted experience editor retains the shared profile draft across
its three main sections; only other field drafts or leaving the profile block
navigation until saved or deliberately discarded. Save submits the same reviewed
whole-profile contract. No schema, access, entitlement, moderation or ranking
changes are introduced.

## Contextual guidance and direct saving (2026-10-15)

Ordinary manual Spot editing uses the explicit Save or Save & Next action as
the review assertion; there is no repeated confirmation checkbox. Local profile
validation, reviewed=true submission, actor authorization and reader verification
remain mandatory. Optional AI source preparation retains its separate consent
and review controls unchanged.

Save & Next validates and awaits successful saving before advancing. Validation,
network or reader-confirmation failures preserve the draft and prevent advancement.
An unchanged profile advances without another write. Draft comparison ignores the
review marker and object-key insertion order; restoring a field to its saved value
clears the false dirty state. Repeated saving is guarded during the in-flight call.
The experience profile uses its own status bar rather than an old generic
“Bestätigt” badge that could incorrectly appear beside a newer unsaved draft.

Hotel-guest audience choices require an explicit stay category, stay offer module
or confirmed stay place type. Historical answers remain preserved if no longer
in the contextual choices. Named dishes remain single food.dish values, not
automatically interpreted descriptions. The field explains this distinction.

Offer hours describe availability of that particular service, such as lunch
11:00–14:00 within restaurant opening hours of 11:00–23:00. Known weekly Spot
hours can be copied only by an explicit action, with existing offer rows protected
against replacement. Empty schedules remain unknown. Seasonal validity dates are
labelled separately. No shared data contract, schema, access or ranking changes.

### Save feedback and offering clarity (2026-10-15)

Successful save toasts dismiss after two seconds, restarting for repeated saves.
Errors and navigation guards remain actionable. Experience-profile saves check
both the rebuilt manifest and the exact returned profile contents before showing
success. The child draft and its parent value adopt the same confirmed baseline.
A failed or mismatched read-back retains the draft and reports the concrete cause.
The reported Basso screenshot could not be reproduced as a lost write: the live
claim and a fresh authenticated editor both contained all five offerings. This
change must not be represented as proof of the original screenshot's cause.

Offer cards explicitly distinguish an existing service from unknown details.
Adding a service does not require every detail to be filled; prices, hours and
rules remain scoped to that service, and shared rooms are described once.
For new selections the redundant GASTRONOMY choice is hidden; stored claims are
preserved. FULL_MEAL is labelled “Essen (ohne Trennung nach Mahlzeit)” as an
alternative to specific meal cards. OTHER remains a missing-service fallback;
its name alone does not infer structured properties.

“Clubabend / Tanzen” is an explicit authoring preset over the existing EVENT
storage kind with a KNOWN experience.activity=Tanzen property. It is available
in the universal NIGHTLIFE offer group, regardless of a spot's primary category.
It is not MUSIC_EVENT or PRIVATE_CELEBRATION. The shared language version 5
normalizes Clubabend and Tanzen to dancing, separate from music_event and party.
EVENT alone never implies dancing; only the confirmed scoped property does.
Venue classification (e.g. NIGHTCLUB) remains a separate, explicit fact. No stored
Basso facts or other production claims are rewritten, and no database schema,
consent, permissions, or Owner tier boundaries change.


### Guided profile entry and current worklist status (2026-10-15)

The shared entry opens with one primary action, “Profil einrichten” or “Profil
weiterbearbeiten”. The next required actor-visible issue is selected in section
order and opens its field directly. With no required issue, the action opens
Offers. Counts describe stored offers and areas, not completeness. An unreadable
stored profile is labelled for review rather than represented as empty.

The entry uses a neutral, compact section list with numbered rows. There are no
permanently highlighted offers/areas/shared rows and no selected sidebar item
while viewing the overview. Technical audit details and optional global gaps are
available under “Alle Prüfhinweise” and on the review screen. Existing precise
correction links, review tasks, draft guards, Owner entitlements and source
consent remain intact. Introductory text and section descriptions name editable
content rather than backend concepts.

The Admin spot list no longer calls admin_spot_readiness_worklist_v1 or displays
legacy Gold coverage percentages and gaps. It reads the existing authenticated
world_product_authoring_detail_v1 and applies the same core required-field
readiness evaluator as the editor. It distinguishes missing required facts,
current snapshot conflicts, unreadable offerings, and unavailable status.
“Grunddaten vorhanden” does not claim a complete or verified experience profile;
the adjacent offer count or absence states what is actually stored.

Only 25 visible spots are evaluated per page, with four workers per page load.
Responses from an obsolete search/page/refresh are ignored. Focus, return to a
visible tab, a same-window confirmed editor save, or the refresh button reload
status. Failed reads replace the current batch with an honest unavailable state;
old scores are never used as fallback. This uses existing RPCs and permissions,
with no database migration or production fact mutations.
