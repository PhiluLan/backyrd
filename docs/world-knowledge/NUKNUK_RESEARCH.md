# Local Nuknuk Spot Research v4.0

Status: **experimental, draft-only; not ready for unattended research or catalog writes**.
This is a product-target correction, not a new model training run. Existing local
9B/27B weights, privacy controls, canonical World contracts and Decision remain unchanged.

The normative research assignment is [Backyrd-Rechercheanleitung](NUKNUK_RESEARCH_METHOD.md)
(`backyrd.research-method@1.0`). Model results must be evaluated against it;
software-test success alone is not research quality.

## Active target and workflow

Research the place and its real visitor experience: identity, visit services,
physical areas, supported relationships, opening/kitchen/offer times, comparable
prices with units, access, booking, children/pets, amenities, travel and sourced
character. Place types prioritize questions; they never assert an offer or amenity,
and never forbid an explicitly evidenced cross-category service.

`nuknuk-spot-plan.ts` reads the canonical catalogs and scoped property definitions.
The default manifest now includes identity/classification, `experience.profile`,
venue and kitchen hours, reservation, amenities, step-free entrance, pets and phone.
Other researchable World fields can be explicitly requested (12 per run).
Existing simple known values remain preserved. An existing scoped experience
profile can receive a **partial review supplement** with its `currentValue`
attached; no code replaces or imports the stored profile.

The local model tasks are separated: physical AREAs, visitor OFFERs, scoped
properties/relationships/prices/times, general fields, then a separate critic.
Each source has bounded entity/property slots and a bounded overall request/time
budget. Source excerpts exclude pre-title navigation, dated events and visitor
reviews. Physical-area/group-service pages can be read in profile mode; account,
transaction, payment, shop and privacy paths remain excluded. Menu/PDF/OCR
inspection is operator opt-in and cannot append menu products as profile offers.

A dish may be `food.dish` on an independently evidenced dining service. Never
make one offer per dish, beer, coffee, room amenity or menu heading. No inferred
vegan/gluten-free claims, access rules, availability or community Moods.

Literal evidence, source hashes, canonical value validation, ownership, scope and
critic decisions are separate checks. Unknown/conditional/dated/conflicting facts
remain in the local review ledger; unknown never becomes false or a closed day.
Offer times preserve evidenced weekdays. Prices retain currency/unit/inclusions;
no minimum/maximum meal budget is calculated from unrelated menu prices.
`uniqueItems` is removed only from the local generation grammar because the
installed llguidance decoder cannot compile it. Canonical validation still checks
uniqueness. A decoder/schema error is a visible failure, never successful research.

## v4.44: compatible diets and published PDF download widgets

Positive, current, unconditional vegan and vegetarian options in the same offer
are additive. Projection retains both original statements and their citations;
coverage uses the same compatibility rule instead of reporting a false conflict.
Negations, exclusivity and conditions still require separate review. This does
not infer a diet from ingredients. The founder's Marmaris clarification accepts
a meat-quality description as a cuisine hint; this repair does not remove it.

Menu discovery also reads inert JSON for visible CMS file-download buttons.
The widget identity and label must match the actual page button. No website
script is executed. Only the published asset URL is used; an HTTP PDF asset may
be requested at the identical HTTPS host/path, with existing public-URL and DNS
checks preserved. Private, authenticated and legal-document targets stay excluded.

A PDF without embedded text now reaches the existing bounded page OCR/layout
audit (at most 20 pages, 180 seconds per document) instead of failing before OCR.
Page markers, source URL, timestamp, PDF hash and audit are retained. The agent
reuses an audit only for the exact URL and document hash, avoiding duplicate OCR.
Partial reads remain marked truncated. Layout review remains required; OCR and
item-price pairs are review evidence, not certified offer budgets or automatic
canonical writes. The local OCR tools and language data remain prerequisites.

Validation: 811 runtime tests plus strict build; replay of the immutable Marmaris
v4.43 accepted ledger preserves vegan and vegetarian options with citations.
The official German (4 pages) and English (6 pages) scanned menus were downloaded
and OCR/layout-read in full. This is a real source-tool test and frozen-fact replay,
not a new model research run or a quality claim about all restaurant PDFs.

## Quality and readiness

Reports expose `spotCoverage`: visitor offers, physical areas, scoped properties,
explicit relationships, held candidates, unresolved fields and conflicts. All
reports still state `complete:false`, `importable:false`, `canonicalWrite:false`.
These are coverage counts, not an accuracy estimate. Menu item counts are not a
success metric.

`evaluateNuknukSpotAudit` requires an explicit judgment for **every proposed
assertion** and every reference check. Missing judgments are errors. Empty output
retains all missed expected facts. The v4 readiness CLI requires both the existing
field audit and `spotReferencePath` / `spotAssessmentsPath`; a green legacy menu
or field-only audit cannot authorize unattended v4 research. References must cover
offers, areas and practical properties/rules/times and precede the model run.
The balanced 12-spot cohort, no-false-fact/no-wrong-scope requirements and all
catalog-write prohibitions remain closed until actually satisfied.

Validation and development measurements for this change are recorded below after
completion. Runtime reports, source snapshots, authenticated exports and raw model
traces belong only in ignored local storage, never Git.

## Fischerstube draft withdrawal

The v3.70 draft with eight dishes and no areas/properties is a product-quality
failure. Its active Admin review item was withdrawn on 2026-10-21 using a conditional
update of that exact draft ID/digest: status `FAILED`, failure code
`DRAFT_WITHDRAWN_PRODUCT_SCOPE_INVALID`. Original result and digest remain intact;
withdrawal reason, timestamp and AI actor are recorded in its metadata. No human
reviewer is impersonated and no canonical Spot claim was changed. A read-back
confirmed it no longer matches the active review query. No schema change or
migration was needed.

## Historical evidence

The record below describes older menu-oriented development. Dish totals and
correct menu transcription in those reports do **not** establish v4 Spot quality.

# Historical menu-oriented research record

Status: experimental local evidence-backed review drafts for existing Spots. No automatic
publication, production enrichment worker or import-ready batch.

The independent v3.57 food cases failed. Alchemist found the current autumn
menu PDF but proposed its `Herbst` cover label as a food offer and missed the
explicit lunch offer; ingredient and group-service lines were correctly held
for review. Acero proposed generic products, typed coffee drinks as food,
missed its recurring Pasta Night and Sunday brunch, and left regular hours
unresolved. Indexed Acero page copies suggested a closing-time conflict;
fresh retrieval later showed that comparison was stale. Neither case is a
quality pass. Their reference checks were recorded before the model calls;
reports and authenticated exports stay in ignored local storage.

v3.58 separates literal seasonal PDF menu rows from cover labels and prices,
keeps a priced three- or five-course menu only with its explicit group
prerequisite, admits a precise adjacent weekday/time condition for a meal
offer, and rejects broad food/drink class labels as named products. A named,
non-seasonal hours section may be read despite unrelated seasonal content on
the same page. Remaining open fields continue source discovery after another
field has accepted facts. PDF-derived items remain layout-review drafts;
conflicting hours and absent closing times must stay unresolved. Development
replays of Alchemist and Acero and an independent Amber Bar case are used to
assess these changes. No autonomous release gate is opened by unit tests.

The Alchemist v3.58 development replay used twelve source requests and eight
model calls in 311 seconds. Its review draft contains the literal lunch menu
with the stated Monday-Friday 11:30-13:30 schedule, three named surprise
menus with the two-person whole-table prerequisite, and four current food
items from the operator's autumn PDF. `Herbst` and PDF price labels no longer
appear as offers. This is a tuned rerun of a failed blind case, not new
independent accuracy evidence. The autumn dishes have no verified expiry date
in the profile; a reviewer must resolve their seasonal validity before any
catalog update.

Amber Bar was frozen as an independent DRINKS case before any v3.58 model
call. The end-to-end run took seven source requests, four model calls and
233 seconds. It returned all six pre-recorded signature cocktails plus two
more literal cocktails from the same first-party menu, with no wine vintage,
ingredient or generic heading as an offer. Regular hours remained unresolved
because the operator provides opening starts but no closing times. Two
unnecessary external directories returned HTTP 403; they supplied no accepted
facts. This is a narrow independent pass for drink offers and honest hours
abstention, not evidence of autonomous parity across Spot types.

Acero's v3.58 development replay still failed: it stopped after the homepage
and returned only generic food classes. It held the correctly identified
`Pasta Night` and `Sonntags-Brunch` because it could not represent their
recurring weekday conditions. It proposed the homepage's Bistro hours without
consulting a second official page to cross-check Tuesday-Thursday closing
time. v3.59 retains literal weekday/daypart conditions as review-only
offer details, types those named meal offers as DINNER and BRUNCH, and keeps
discovery open after homepage-only food or hours evidence. Apparent source
conflicts must be checked against current pages. These changes need an end-to-end replay;
passing a synthetic regression is insufficient.

The v3.59 Acero replay found the two named recurring meals with their
weekday/daypart conditions. It still returned the homepage's 18:30 closing
time: a second product page repeated the same site-wide hours header, and the
crawl stopped before reading the official contact page. An older search-index
copy of that page said 20:00, but fresh direct retrieval later said 18:30. It
also labelled `Bio-Kaffee` and `Cioccolata Calda` as food. v3.60 requires a
distinct contact/hours page or a third official page before treating a
homepage schedule as cross-checked, prioritizes contact/hours links in that
case, and recognizes these literal drink names. Acero remains a failed
development case until the full v3.60 run verifies both corrections.

The v3.60 Acero development replay reached the operator's contact page in
four requests and five model calls (382 seconds). It retained Pasta Night on
Friday/Saturday evenings and Sonntags-Brunch on Sunday, and typed Bio-Kaffee
and Cioccolata Calda as drinks. Its Tuesday-Thursday 18:30 Bistro close is
consistent with fresh direct retrieval of the homepage, contact and shop
pages on 21 October. The older 20:00 conflict came from stale indexed results;
the pre-run reference for that criterion cannot score current model accuracy.
Generic food classes still dominate the partial profile, so Acero remains a
development case rather than parity evidence. Future references must be
frozen from fresh page bytes, not search-result snippets.

The independent v3.60 Restaurant Stucki case used a fresh authenticated
export and freshly checked operator-page bytes before the model ran. It
correctly returned no active menu or regular hours for the restaurant, which
the operator says has been closed for renovation since 28 September 2026.
However, it took twelve source requests and seven model calls, including
pre-closure menu PDFs and unsupported press ZIP files. This is a narrow
false-assertion pass and a source-planning failure. v3.61 now recognizes an
exact current whole-venue closure only when the first-party source matches
the stored venue name and street address, the literal closure start date is
not in the future, and the source text/hash match. It keeps affected profile,
offering and hours fields unresolved with the closure citation and stops
menu discovery when only those fields were requested. The World contract has
no dedicated temporary-closure claim here, so the reason is review evidence,
not a canonical closed-state write. This development retest must be measured
separately; it does not turn the tuned case into another blind pass.

The v3.61 Stucki development replay, using the same export and current
first-party contact page, stopped after one request in 645 ms with zero model
calls and zero source failures. Both requested fields remained unresolved with
the exact renovation-closure sentence and source hash in review evidence.
Neither the old summer menu nor ZIP archives were fetched. This verifies the
specific safety and efficiency repair on an already seen case; a new closed
venue and broader open-venue cohort are still needed before autonomous use.

The independent v3.61 roots case failed its food-profile check. It read the
current operator menu but returned four headings from the wine-list contents
page as GASTRONOMY offers and missed all seven literal course-count options.
The current weekly hours, including both Thursday intervals, were correct.
v3.62 excludes wine inventories from line-level offer projection, detects
contents pages, ranks a dedicated food-menu page ahead of wine and snapshot
PDFs, and constructs price-free DINNER/LUNCH review offers from exact priced
course rows. Thursday business-lunch options retain a weekday condition.
Saved-source replay yields the seven named options. The v3.63 full local-model
development run also returned all seven variants and the correct weekly hours
after two first-party requests and three model calls (69.6 seconds), compared
with twelve requests and six model calls in the v3.62 development run. It
remains a tuned replay of the failed roots case, not an independent pass.

The next independent v3.63 case, ¡Che, que lomo!, failed its hours check:
Nuknuk read the official homepage but rejected its three complete hours rows
because the CMS-extracted body omitted the restaurant name. It returned only
the lunch-only footer from the menu page. The official page states Tuesday to
Saturday evening hours, Wednesday to Friday lunch, kitchen closing thirty
minutes earlier, and future holidays starting 24 December 2026. v3.64 can
certify a literal hours section on the exact first-party domain when the
domain matches the spot name and the page contains the stored street address.
It stops hours discovery once every parseable row in that section is accepted;
missing days remain unspecified, not falsely marked closed. The v3.64
development replay recovered all five published open days and their intervals
from two HTML pages, with three requests and four model calls. The third
request was a linked 30 MB menu PDF rejected by the source-size limit; eight
literal dishes from the HTML menu entered the review draft. This is a repaired
case, not a new blind pass or proof of autonomous research readiness.

The independent v3.64 25hours Hotel Zürich Langstrasse run found all five
current room categories from the exact operator room overview and did not
mistake its NENI restaurant, Cinchona Bar, event rooms or other Zürich hotel
for a room. The whole run still failed its time budget after seven requests
and twelve model calls: `offering.groups` kept it searching for hotel-wide
food/drink groups even though the evidence described embedded restaurant,
bar and in-room services. v3.65 returns that flat field unresolved with
`HOTEL_ONSITE_OFFERING_RELATIONSHIP_REQUIRED` and stops pursuing it for hotels.
The current local adapter does not yet propose the scoped `offering.onsite`
contract, so this is an honest limit, not full hotel research parity.
An attempted v3.65 development replay was stopped after confirming that a
generic “Zimmerausstattung” heading kept the complete German room overview
open. Its interrupted report is not a successful validation run. v3.66 excludes
room-amenity headings from inventory completeness and lets a complete official
room-card overview end the hotel-profile crawl even if the semantic model has
withheld some individual room facts; exact cards still enter only a review
draft with source citations.
The complete v3.66 local-model replay returned the same five literal hotel
room names, no false rooms and the explicit scoped-field limitation after
212 seconds, three requests and three model calls. Only the two official hotel
pages supplied accepted source text. The third request followed a stale 2024
availability form and returned empty; v3.67 filters booking/availability URLs
and dated booking parameters from the research frontier. This final link
filter has a deterministic regression test but no separate full-model replay.

The independent v3.67 Amani’s Afghan Cuisine case used a current authenticated
Spot export and a source reference frozen before the model call. Nuknuk found
eight literal dishes in the first-party German menu PDF and the correct weekly
hours for Güterstrasse 100, without publishing the different hours for the
Alte Markthalle branch. However, it rejected every hours row on the shared
homepage as belonging to the other branch, then recovered the target hours
from the dedicated `/cuisine` page. Twelve requests, nine model calls and
219.5 seconds made that a narrow content pass with an inefficient identity
path, not an autonomous-research pass. The menu PDF is linked by the current
official page but has an older upload path; a reviewer must check menu
currency before applying the offer draft.

v3.68 pairs a complete first-party priced PDF menu with bounded food discovery,
skips an already-read menu's translated PDF, and excludes legal, imprint and
sample-blog pages from the frontier. Its critic sees the nearest literal street
address for each claim on shared multi-branch pages, including whether that
address is before or after the quoted claim. This is evidence for the model,
not automatic branch approval. In the full Amani development replay the model
accepted the three restaurant hours rows directly from the homepage and
rejected the three Alte Markthalle rows. The final review draft again held the
same eight cited dishes and correct seven-day schedule. It used eight requests
and five model calls in 151.6 seconds; one unrelated external directory failed
to load. This is a tuned replay of the same Spot, not a second independent pass.
The broader autonomous release gate remains closed.

On 21 October 2026, a previously untouched Odelya Hotel run against a
pre-recorded official-source reference failed: it found public phone and email,
but missed the attic apartment and supported amenities, added a booking link
and a form label as room types, and exhausted 900 seconds after eleven requests.
This is a failed blind case. v3.52 pairs lodging overview headings with their
own descriptions, rejects booking controls as room cards, recognizes hotel
service links as amenity sources, excludes meeting/seminar paths from overnight
research, and admits only exact venue-owned Wi-Fi and paid on-property parking
statements into review evidence. Replaying the saved Odelya pages yields five
literal room-category leads and no booking-control leads; this replay is a tuned
development check, not a new blind pass. The independent release cohort gate
remains closed; no autonomous publication or canonical Spot writes are enabled.

The independent Hotel du Commerce run correctly withheld every unsupported
field when its official site served only a maintenance page; that is a narrow
source-boundary pass. The independent Nouri Hotel v3.52 run failed after 900
seconds: it fetched the official seven-room inventory but returned all five
requested fields unresolved. Its detail pages lacked the full hotel name, and
the compact inventory cards and inclusion list were not understood. v3.53
reads only repeated, literal room cards on a dedicated official room overview
and exact hotel inclusion-list labels for Wi-Fi and breakfast; a paid, on-site
garage sentence supports parking without importing its price. Replaying the
saved Nouri overview yields the seven exact room names, Wi-Fi, breakfast and
parking. That replay is a tuned development check, not an independent pass.
The release gate remains closed pending new blind cases.

The next independent B&B HOTEL Basel v3.53 run also failed. The catalog's
website was a chain-wide service article; Nuknuk found official search results
but treated that article's path as the Basel branch path and discarded the
actual branch page. No wrong-branch facts were proposed. v3.54 treats an
explicit service article as an unscoped same-host discovery seed while requiring
the exact Spot name and stored street address in a bounded branch source before
any fact can pass. The HTML reader selects a branch's schema.org Hotel block
when the site lacks `<main>`, avoiding global navigation and corporate footer.
Saved-page replay exposes the exact Basel branch email, paid garage, Wi-Fi and
breakfast buffet. This is a tuned development replay; independent parity is
still unproven.

The first v3.54 B&B development replay was stopped after it spent its initial
model calls on a chain-wide contact page, FAQ and city-level parking page.
v3.55 permits follow-up pages from an unscoped chain service seed only when
the URL contains the exact city segment, defers model extraction from pages
without matching branch name and address, and requires both identifiers near
the beginning of the branch excerpt. This is a retrieval and cost fix; its
end-to-end outcome must be checked separately.

The v3.55 B&B development replay reached the exact Basel branch in two
requests and returned its branch email, breakfast and paid garage correctly.
It left general opening hours and laptop policy unresolved, as required.
It still missed hotel-wide Wi-Fi because the service-list heading and a
hyphenated WLAN sentence escaped the exact facility parser. v3.56 recognizes
these explicit venue-wide formulations and ignores a bare `WLAN gratis` label
inside a room card as whole-hotel proof. This saved-page replay must not count
as an independent hotel pass.

The independent Airport Hotel Basel v3.56 case passed its narrow overnight
inventory check: all three pre-recorded room types were returned with exact
official citations, no extra room names and no dynamic room prices. The
independent 25hours Hotel Zürich Langstrasse v3.56 case failed: it omitted
Medium, Large and Extra Large and mislabeled `All room amenities` as a room.
v3.57 groups repeated same-level room cards by their own size, description and
booking control, including literal short names without a room noun. It stops
at the amenity section. Saved English and German Langstrasse pages now replay
to the same five exact room names; this is tuned development evidence, not
a new blind pass. The autonomous release gate stays closed.

The user decision is whether a sourced addition belongs in an existing Spot.
The fallback is manual research and the canonical Admin preview/commit flow.
Invented facts, wrong branches, offer-to-Spot inference, silent overwrites and
model self-approval are unacceptable. Grounding establishes where text came
from, not that the source or its interpretation is correct.

## Active architecture: Research v3.68

Task class: FAST_PR. Owned paths: the local research adapter, public-source
reader, CLI, their tests and this document. No runtime client, shared catalog,
production worker, database, migration, import authority or model weight changes.
The CLI now uses `researchSpotV2` in `src/nuknuk-agent.ts`; the v9 field extractor
remains an API/regression reference, not the CLI execution path. The typed local adapter compiles to ignored `dist/` JavaScript for compatibility
with the repository’s Node 20 CI. Build and typecheck the adapter:

Version 3.1 keeps exact page text near both ends of long official pages, with
an explicit marker for omitted middle text. It pairs culture-offer headings
with their own descriptions, prefers a restaurant's menu and a dedicated
site's homepage over news or legal pages, and falls back to Yahoo/Yep through
the local SearXNG service when its default engines fail. Search results remain
leads only. Deterministic checks withhold museum collection objects presented
as exhibitions, food categories presented as dishes, hotel ancillary services
presented as rooms, contact links presented as tours, and promotional copy
presented as description. A description may test three exact original
sentences; the first semantically supported, non-promotional one is proposed.
Named sauna rows on official wellness overview tables are paired with their
own temperature and description before semantic checking; a general page
heading cannot stand in for a named sauna.
Facts receive unique IDs when entered into the ledger, including after unused
description candidates. Missing or duplicated critic IDs hold only the affected
facts and are visible as verification errors; they never approve a claim.
Accessible HTML tab labels are paired with their matching pane text so hotel
room categories can be checked against their own descriptions. A v3.1 review
profile may contain up to eight distinct cited offers; it still reports partial
coverage and cannot certify a complete inventory.
All proposals still require human review and have no catalog write path.

v3.2 keeps searching cultural offers after the first few accepted facts. Search
looks for visitor workshops and ateliers by name, and standing programme pages
under an official site's event directory can be used only when their recurring
intro is separate from dated individual events. The literal H1 and programme
intro stay in one evidence block even when logistics appear between them.
Private-event planning pages are excluded from ordinary cultural Spot offers;
individual dated workshop themes remain ineligible. Once a German cultural
source has been read, English/French/Italian follow-up pages are deferred to
avoid spending the bounded budget on duplicate-language offers. Cultural
search runs after each relevant page while the question remains open. These
retrieval policies improve coverage but do not establish a complete inventory.

On 20 October 2026, the pinned 27B model completed a full aquabasilea run
against six current official pages in 522 seconds: eleven model calls, no
source or model failures, no duplicate fact IDs. The partial review profile
contained Sprudelgrotte (bathing), Sugaring and Hamam Rundgang (spa), and
Finnsauna (sauna), each supported by the relevant official page. This is one
reviewed case, not a release-cohort pass or a complete offer inventory.
An untouched Volkshaus Basel hotel run found only two of six independently
listed room categories and exhausted its request budget on meeting-room and
duplicate-language pages. v3.1 pairs accessible room tabs with their panes,
keeps the more specific name when a tab and its own description name the same
room, and selects the main hotel overview first. The same Spot then yielded
all six categories from two official pages in 231 seconds with no model or
source failures. That tuned retest cannot count as a held-out release case.
An untouched Kunstmuseum Basel culture run, compared with a reference written
before the model run, missed four known offering groups. A tuned full-site run
reached the official public-visit and two recurring-workshop pages, accepted
the recurring Offenes Atelier and excluded its dated themes, but still missed
public tours and Kinderworkshops. It also promoted generic school-programme
price headings into offers and timed out after eight pages, fifteen model
calls and 720 seconds. The v3.2 reader now joins adjacent offer names and
admission prices, permits a quoted scheduling caveat for a demonstrably
recurring programme while withholding age restrictions, and rejects bare
programme price/language headings. These changes require a fresh end-to-end
retest; the tuned case is not a held-out release pass. The unattended-draft
release gate remains closed.
The v3.2 targeted interpretation check on the official visit-planning and
Kinderworkshops pages completed in 189 seconds with two page requests, four
model calls and no source/model errors. It proposed Öffentliche Führung,
Private Führungen and Kinderworkshops with exact first-party evidence; dated
workshop themes were withheld. The two-page test deliberately bypassed source
discovery and therefore cannot substitute for an unattended full crawl or the
pre-run-reference cohort gate.

On 20 October, an untouched ART HOUSE Basel run was compared with an official
room-list reference fixed before the run. It found all seven current room
categories in three HTTP requests and 201 seconds, but wrongly added the
"Urban Wellness Retreat" package as an eighth room. The deterministic
overnight-offer boundary now requires a named accommodation unit or a room
tab with its own description and rejects package/retreat labels. Rechecking
the saved original evidence leaves exactly the seven room categories; that
replay is a tuned fix, not a new blind pass.

The next untouched Amber Bar run found zero of six pre-recorded signature
cocktails, even though the official menu page was fetched, and correctly
abstained on regular hours because the website gives start times only. The
27B extractor chose broad drink labels and wine producers from the long menu.
v3.3 now pairs literal priced cocktail rows with their own ingredient lines
under an explicit drink section, including Swiss `20.–` notation. The model
still checks the resulting names and venue scope. Search hits receive only
topics visible in their URL/title; they no longer claim to answer every open
question. A filtered official page whose every meaningful line is already
present on a previously read version skips redundant model work. The tuned
Amber end-to-end retest proposed all six signature cocktails plus two other
named cocktails, with no invented closing time, in five HTTP requests and
255 seconds. A final v3.3 full-site retest including the search-topic change
read only the homepage, hours page and complete menu, then proposed the same
eight named cocktails while leaving hours unresolved: three requests, four
model calls and 236 seconds, with no source or model errors. Neither tuned
retest counts toward the untouched release cohort; the unattended-draft gate
remains closed.

The formal pre-run-reference gate over these two untouched cases reports
`readyForUnattendedDrafts=false`: one false assertion (the hotel package),
six known facts missed (the signature cocktails), zero source failures and
zero late references. The sample also lacks the required twelve Spots and
category balance. Later tuned successes do not erase those blind failures.

The follow-up hotel coverage check reads an observed room inventory overview
even after a numeric offer threshold is met. A tuned full run then found all
seven ART HOUSE room categories without a package, using five requests and
seven model calls in 396 seconds. Pairing each overview card's exact heading
with its own description produced the same seven in a further tuned run with
three requests and five calls in 349 seconds, without source or model errors.
The site repeats those seven headings on its German edition; a conservative
same-host, same-path inventory comparison skips another model check only when
every name is identical and already accepted. Its localized booking-button
headings are excluded. The rule passes unit checks against changed lists and
the saved real source replay; an end-to-end latency result after this last
skip correction has not yet been measured.

Airport Hotel Basel is a development regression case with three official
room categories. Earlier local v2.4 runs used this Spot, so the reference
prepared before the v3.4 comparison does not make it a new blind case.
The current-code baseline found all three
but falsely added a twin-bed choice mentioned inside Business Zimmer as a
fourth room. The fixed six-offer target then kept crawling unrelated service,
contact and package pages until its eight-request budget expired after 540
seconds. v3.4 requires a room offer to have its own heading, named row or an
explicit quoted room list; a bedding choice inside another room's amenities
cannot qualify. A complete, untruncated official room inventory can close
hotel research at its actual number of accepted categories, even if fewer
than six. The tuned full-site retest returned only Business Zimmer, Executive
Zimmer and Familienzimmer from the homepage and official room overview in
two requests, three model calls and 132 seconds, with no model/source errors.
Rechecking the saved baseline evidence under v3.4 also holds the twin-bed
choice while retaining only the three named rooms.
Neither Airport run counts toward the release cohort. The two untouched
cases still leave the formal gate closed: one false assertion, six missed
facts, and insufficient category-balanced coverage.

The older Kunstmuseum Basel full crawl spent several model calls on
`targetId`/`typeId` views of the same programme page before opening the
unfiltered overview, then timed out. The overview is an observed link on
both the official homepage and visitor-planning page. v3.4 ranks that
overview before its observed filter variants while keeping a filtered page
eligible when it contains distinct rows. A focused ranking regression and
live public-link check cover this retrieval change. The complete model crawl
then read ten official requests, used fifteen model calls and stopped at its
request limit with no source/model failures. It found the pre-run reference's
public and private tours, monthly Kinderworkshops and monthly Offenes Atelier.
It also incorrectly named ordinary hospitality prose ("macht Platz") as a
self-guided experience. The general cultural-offer floor now requires a
recognizable visitor activity name or its own source heading for a
self-guided visit. Reapplying that deterministic floor to the saved, real
model evidence removes the false item and yields eight cited offers including
all four reference groups; this is a tuned replay, not a blind release pass.
The request-budget stop and wider category coverage still need improvement.

A new, independently pre-referenced Café Frühling run read the operator's
English and German venue pages after a same-host English redirect. It finished
in 166 seconds with three HTTP requests, four model calls, no failures and no
budget stop. Its sole proposed food item was the literal combined phrase
"Zimt- und Kardamomschnecken". It missed at least four other specifically
named items on the venue page: Sauerteigbrot, Quiche, Espresso and
Filterkaffee. The old food-source floor required a separate menu or price for
one-word items even when the café explicitly named them in its own serving
prose. This is a blind omission, not a release pass. A general scoped floor
now permits that venue prose only under the exact venue heading and a local
serving statement; shop and sibling-café sections remain excluded. Its model
retest found Sauerteigbrot, Quiche, the combined Zimt- und Kardamomschnecken,
Espresso and Filterkaffee in two HTTP requests and 113 seconds without failures.
The same local model marked both coffees as food. An exact-name beverage rule
now corrects unambiguous coffee drinks to `DRINKS`; rechecking the saved real
evidence yields the right five offer kinds. This last correction is a replay,
not a further end-to-end result. The unattended gate remains closed.

A separate untouched Restaurant Alexander run found three named items from
four official HTML pages in 159 seconds. Its pre-run reference also lists
Fondue, Rösti and Borschtsch from literal cuisine lines on the homepage.
Those one-word foods were withheld because the old cuisine-list parser did
not tolerate decorative emojis before the dash. The general literal-list
rule now does; the original saved model facts pass the corrected floor.
This correction still needs an end-to-end retest. The detailed 2026 menu is
published as images, whose text this run did not read. Filename text is not
menu evidence and image OCR alone would require layout review.

The v3.5 targeted one-page model retest of Alexander produced seven literal,
supported offers, including Fondue, Rösti and Borschtsch, in 129 seconds.
The extractor had marked individual list entries as whole-venue TARGET facts;
the same model's critic rejected them. A source-bound normalization now labels
literal dish names in an explicit cuisine list as OFFER before criticism.
Connective and suitability prose cannot become offer names. This was a
targeted development test with a one-request stop, not an unattended full
crawl. A separate full v3.4 retest still had a transient local-search engine
failure and proposed only two items. Neither is a release pass.

The three formal, untouched pre-run-reference cases (ART HOUSE Basel, Amber
Bar and Restaurant Alexander) leave the unattended-draft gate closed: one
false hotel-room assertion, at least nine missed facts, no late references,
and no independent culture/activity cases. Café Frühling has a pre-run
reference and a clear blind omission, but its initial reference was not in
the formal audit schema, so it is reported separately rather than inserted
retroactively into the formal cohort.

v3.6 adds an optional, read-only audit for image-only menus. Set
`"inspectMenuImages": true` in a local research manifest to inspect up to 24
images actually embedded on a fetched official menu page. The local macOS
Vision reader and Tesseract independently read each image; a priced-row lead
is retained only when both readers agree on its literal name and price at the
same visual row. Each lead stores its official parent URL, image URL, asset
hash and Vision coordinates. The audit has a 60-second bound and records
truncation and source failures. No OCR row becomes a catalog fact or an
`experience.profile` offer; multi-line names, size variants and adjacent
columns still require a separate layout/identity decision. The CLI remains
draft-only, and the unattended gate remains closed.

A live read-only audit of Restaurant Alexander's official menu found all 21
embedded images without fetch failures. The first three were cover, allergen
and hours pages, so the former four-image preview could hardly inspect the
menu. Joining same-column name continuations and rejecting dangling text or
priced add-ons yields 31 cross-reader priced-row *candidates*. The audit also
retains 1,162 Vision lines with coordinates and 958 Tesseract lines for later
layout comparison. Some item names and dietary labels still need independent
interpretation, and several dishes repeat on different pages. This is a
coverage diagnostic, not 31 verified dishes. The local command is:

```sh
NUKNUK_TESSDATA_DIR=.local/nuknuk-research/tessdata \
NUKNUK_OCR_LANGUAGES=ukr+deu+eng \
node scripts/world-knowledge/nuknuk-menu-audit.mjs \
  https://www.restaurant-alexander-bs.ch/speisekarte \
  .local/nuknuk-research/alexander-menu-audit.json
```

Keep OCR language weights and resulting image audit reports under ignored
`.local/`. On macOS, Vision needs no downloaded model; Tesseract requires the
matching local language data. These weights are not committed or uploaded.
Before offer extraction can use these leads, a reviewer or layout-aware local
model must separate complete dish names, descriptions, options, prices and
section headers, then independently check venue identity and official scope.

v3.7 adds that bounded layout-aware step for image menus. The pinned local 27B
model reads up to four selected official menu images; each proposed name and
price must match a separate Vision same-row check or a Tesseract text row.
Uncorroborated rows, generic headings and ambiguous slash variants stay in the
image audit. Corroborated names can enter an **unreviewed**, partial
`experience.profile` draft. Each selected offer has an image URL, asset hash,
observation time and official parent page in its citation. Image prices remain
empty in the canonical profile, because a plausible OCR price association is
not yet a certified catalog price. On mixed boards, a row must sit under its
own food or drink heading; an ambiguous section remains outside the draft.
A second bounded local model call can select
representative names only from the corroborated set; deterministic selection
and minimum food coverage remain available if that call fails. Remaining
corroborated names are retained as review evidence. The output remains
non-importable and requires human review; no autonomous catalog write or
complete-inventory assertion is created.

The first new development case, Kleiner Wassermann, had an independent
reference recorded before the model run. Its four official menu images include
one wine/drink page with no alt text; v3.7 inventories it by its position
between explicit menu images. A single-decimal OCR pass and the local 27B
vision pass found 36 corroborated name/price rows and held 26 model rows.
The initial complete run correctly left an explicitly summer-2026 schedule
unresolved in October, but its profile contained only one HTML-text drink:
the image findings had no route into the draft. A saved-evidence replay of
the new bridge produces food and drink offers with image citations and no
prices, including Curry, Granola and Cappuccino. That replay informed the
repair and is not an independent blind pass. Source snapshots and reports
remain ignored under `.local/nuknuk-research/`.

The menu page also embeds visitor-review text without a review heading. The
first model pass extracted a review sentence and drink mentions as candidate
facts; the semantic critic rejected them in the broader development run.
A deterministic review-widget boundary now holds the same material even if
a future critic accepts it. The guard requires both a nearby expand link and
a reviewer-relative timestamp, so ordinary operator menu prose remains
eligible. This is a fallback for the observed widget pattern, not a claim to
recognize every possible testimonial layout.

The broader autonomous-seed development run used only the stored official
homepage plus local SearXNG. In 900 seconds it fetched nine official pages,
including the menu, seasonal hours and concept page, and made 21 model calls.
It produced seven image-backed review-draft offers and one literal description;
the current autumn hours and unrestricted laptop permission correctly remained
unresolved. It did **not** reach manual-research parity: the representative
selection favored ordinary bottled drinks over coffee, and explicit terrace,
WLAN, outdoor seating and changing-table evidence remained unresolved. Its
final FAQ extraction was aborted at the overall time limit; the run is a
failed quality case, not a release pass. The local model process stopped.

The follow-up general repairs move menu curation immediately after image
inspection so later pages cannot spend its budget, exclude reservation forms
from factual crawling, preserve abbreviations such as `St. Johanns-Park` in
description sentences, and admit explicit first-party facility sentences while
still rejecting a nearby playground as the venue's own. A same-source menu
selection replay then retained Hummus, Granola, Reispudding, Curry and coffee
among the bounded review offers. This replay is tuned evidence and does not
count as a fresh end-to-end or held-out pass. Overall-clock timeouts now report
budget exhaustion instead of falsely reporting that the local model went down.

## v3.12 menu and source-discovery evaluation, 21 October 2026

Three previously untested historical-catalog Spots were evaluated with an
independent operator-source reference recorded **before** each first local
model run. These are development cases, not the current Admin-export release
cohort. The current Admin export was unavailable. Every report, reference and
source snapshot stays ignored under `.local/nuknuk-research/`.

- **Grenzwert:** the first complete run reached the official bar and food
  pages, correctly transcribed seven overnight bar-hour rows and the public
  phone/email, but proposed just one wine and missed the house cocktails.
  The page puts offer names, ingredients and prices in separate same-level
  headings. v3.12 now joins only adjacent, price-backed heading pairs into
  cited, price-free review leads. A saved-source replay yields five drinks
  and two foods alongside the original wine. This is a tuned replay.
- **Cantina Don Camillo:** the first run stopped after a near-empty
  `speisekarte-download.html` page because observed `dinner.html`, `info.html`
  and encoded `uumlber-uns.html` links had no retrieval topics. After general
  flat-site link fixes, a complete rerun reached all three pages and recovered
  restaurant hours, public email and a factual description, but chose long
  ingredient strings as dish names and missed a phone written `+ 416...`.
  v3.12 adds bounded à-la-carte row evidence, a phone-prefix parser and
  source-backed title shortening. A saved-source replay includes Donna's
  Burger and other exact menu names without prices. The live operator pages
  showed kitchen closing at 21:00; an older search snapshot said 22:00, so
  the live page prevails and kitchen hours remain distinct from restaurant
  hours. This replay is not a fresh blind pass.
- **Che que lomo:** the first complete run recovered the split lunch/dinner
  hours and the correct general phone/email but missed the menu. A search hit
  titled `¡Che, que lomo!` failed the old literal identity test for the stored
  name `Che que lomo`. Punctuation-normalized exact-name matching led a tuned
  rerun to the official menu. The model still treated a description, "Die
  Fleischpizza", as the dish name and misclassified some named drinks as
  food. v3.12 now joins adjacent name-description-price paragraphs, keeps
  their original citations, and prefers concrete menu-backed review names.
  A saved-source replay proposes Parillada para dos, Bife de Lomo and
  Empanada de carne, while removing the false description-name offer. The
  complete run on this final projection has not yet been repeated.

These repairs do not establish manual-research parity. Explicit garden and
private-room claims now have deterministic first-party evidence mappings, but
the new mappings have only synthetic regression and saved-source checks.
Some valid amenities and offers remain unresolved; representative selection
and source freshness require more independent evaluation. The unattended
research and catalog-write release gates remain closed. No automatic catalog
write path exists in this adapter.

## v3.13 additional blind pub case

Werk 8 was another previously untested historical-catalog development case
with a source reference recorded before the run. The local 27B run fetched
the long official homepage and an irrelevant team page in about 267 seconds.
It recovered the regular opening schedule including overnight Friday/Saturday
closing and the public phone, and did not promote the already-past Wild dinner
or tomorrow's exceptional private closure into standing offers or weekly hours.
It **failed** offer and email coverage: the partial profile contained a cocktail
ingredient and an imprecise wine name instead of the visible house cocktails;
`reservation@werkacht.ch` was held solely because of its `reservation` prefix,
despite its placement under the operator's general `Kontakt` heading. The
homepage source was explicitly truncated; food in the omitted middle cannot
be considered researched.

v3.13 accepts a reservation-prefixed mailbox only when the official page itself
places it under a general contact heading, while event, catering, staff and
imprint mailboxes remain scoped. It also reads literal name/CHF-price lines
only inside an explicitly titled cocktail-card section, stopping at the next
section. The complete v3.13 local 27B rerun took 269 seconds and found eight
literal cocktail names, the public mailbox, regular hours and phone. Food
remained unresolved because the 12 KB source excerpt omitted the middle of
the page. Search also spent its remaining requests on unrelated menu results.
This is a tuned run, not a blind pass.

v3.14 retains price-bearing food and drink sections from long official pages
alongside opening and contact information, with source offsets preserved for
exact citations. Its parser separates item names from multiline ingredients,
secondary prices and adjacent drink sections. A saved-result replay using the
current official Werk 8 page now yields five cited cocktails and three cited
food items in the eight-slot review draft; additional menu rows remain as
review evidence. The replay never publishes prices. A complete, explicitly
versioned v3.14 27B + local-search rerun took 272 seconds and produced the
same five-drink/three-food mix, regular hours, public phone and email. Its
source remained excerpted and its two external cross-checks did not establish
identity. The seasonal terrace remained unresolved because the current
amenity contract cannot express its warm-month qualifier. The eight-offer
selection still favours a small snack and salad over a more distinctive main
dish, although the official page and review evidence include those dishes.
Further independent blind tests, representative-offer selection and seasonal
amenity modelling are required. The unattended research gate remains closed.

v3.15 addresses the observed eight-offer selection bias without publishing
menu prices. Within a section, a substantially lower-priced side item is
deprioritized when the same official menu lists main dishes. Food sections
then contribute representative entries across classics, seasonal dishes and
sharing before appetizers. On a saved Werk 8 report plus the current official
page, the draft now includes WERK 8 Club Sandwich and Geschmorte Karotte
instead of the small nuts and salad, while retaining five named cocktails and
the cited Aperoplatte. All other literal menu rows remain review evidence.
The complete v3.15 local 27B/SearXNG rerun took 271 seconds (three page
requests, four model calls) and produced exactly five named cocktails plus
WERK 8 Club Sandwich, Geschmorte Karotte and the vegetarian Aperoplatte.
Regular hours, public phone and public email stayed correct; the conditional
terrace stayed unresolved. No source failure or dated-event offer appeared.
This is a tuned case, not an untouched blind pass, and does not establish
manual-research parity.

The representative slots are conditional on the official menu's actual
coverage: a drinks-only or food-only menu can use all eight draft slots rather
than reserving empty slots for an absent category. A saved Amber Bar report
replay retained all eight of its previously cited drinks. The corresponding
synthetic drinks-only regression and the full runtime suite pass (361 tests).

## v3.16 independent hotel development case

Schweizerhof Basel was the first deterministically selected, previously unused
approved Basel Spot with an HTTPS website in the current public catalog, read
under the database `anon` role and its ordinary RLS policies. A separate
official-source reference was saved before the v3.15 model run. The 27B agent
read the German room overview and accepted all five actual categories, but
also read the English translation and filled eight draft slots with three
German names plus five English duplicates. It never reached the linked
parking page; after twelve requests and 23 model calls (828 seconds), it
stopped at the model budget. Phone and public email were correct, hotel hours
stayed unresolved, and a promotional "perfect symbiosis" sentence entered the
description. No package or meeting room became a guest-room offer. This is a
failed blind case, not a release-cohort pass; protected Admin values were not
read.

v3.16 normalizes common room-type translations only for overnight inventory,
keeping Villa and ordinary rooms distinct. It rejects the observed promotional
description wording and classifies observed parking and access links so they
can be ranked before unrelated hotel side pages. A saved-fact replay projects
exactly the five German room categories, and the real official homepage now
ranks its parking page first after the room inventory is covered. The full
v3.16 run retained the five correct German room categories, public contact
values and unresolved hotel hours, but exhausted twelve requests / 23 model
calls. It did fetch the German parking page; the source reader kept only its
short hero `<main>` and missed the actual CMS content in sibling sections.

v3.17 reads those bounded sibling sections before the footer. The real
parking page now contains the literal five free spaces in the source text,
and the full local 27B retest again retained the five rooms and public
contacts. It still stopped at twelve requests / 24 model calls. The model
quoted the first-come, non-reservable hotel parking correctly, but the
deterministic amenity entailment held it as unresolved. It also visited
English translations of already read pages, an unrelated brunch page and the
English room overview after the German inventory was complete. The copied
transit sentence in the description is factual but grammatically awkward.

v3.18 accepts explicitly hotel-owned parking as an existence claim while
retaining first-come / non-reservable wording in the citation. It rejects
neighboring and explicitly absent parking. Once a complete room overview is
accepted, the frontier omits translated room overviews, already-read
same-topic translations and hotel food pages irrelevant to the remaining
questions. The full local v3.18 retest ended with `FRONTIER_EXHAUSTED` after
eight HTTP requests, eleven model calls and 466 seconds, without a source
failure. It proposed all five correct rooms, phone, public email and `PARKING`
with the non-reservable condition in its citation. Hotel hours remained
unresolved. The copied transit description remained grammatically awkward.
This is a tuned development case, not a blind release-cohort pass.

For the next public-catalog restaurant selection, La Gondola's official
hostname failed DNS before testing. Nooch Basel Barfi was the second
deterministic candidate; its branch-specific reference was saved before the
model run. v3.19 corrected same-origin HTML `<base>` resolution: observed
`de/food-drinks` and `de/kontakt` links no longer become `/de/de/` paths. Its
full blind run correctly proposed the branch phone, mailbox and all seven
restaurant opening rows, keeping shorter kitchen hours separate. It failed
the offer and description checks: a generic brand homepage and a menu which
explicitly says selections vary by location supplied several incorrectly
branch-assigned or time-limited dishes. It also spent twelve requests,
sixteen model calls and the full 900-second time budget. This is a failed
blind case, never a release pass.

v3.20 withholds brand-home facts for a location-specific catalog URL, blocks
offer and description claims from an explicitly location-variable brand menu,
and holds source-adjacent limited campaigns out of permanent fields. A saved
v3.19 fact replay then retains the seven branch opening rows, phone and email,
while removing every accepted offer and the brand description; the empty
profile is an honest coverage gap. It also queues a root homepage only for
generic contact/information seeds, removes the `Seafood` false menu topic and
excludes limited copy from the description selector. Its full local retest
withheld all offer names, but still read brand-wide about and promotional
pages, selected a brand-wide description, and stopped after twelve requests,
24 model calls and 855 seconds. Seven correct branch hours, the location
phone and mailbox survived. A saved v3.21 deterministic replay held the
brand-wide description without touching those branch facts.

v3.21 treats a city-specific official catalog path such as `/basel-barfi` as
the location boundary. Generic same-host pages outside that path cannot
prove the branch's facts, and are not queued as ordinary follow-ups. Observed
and search-discovered contest, special and corporate campaign paths are also
excluded. The full local 27B retest ended with `FRONTIER_EXHAUSTED` after five
HTTP requests, four model calls and 192 seconds. It retained all seven
correct branch hours, phone and mailbox, with no false offer, brand
description or source failure. The profile and description remained empty;
the source does not establish that the brand-wide dishes are sold at this
branch. This tuned case demonstrates safer abstention and lower cost, not
manual-research parity.

v3.22 sends the sole remaining first-party, non-campaign, branch-scoped
description sentence to the independent critic if the selector abstains. It
is still only a review candidate. The full Nooch retest ended with
`FRONTIER_EXHAUSTED` after five HTTP requests, four model calls and 193
seconds. It retained the seven correct branch hours, phone, mailbox and a
literal branch-specific description of its Asian cuisine and interior; no
brand-wide dish became a branch offer. The only linked menu from the branch
leads to a brand page that says its selection varies by location. Its
external JavaScript menu can be rendered, but the observed brand-page link and
rendered menu do not establish which items the Basel Barfi branch sells.
Keeping concrete dishes unresolved is the correct answer until an exact
branch-bound source is found. The local regression suite passes (371 tests).
The unattended draft and catalog-write gates remain closed.

Novartis Pavillon was the next deterministic public-catalog Museum/Aktivität
case; three earlier candidates were unavailable by TLS, DNS or an off-host
redirect. Its official-source checks were recorded before the first run. The
v3.22 blind run read twelve pages in 606 seconds and missed the named
`Wonders of Medicine` exhibition as a visit. It treated a short film and an
interactive scanner *inside* that exhibition as separate visits. It also
left explicitly documented visitor Wi-Fi, toilets, cloakroom and lockers
unresolved. Café and exhibition hours remained correctly separate from
whole-Pavillon hours. Its factual exhibition description and a contact
number explicitly listed under the Pavillon on the official contact page
were review candidates; it also cited the same number under general campus
inquiries, showing a contact-scope error. Several official HTTP-200 pages
were actually access-denied redirects. This is another failed blind case.

v3.23 reads balanced CMS `#content` regions and adjacent hero headings,
excluding unrelated navigation and footer text. It rejects access-denied
pages, scopes shared contact-page numbers to the named venue block, and
requires standalone cultural visits rather than exhibit components. A named
current exhibition may become a `VISIT` draft without claiming permanence.
Literal visitor-facility assertions now cover the four observed facilities;
baby-changing stays unresolved where the text only says a room exists, not
that a changing table is installed. The v3.23 full retest recovered those
four facilities and the Pavillon-specific phone, but still made the exhibition
schedule into whole-building hours and omitted the main exhibition. The
accepted phone citation incorrectly included an identical general-campus
number as well as the properly labelled Pavillon number; the new section
scope holds only the former. Three stale Drupal node URLs redirected to
HTTP-200 access-denied pages. The reader now rejects their content.

v3.24 classifies an explicitly named, currently visitable exhibition as a
`VISIT` when permanence is not stated, and guards area-labelled exhibition
hours. Its full local 27B/SearXNG retest ended with `FRONTIER_EXHAUSTED`
after eleven requests, ten model calls and 463 seconds. It proposed just
`Wonders of Medicine` as a visit; the internal film and scanner were held.
It also proposed the four explicit visitor facilities, the literal first-party
exhibition description and the phone listed under Novartis Pavillon on the
official contact page. Whole-Pavillon hours and a general visitor email stayed
unresolved. The three stale numeric CMS links still consumed requests, but
their access-denied pages contributed no facts. v3.25 removes numeric CMS
node URLs from observed and search-discovered visitor-page frontiers. This
is a tuned development case, not an independent release pass. The next
unseen museum reference was saved before its first model run. The unattended
draft and catalog-write gates remain closed.

The next unseen case, Antikenmuseum Basel und Sammlung Ludwig, was selected
from the approved Basel public catalog under ordinary `anon` RLS. The first
deterministic museum candidate, Anatomisches Museum, redirected off its stored
host and was not fetched as the target. The Antikenmuseum reference was saved
before the v3.25 model run. Its full 900-second run used ten page requests and
17 model calls and failed the reference: comma-separated weekday pairs lost
their first day, leaving only Monday, Wednesday, Friday and Sunday; a workshop
department phone conflicted with the correctly identified main-museum phone;
age-scoped school workshops entered the general culture profile without their
conditions. The named physical collections were omitted because the model
quoted descriptions without their separate headings. The Skulpturhalle phone
and its distinct opening hours were correctly rejected; the public general
email was obfuscated on the official homepage and remained unresolved.
Tracked `_gl` copies of the collection page and low-value staff, provenance
and room pages consumed research time. This is a failed blind case, not a
release-cohort pass.

v3.26 captures complete comma-separated weekday groups, strips known tracking
parameters, scopes workshop contacts and holds age/group-limited programme
offers when their conditions cannot be represented. It also binds named
physical-collection headings to their own explanatory paragraph, excluding
closed sections, digital collections and explicitly separate sites. Museum
collection overviews now outrank staff directories and condition-heavy
workshops once the main contact is known. The saved-fact replay removes the
workshop-phone conflict and eight unsafe programme items; it cannot recover
missing days or collections without another model run. The full v3.26 retest
used 11 requests, 16 model calls and 893 seconds; it exhausted the useful
frontier. It recovered the complete seven-day museum schedule, main phone,
Greek vases and Egypt collections, and held conditional school-workshop
items, the obfuscated email, other-site facts and unsupported amenities.
It still misclassified a self-guided audio tour as a guided tour and missed
the open Greek and Roman sculpture collection: the model copied a closure
caveat from the preceding Orient section. The blind case therefore still
fails independent review despite materially better coverage.

v3.27 normalizes explicitly named audio tours to self-guided visits and
bounds each critic's surrounding evidence to the cited heading section. A
regression fixture places a closed collection immediately before an open
one; the verifier sees the open section without the preceding closure. The
full runtime suite passes 386 tests. A focused live-source retest on the
official collection page used one request, two model calls and 115 seconds;
it recovered `Griechische und römische Skulpturen` as a `VISIT`, retained
`Griechische Vasen` and `Ägypten`, and classified the named audio tour and
children's trail as self-guided visits. This is a regression check on a known
page, not a fresh blind end-to-end pass. It does not establish parity or
reopen the unattended catalog-write gate. All results remain human-review
drafts with no catalog write.

The next cross-category regression case was Hotel Alexander, chosen from the
ordinary `anon`-visible approved Basel hotel catalog. Its reference was saved
before the v3.27 run and independently checked against the hotel's official
homepage, contact and room-overview pages. A subsequent full-archive audit
found earlier Alexander research in `blind-batch-01`; this case was not
untouched and cannot count toward the blind release cohort. The full run used ten HTTP
requests, 22 model calls and 879 seconds, then hit the model-call budget.
It recovered all six named room categories, the main phone, the literal
public email and a factual hotel description. It correctly left whole-hotel
regular hours unresolved and did not project the limited Basel Weekend
package or partner-restaurant dinner as standing hotel room offers. It
missed two explicit general amenities: complimentary WLAN and paid garage
space rental. The deterministic entailment floor did not recognize the
compound `WLAN-Internetzugang` or the hotel's first-person garage-rental
sentence. This is a failed regression case, despite strong room
and contact coverage.

v3.28 adds narrowly grounded hotel-wide WLAN clauses and first-person garage
rental to the deterministic amenity evidence, preserving the paid-rental
caveat in the citation; nearby hotels, absent facilities and bare image or
navigation labels remain ineligible. Once a hotel's room overview has been
read, observed links to room categories not yet supported outrank detail
pages for already supported categories. The suite passes 388 tests. A focused
live-source retest on the official hotel homepage used one request, two model
calls and 111 seconds; it drafted exactly `WIFI` and `PARKING`, with the
garage's paid-rental wording retained in the citation. This is a known-page
regression check; these rules must also pass a fresh blind case before the
independent release cohort can count them.

The next activity regression case was ELYS Boulderloft, again selected from
the approved Basel catalog under ordinary `anon` RLS and compared with a
first-party reference saved before the run. A subsequent full-archive audit
found v2.3 ELYS runs from 19 October; this was not an untouched case either.
The exploratory v3.28 run used eight requests, 12 model calls and 654 seconds. It correctly recovered the
seven-day whole-venue hours, main phone, general email and bouldering,
while excluding the course mailbox and dated events. It failed the reference:
`Schnupper- oder Grundkurs` was falsely merged into one offer, the separately
ticketed movement landscape was omitted, and explicitly signposted garage
parking stayed unresolved. The run used legacy `SPORT` because the current
World Knowledge classification was unavailable; the result also did not use
the canonical `SPORT_MOVEMENT` contract. Two secondary sites returned
redirects/rate limits and contributed no facts.

v3.29 holds disjunctive offer names unless they are an actual published
heading. It binds a named movement-play section to its adjacent explanation
and retains a literal age/accompaniment restriction as the offer's
`participation.prerequisite`, rather than silently dropping the restriction
or the whole visit. A focused live test on the official bouldering page used
one request and two model calls (88 seconds), returning `Bouldern` and
`Bewegungslandschaft`; the latter carried the exact under-18 access text.
v3.30 additionally accepts parking explicitly located in the venue's own
building, without implying it is free, reserved or owned by the venue.
Nearby parking remains excluded. The full suite passes 391 tests. The
complete v3.30 rerun with canonical `SPORT_MOVEMENT` used four requests,
six model calls and 332 seconds. It drafted the separate bouldering and
movement-play offers, retained the under-18 prerequisite, recovered all
seven-day hours and the general contacts, and cited the on-site garage.
It held the alternative-course composite and the course mailbox. The
first-visit registration rule visible on the official site is still absent
from the profile, so this is an improved regression result rather than
manual-research parity. A truly untouched botanical-garden case was selected
only after checking every local research archive for both ID and name; its
official-source reference was saved before the v3.30 model run.

The first genuinely untouched Botanischer Garten der Universität Basel run
read seven official pages in 418 seconds (nine HTTP requests and ten model
calls). It correctly left whole-year opening hours unresolved because the
current site states different March–October and November–February garden
hours, and kept nearby parking and an unverified general phone out. It did
**not** match the prewritten reference: it treated the guided-tour mailbox
`botgarten-events@unibas.ch` as the garden's general email, made map labels,
buildings and generic site sections into separate visit offers, and missed
toilets explicitly located by the official visitor FAQ. The public garden
mailbox is displayed in an anti-spam-obfuscated form, so the parser must not
reconstruct it from the page. This blind case fails the parity gate and is now
development data. v3.31 holds service-role mailboxes even when prefixed by
the venue name, requires an explicit visitor experience for nature-visit
offers, recognizes first-party toilet-location statements, and marks
month-range HTML hours as seasonal. A deterministic replay of the saved facts
now leaves the tour mailbox unresolved and retains only the two separately
described greenhouse visits; replay cannot promote the previously held toilet
fact or prove a fresh full-run result. All 395 runtime tests pass. The
v3.31 full regression finished in 574 seconds, with nine HTTP requests and
13 model calls. It retained only Tropenhaus and Nebelwaldhaus as visit
drafts, correctly proposed the official visitor FAQ's `TOILET`, left
seasonal hours and the scoped tour mailbox unresolved, and retrieved the
official tours page. It still missed the public and private guided-tour
offerings: the model called guided tours ordinary visits, invented singular
offer names where the page published only plural/shared-prefix names, and
treated “bei jeder Witterung” as a restricting condition. A third-party
cross-check returned HTTP 403; this did not support any proposed value.
This is a failed development regression, not a release-cohort pass.
v3.32 reads the original operator-published rotated `mailto:` target using
the three character ranges and vector in the site's own JavaScript click
handler. A decoded address must be a valid mailto address; the anti-spam
display text alone is never reconstructed. It also classifies explicitly
named guided tours as `GUIDED_TOUR`, treats “bei jeder Witterung” as an
all-weather statement rather than a restriction, holds optional tour-plus-meal
headings and private-group tours whose audience was not retained, and avoids
membership/association pages as ordinary Spot-offer sources. A focused live
garden contact-and-tours retest is in progress. These are review drafts and do
not close the blind-case omission until the current code has been checked.
The first two-page focused run recovered the intended public
`botgarten@unibas.ch` from the official encoded link and held the tour and
association mailboxes. It still returned no tour offer because a broad
private-group heading remained in the HTML heading stack above an explicitly
public subsection. The scope check now gives the subsection's explicit
“öffentlich” wording precedence; a one-page live tour retest is in progress.
That retest still left the tours unresolved because the independent critic
correctly copied the site's “programme published when available” caveat and
the validity floor rejected every condition it could not put in the profile.
The floor now admits exactly this public, first-party programme caveat on a
standing tour page. It keeps the quotation and an empty schedule for review;
it does not claim dates or daily availability. A second live one-page retest
still rejected the two public tours: the model marked them `CONDITIONAL`,
whereas the new guard covered only `CURRENT`. The guard now admits either
applicability only with the exact quoted caveat, explicit public wording and
a standing guided-tour page. The 401-test suite passes, including a
`CONDITIONAL` regression; this last guard has not yet received a fresh live
garden run. Unspecified private-group access and source-absent singular
tour names remain held. None of the garden retests counts as a new blind case.

The next genuinely untouched case was Basler Münster. Its official-source
reference was written before any run, then the current one-Spot Admin export
was downloaded and used verbatim as the test identity. The export classifies
it as `ATTRACTIONS_LANDMARKS`; the old catalog's “Aussichtspunkt” is not the
research category. v3.32 read only the dedicated homepage and opening-hours
page in four requests and 266 seconds. It proposed the already known visitor
phone but no visitor offers or description. Seasonal church, cloister and crypt
hours correctly stayed unresolved. The blind result misses the tower ascent
and guided visits; it fails the parity gate and is now development data.
The local field-level audit against the pre-run reference records one correct
field, two omissions, three justified abstentions and six missed reference
facts across the six requested fields. These counts are human assessment of
the recorded checks, not independent population-wide accuracy estimates.

The first v3.33 regression fixed a structural navigation error: a saved
`/infos-kontakt/oeffnungszeiten` website must not make the same venue's
homepage look like a chain-brand overview or restrict all follow-up URLs to
that leaf path. `Turmbesteigung` now receives a visitor-offer topic. The full
v3.33 regression still reached no tower source before its 900-second budget
ended (eight requests, thirteen model calls). It spent requests on a building
society contact and religious programme pages, and its three tour/group
drafts omitted a mandatory group registration from the parent section. It
correctly held the Sunday worship service and dated lecture. This tuned
regression also fails manual-research parity.

v3.34 ranks observed landmark-visit and guided-tour pages ahead of unrelated
society/religious sections. An external tour operator is eligible only through
an exact, direct link published by the official venue, with both link purpose
and destination identifying the venue. Such a page can support only visit or
guided-tour facts; contacts, hours, further links and broad assertions remain
out of scope. A literal mandatory group-registration sentence is bound to
the listed group offer and stored as an offer-level prerequisite, either from
an adjacent parent line or from the offer paragraph itself. Summer, winter
and Advent hours are held from a whole-year weekly field by an independent
season-heading check. Its full-site regression reached the official tour
page and found the tower ascent, but spent its full 900-second budget on eight
requests and fourteen model calls. It proposed a pastoral listening service
as a visit, missed the public short-tour inventory and dropped a mandatory
group-booking condition when a later duplicate tour mention replaced an
earlier qualified one. This tuned run is not a release pass.

The next untouched Spot was Zoo Basel. A current one-Spot Admin export and
an independent nine-field reference were saved before any model call. The
official public contact and seasonal-hours JSON responses were also captured
with timestamps and hashes. The v3.34 blind run correctly proposed the
general phone and email, but missed visitor activities and did not surface
the seasonal-hours conflict with the stored all-year 08:00–18:00 value. It
stopped at twelve requests after following several empty JavaScript page
shells and an unrelated hours endpoint. The formal audit records two correct
fields, five omissions, two justified abstentions and seven missed reference
facts; its only source failure was an empty, observed but irrelevant API
response. The pre-run reference incorrectly assumed that `OUTDOOR_NATURE`
cannot classify a zoo. The authoring taxonomy explicitly permits `ZOO`
under that primary category, so the audit marks that field as a justified
abstention and keeps the original reference unchanged. The stored `PARK`
place type and pet rule remain unresolved conflicts.

v3.35 follows only page-declared same-host read-only visitor JSON endpoints
and turns their explicit same-host links into leads. It ranks experience
pages ahead of admission-price pages, preserves a mandatory booking caveat
across duplicate offer mentions, and attaches a quoted seasonal-hours block
to an unresolved hours result for human review. The v3.35 Zoo regression
reached the exact seasonal table and proposed a factual description and the
correct general contacts, but still stopped at sixteen requests. It falsely
treated a Gönnerjahreskarte as a visitor experience, never reached the
experience overview, and could not assess the unsupported pet/classification
fields. This was a tuned retest, not another blind case.

v3.36 prioritizes activity research earlier and excludes admission-product
pages from non-food experience crawling. It reached the Zoo feeding text,
experience overview, guided-tour details and the seasonal schedule. The
900-second run still stopped at sixteen requests after 880 seconds. It
accepted the general guided tour but also promoted an event venue's rooms
and restaurant into ordinary Zoo offers and chose a seasonal penguin-walk
condition as a permanent highlight. The current v3.37 floors reject those
private-event facts even when their text comes from a backing JSON endpoint,
exclude time-limited visitor instructions from permanent descriptions,
and allow an explicitly named animal-feeding observation as a nature visit.
The original v3.36 evidence replay removes the four private-event false
offers and the seasonal description; it cannot promote previously held
feeding facts without a new model run.

The next genuinely new blind case, Historisches Museum Basel, used a fresh
Admin export, four current official source snapshots and a six-field
reference fixed before the model run. The official visit page directly
links `Gruppen`, whose page describes named house-specific tours and a
two-week advance group request. v3.37 never opened that link. It spent
fourteen requests and 24 model calls (790 seconds) on collection-management
pages, translated duplicates and room hire, then stopped at its model-call
limit. The three known house tours were omitted. Separate house opening
hours correctly remained unresolved; the general administration phone and
email matched their official source. Its ticket sentence was literal but
redundant with an already stored description. The six-field blind audit
records three correct fields, one omission, two justified abstentions, three
missed tour facts and one dead external cross-check URL. It fails the release
gate.

v3.38 treats observed visitor-group and family links as experience leads,
prioritizes museum group-tour pages, removes collection administration and
room-hire paths from the visitor frontier, defers generic translated
collection/visit pages when an unprefixed primary page is already read, and
holds ticket terms out of experience highlights. The actual HMB visit page
now ranks `/besuch/gruppen` first. Its complete tuned HMB run reached that
page second, used ten requests and 19 model calls over 739 seconds, and
stopped when the frontier was exhausted. It extracted the three reference
tour titles, but held each because the model returned a title alone without
the page-wide two-week group booking rule. The output instead proposed
generic programme labels and duplicate group-tour summaries. Institution-wide
hours and accessibility correctly remained unresolved. This tuned run still
fails the research quality target and does not change the blind audit.

v3.39 binds a literal, page-wide booking deadline to named guided-tour
headings only when an official group page explicitly lists them under offer
sections. The quote remains one contiguous source span containing both the
name and rule; no deadline is inferred from an unrelated page. Generic
programme labels are withheld unless a dedicated recurring programme page
supports one. Its focused HMB live test still failed: the critic classified
four named house tours as OTHER even though the parent museum advertises
group tours through its houses. The other two names lacked the section
binding. This demonstrates that a deterministic rule alone is insufficient.

v3.40 anchors the critic's section context on the offer name rather than the
earlier page-wide booking sentence, passes the official group-page preamble
that establishes ownership, and treats a named tour in an institution's own
constituent house as a possible institution-owned offer. This does not
transfer that house's opening hours or amenities to the institution.
`Angebote Musikmuseum` now counts as a group-offer section. A focused local
model run on the HMB development export used two pages, three model calls and
209 seconds. It proposed six literal named group tours, including all three
pre-run reference tours, each with the exact two-week registration deadline.
The generic programme summaries were held. All 416 runtime tests and the
runtime typecheck passed. This is a tuned development regression, not a new
blind success.

The complete v3.40 Zoo Basel development run used 16 requests, 19 model
calls and 657 seconds. It retained a literal guided tour, general phone and
email, and a factual description. The operator's JSON seasonal table was
surfaced as `SEASONAL_HOURS_REQUIRE_REVIEW` rather than overwriting the
stored all-year hours. It produced no private-event rooms or seasonal
penguin walk as unconditional offers. Kinderzoo, feeding observation and
other distinct experiences remained missing. The pet-access and place-type
fields remain unsupported by this adapter and cannot count as verified.

v3.41 fixes a generic crawler depth bug: a public JSON endpoint declared by
an HTML page represents that page and remains reachable when the page is at
the navigation-depth limit. A mock end-to-end test proves the endpoint is
fetched. A focused live Kinderzoo test then reached its official JSON, but
still proposed no supported visitor offer: the endpoint mainly supplies
metadata and the model chose a bare activity title without visitor context.
This is a remaining semantic/schema gap, not a passed research result.
v3.42 generalizes the group booking rule to literal advance deadlines stated
in days, weeks or months; positive and absent-deadline tests pass. The full
417-test runtime suite passes. Neither this tuned development work nor a
replay closes the unattended research release gate.

The next prospective test, Kuni & Gunde, has an independently prepared
reference and official source snapshots before any Nuknuk model call. Its
available Admin export is from 28 September, however, so this case cannot
count as a fresh-export blind release pass until the current Admin session
provides a new export. The official operator page links a 14.86 MB,
13-page PDF menu hosted behind a Wix document redirect. A visual source
review paired representative sandwich, dinner and cocktail names with their
prices. The previous 2 MB source cap, absent local `pdftotext`, and strict
same-host redirect rule prevented Nuknuk from reading it. Poppler is now
installed locally. v3.43 follows an observed official menu PDF link to one
public PDF redirect, enforces a 20 MB/45-second document bound, keeps the
official embedding page and binary SHA-256, and marks the extracted content
for layout review. The first development run still discarded the downloaded
PDF at a second, agent-level source-URL gate and proposed broad food labels
from the homepage. v3.44 extends that gate only for the same explicitly
observed PDF chain. A focused v3.45 run then exposed a premature offer-count
stop: Nuknuk discovered the PDF but initially ended after four HTML claims.
It now keeps an observed official food menu PDF in the research frontier. With
three network requests allowed, the local model fetched the PDF and preserved
its official-page link and binary SHA-256, but generated only held translations
from the menu. The final draft still contained the four weaker HTML offers.
v3.46 extracts only literal priced rows from the observed menu into price-free,
layout-review leads. When that official PDF supplies at least four leads,
unmatched HTML offers are removed from the draft and retained as review
evidence. A deterministic replay of the v3.45 source report now yields six
cited food items and two cited cocktails, with no unsupported Craft Beer or
generic bread claim. Malformed multi-price, continuation and wine-list rows
are excluded. The text window now covers up to 20 PDF pages; the inspected
13-page menu extracts to 7,038 characters without text truncation. This is
development evidence, not a blind release pass. Individual prices remain
unverified until page layout is reviewed. A fresh Admin export and independent
spot cohort remain required before unattended research can be enabled.
The full 13-page extraction also exposed wine-list rows that looked like
ordinary priced offers. v3.47 identifies wine sections as contextual inventory
and resumes item candidates at the subsequent hot-drinks rows. In the saved
PDF, the strict row inventory has 39 food/drink candidates, including coffee,
and no wine-list entries. This inventory still needs visual layout review.
The v3.47 runtime typecheck and all 421 tests pass.

### v3.48 hotel inventory and independent checks

The first independently prepared hotel reference, Hotel Wettstein, failed the
v3.47 blind gate. The reference preceded model execution and listed eight
current room types; the 900-second, 12-request run proposed none. It found the
public phone, email and garden, correctly withheld whole-hotel hours and a
laptop policy, but missed Wi-Fi, play area, bicycle parking, breakfast and
snacks. Six late fetch timeouts followed exhaustion of the run budget. This
case is now a development regression, not a blind pass.

v3.48 pairs literal names and adjacent lodging descriptions on an untruncated
official room overview, retaining exact citations and emitting only unreviewed,
price-free overnight-stay draft offers. A deterministic replay of Wettstein's
saved source yields the eight room names, without the day room or dinner
package. This replay proves the parser behavior, not autonomous research.
Inventory stopping still requires accepted room headings when the source has
room headings. The runtime typecheck and all 422 tests pass.

The live v3.48 Wettstein development rerun reached the complete room overview
in two requests and proposed all eight pre-recorded room types, each with an
official citation; the day room and dinner package were excluded. It then
reached a playroom page, but exhausted a 420-second budget after three pages
and nine model calls. The draft still contained only GARDEN among amenities
and no breakfast/snack group. This run is a development regression; it does
not replace the failed v3.47 blind outcome.

v3.49 adds bounded first-party hotel benefit-list labels as amenity facts for
independent verification. In the saved Wettstein homepage, the parser now
supplies WIFI, GARDEN and PLAY_AREA with literal quotes; “Kostenlose Fahrräder”
does not imply BICYCLE_PARKING. The hotel-food frontier now keeps an observed
German “Essen und Trinken” page open while the hotel offering groups are
unanswered, and prioritizes it over generic hotel pages. This is implemented
and tested (typecheck plus all 423 runtime tests), but has not yet passed a
new full live run or a blind cohort.

The next blind hotel reference was frozen before v3.49 researched Das Breite
Hotel from the current Admin export. All four official room categories and the
public phone reached a cited review draft; the generic “Design Rooms” claim
did not survive as a fifth room. Whole-hotel hours, laptop permission and a
neighboring Rhyvage offer were not invented. The run still failed the blind
gate: the public email was missed, four stale direct room links returned 404,
and 12 requests were exhausted after four useful pages. The reference also
expected breakfast in `offering.groups`; the authoritative authoring catalog
marks that field inapplicable to `HOTEL`, so this is a schema/field-mapping gap
rather than a model extraction miss. Do not silently override that catalog.

v3.50 decodes only syntactically valid public email addresses from observed
Cloudflare `data-cfemail` links. A real read of the Breite homepage now exposes
`mail@dasbreitehotel.ch` to the existing venue and semantic checks. Complete,
untruncated official room overviews with two to eight literal name/description
pairs now stop further room-detail crawling when every specific room heading
is represented; incomplete overviews still lead to details. This prevents
stale duplicate detail URLs from consuming the remainder of the request
budget. The v3.50 behavior is a development regression until it passes a new
unseen hotel test. No canonical Spot data has been written.

The next independent v3.50 Hotel Rochat run found five of six pre-recorded
room types. It missed “Grandlit Zimmer” after 22 local model calls and stopped
at the model-call limit. Phone and public email were correct; general hotel
hours and blanket laptop permission were correctly withheld, and the nearby
City parking garage was not claimed as on-site parking. This blind test failed
despite having no false room type.

v3.51 treats an official room overview as a reviewable inventory when its
room-context introduction contains two to eight literal category names that
are repeated as specific headings on the same untruncated page. The six names
from the saved Rochat overview now all produce source-cited, price-free draft
leads, including Grandlit Zimmer, without guessing from navigation alone.
Generic headings and incomplete lists remain excluded. The authoring guidance
is versioned to 1.1 so HOTEL, HOSTEL and GUESTHOUSE can use the existing
registry-approved `offering.groups` field for an actually evidenced breakfast;
cuisine, food specialities and kitchen hours stay inapplicable to those place
types. Exact first-party breakfast-buffet labels enter independent review,
while guest-review prose does not. These are development replays and tests,
not a new blind pass. There is no database schema change or catalog write.
World-Knowledge-Core passes 374 tests, Nuknuk Runtime passes 428 tests, both
package typechecks pass, and the Admin TypeScript check passes with the
already-installed root dependencies.

A second reference was frozen before the Basel Marriott run. Its official
homepage returned HTTP 403 to Nuknuk's public fetcher, so the v3.48 blind run
ended with no supported first-party facts after three requests and no model
calls. Third-party search snippets were not promoted into claims. This is a
source-access coverage failure; the hotel cohort has not passed the release
gate. The independent reference and both run reports remain local and ignored
by Git. No production catalog data was changed.

```sh
npm run build --workspace @backyrd/spot-research-runtime
npm run typecheck --workspace @backyrd/spot-research-runtime
npm test --workspace @backyrd/spot-research-runtime
```

1. **Plan and retrieve.** Use the exported category and place types to remove
   fields that do not apply to the Spot before selecting it for a batch or
   spending requests. Preserve known values. The report names active and
   irrelevant fields; unknown place types remain open. Start with the current exported official website (or
   explicit approved seeds). Build a frontier only from actual public links.
   Contact, hours, menus, experiences, visitor/access and about pages are scored
   against unanswered fields after each page. Follow up to three link levels;
   all URLs and DNS requests retain the public-source boundary. Up to three
   HTTPS redirects may be followed within the same official host; every hop is
   separately DNS-checked and charged to the request budget. Default limits:
   12 HTTP requests (including redirect hops), 24 model calls and 10 minutes per Spot; hard maxima 24/48/15min.
   Cultural experience pages and observed German-language links receive priority;
   request forms and dated news are filtered. A museum's permanent-exhibition
   overview may be followed from an observed, explicitly labelled `Aktuell`
   link, while individual dated programme pages remain excluded. With no local
   search endpoint configured, this remains official-site link research, not an internet search engine or a browser
   capable of rendering every JavaScript-only page. For pages with template
   placeholders, a bounded adapter follows only observed same-host, read-only
   App Connect data URLs. Parameters must come from the actual page URL;
   analytics, action endpoints, unresolved parameters and other hosts are skipped.
   Public JSON is reduced to visitor-facing text in the page language; the
   endpoint and embedding page remain traceable. Aliases require review.
2. **Extract atomic evidence.** Literal phone/email and opening-hours parsers
   create source-bound candidates; the model cannot invent or rewrite them.
   Semantic extraction is split into small offer and property question groups.
   It selects immutable original blocks for evidence and uses canonical enum
   values. Known grounding, scope, ownership, validity and enum entailment floors
   run before the critic as well as before projection. Already ineligible facts
   remain in the ledger and cannot crowd valid claims in the critic request.
   Pages with no eligible claims still persist their checkpoint. Descriptions
   copy a factual original span. Main content is preferred
   over navigation/footers when present. Repeated literal text retains each
   source offset so a hotel facility does not inherit the scope of an earlier
   navigation mention. Original hashes and omitted/held evidence remain visible.
3. **Check interpretation.** A separate local-model critic checks each candidate
   against the original source and target, including its venue/area/offer/other/unknown
   subject, its separate ownership relationship (`belongsTo`), polarity and current/dated/conditional applicability. Restrictions
   must be literal source text, never generated explanations. Date bounds are
   not guessed; dated evidence is held with its original wording. The critic may
   narrow applicability, never silently broaden an extracted restriction.
   Missing, duplicate or rejected decisions cannot approve a claim. Both passes
   use the same pinned model: useful error detection, not independent truth.
4. **Project drafts.** Only supported, current unconditional target facts enter
   whole-Spot draft fields. Area/conditional/dated evidence remains visible for
   scoped review. An `experience.profile` item must name a concrete source-literal
   offer; a venue's direct statement about its own activity can establish one,
   while an owned building, category heading or area cannot. Owned room/activity
   offers can remain narrower than the whole venue. Exact descriptions may retain their explicit conditions in copied text;
   this does not establish an unconditional property. Original offer names are
   retained, offer kinds checked against the current research focus, hours parsed
   deterministically and conflicts withheld. The research focus is narrower than
   the canonical ontology; a hotel restaurant is not intrinsically invalid.
   Phones/emails must occur literally; enum values must exist in the canonical
   catalog. Exact grounding does not prove semantic interpretation.
5. **Report coverage honestly.** Reports include sources, facts, model outputs and
   prompt hashes, rejected/held evidence, retrieval/model failures, actions,
   pending links and the exact stop reason. Code and source-reader hashes bind
   future runs to their exact implementation. A checkpoint saves source text,
   pending facts and raw model outputs after each stage, including failed stages. Every field has `complete:false`:
   finding one fact or exhausting observed links cannot certify completeness.

6. **Search and countercheck, when explicitly configured.** After reading the
   seed page, the agent can search for a primary-language official page before
   spending its budget on translated overviews. When the official link
   frontier is exhausted, it forms further bounded queries from the exact
   exported Spot identity and still-open fields. A locally running SearXNG
   endpoint supplies result URLs; snippets are never evidence. Matching
   official-host pages join the existing safe fetch/identity/evidence pipeline.
   A small number of other public pages can be fetched for a countercheck,
   but their text cannot enter catalog projection. Exact contact differences
   are labelled *unverified discrepancies* for human review; they are not
   automatically resolved in favour of either source. A bounded local-model
   pass also compares accepted official claims with an address-matched
   external page. Support or contradiction needs a literal page quotation.
   These verdicts are model hints, never independent proof or approval of
   external facts. Search errors and candidates appear in `research.json`
   and `search-review.html`. This does not certify a second domain as a
   primary source or reliably adjudicate complex experience claims.
   Search leads for dated pages, event calendars and programmes are excluded
   from permanent Spot research. Translated overview pages are deferred once
   an unprefixed official page has been read. An ungrounded countercheck quote
   is recorded as `UNCERTAIN` with a reason; it never confirms or contradicts
   a claim. A generic heading such as `Dauerausstellung` cannot become a
   named offer without a distinct source-literal exhibition title.

   The optional manifest setting is
   `"webSearch":{"endpoint":"http://127.0.0.1:8888/","maxQueries":3,"maxExternalPages":2}`.
   Only loopback HTTP endpoints are accepted. The operator must start a local
   SearXNG instance with JSON output enabled; absent or failed search leaves
   the normal official-site research path usable and reports the limit.
   SearXNG itself queries external search engines, so Spot name and location
   leave the machine as search terms, although the local model stays local.
   Follow the [official SearXNG container guide](https://docs.searxng.org/admin/installation-docker.html)
   and enable `search.formats: [html, json]` in its private `settings.yml`;
   the [search API](https://docs.searxng.org/dev/search_api.html) returns HTTP
   403 for JSON when that format is not enabled. Bind the service only to
   loopback for this local workflow. No SearXNG image or container is bundled
   with Backyrd.

Supported v2 fields: description.highlight, contact.phone, contact.public_email,
hours.regular, experience.profile, offering.groups, amenity.features and
operation.laptop_policy. Other requested fields are explicitly unresolved. Named
offers remain bounded partial profiles (at most eight), never full inventories.
PDF/image menu layout remains a review requirement and those assets are not
used for automatic named-offer extraction; otherwise ingredients can be mistaken
for menu items. Conditions are preserved in the
ledger rather than silently erased into whole-Spot fields. Prices are deliberately empty
in projected v2 offers: block-level extraction does not certify menu layout.
An explicitly headed and described permanent exhibition at a culture venue
can be retained as a partial named offer even when the local model calls it
an area. This correction requires the exact official host, the target venue
in the quotation, an original heading, current unconditional wording, and
no dated context. Projection still checks literal source text and requires
human review.
Original HTML heading hierarchy helps separate hours of hotel/museum/restaurant,
bar and kitchen areas. Explicit uppercase operating-area labels inherit over their
weekday rows only inside an actual opening-hours section, and reset at the next
area label; an earlier navigation word cannot relabel a later schedule. Bare headings are removed from offer candidates before model
selection, not merely rejected after generation. Regional formats not
understood by the existing canonical parsers remain unresolved. Seasonal hours
from public JSON stay in evidence but cannot become an unconditional weekly
schedule in the current Backyrd field.

The v2.3 source frontier excludes dated event/news pages, membership/fundraising
benefits and exhibition-programme
subtrees from permanent Spot research. A dated exhibition may have genuine value
for discovery, but the current permanent Spot fields cannot carry its validity
window. Programme copy or exhibition names cannot become whole-venue description
or undated offers, including when a model critic approves them. Museum building
hours stay distinct from whole-museum hours. Generic navigation labels such as
"Kostenlose Museumsangebote" and "Online-Ticket" are not concrete offers.
Conditional group-booking/programme and press pages are excluded from
permanent-field research; if reached by a redirect, their facts remain scoped.
They cannot supply a whole-venue contact or an undated group tour.
Food/delivery/kitchen schedules remain separate from restaurant hours. The
address- and official-host-bound weekday parser can certify literal restaurant,
bar or café hours without a weak model veto; other ambiguous hours remain open.
For a single-venue sport site with no stored address, the same literal parser
requires an explicit **regular opening hours** heading and matching venue name;
later dated holiday schedules stay outside the weekly result.
Swiss optional trunk formatting such as `+41 (0)61 ...` normalizes consistently.
An official redirect advertising HTTP is probed only at that observed path on
the matching HTTPS host; insecure requests remain prohibited. An explicit move
away from the stored address stops the old Spot before any model claim.
Observed public sidebars contribute only contact and opening-hour data, never
their dated event feed. Menu prices cannot be mistaken for event dates. The
canonical offer-kind enum includes activity kinds such as `BOULDERING`; copied
amenity sentences, membership benefits and generic wine-list/hotel labels
cannot become named offers. Sport research does not consume a bistro menu as its
primary experience.
Description candidates preserve visual line wraps within a sentence; an
incomplete line or past-only event fragment cannot become standalone Spot copy.
An old HTTP website is only probed over HTTPS on that exact host; TLS errors are
reported, never bypassed. The review page surfaces truncated-source warnings.
The main page text is supplemented with a bounded public identity panel when
hours, address or contact details appear in the surrounding official page.
That panel is used for literal identity/contact/hour evidence; event and offer
extraction stays in the main content. Museum, shop and bistro phone labels are
kept separate. English 12-hour opening times such as `10 a.m. – 6 p.m.` are
parsed without changing the quoted source text. A narrower weekday row can
override its immediately adjacent general row; unparsed late-opening notices
hold the schedule instead of silently publishing an early closing time.

Set optional manifest `budget` to `{ "maxRequests": 12, "maxModelCalls": 24,
"budgetMs": 600000, "maxDepth": 3 }`. `sources` may be omitted when a current
export contains the official website. `discoverLinks:false` restricts fetching to
seeds. Explicit requested fields recheck known values; the default eight supported
fields preserve existing known values.

For a bounded autonomous **draft** batch, provide a current Admin export and
let the CLI choose up to ten Spots with a known official website and missing
requested fields. It prioritizes the most incomplete eligible rows, skips all
known values and stops before the next Spot when the total time budget is too
small. Selection is deterministic; no catalog write or automatic approval occurs.
`research.json` records selected and deferred counts. Example manifest:

```json
{
  "exportPath": "/absolute/path/current-admin-export.json",
  "selection": {"mode":"MISSING_FIELDS","maxSpots":5,"totalBudgetMs":3600000},
  "discoverLinks": true,
  "budget": {"maxRequests":10,"maxModelCalls":24,"budgetMs":480000,"maxDepth":2}
}
```

Run it through the same `scripts/world-knowledge/nuknuk-research.mjs`
command shown below. This is a local experimental operator tool; the export is
still obtained through the authorized Admin flow.

A research-system update is not model pretraining or fine-tuning. The existing
local weights are unchanged. No outside AI provider or provider key is used.
Public HTTP requests still go to the researched websites. Draft review and the
existing Admin persistence boundary remain mandatory. Rollback: restore the
prior CLI commit; no data or schema rollback is required.

## Model selection and quality boundary

The CLI's unchanged default is the pinned local `mlx-community/Qwen3.5-9B-4bit`, revision
`8b2b98c00a6b4d291155e4890773ca8f769aee53`. An explicitly selected experimental
27B route is also supported: `mlx-community/Qwen3.5-27B-4bit`, revision
`45797d2985a12c55e6473686e9ea91b95e959553`, with a 240-second request timeout
and 15-minute default Spot budget. It is not automatically selected or downloaded
by the CLI. For quality evaluation, explicitly select 27B: on the same official
Museum Tinguely collection and tours pages, the v3.0 extraction produced four
correctly named offers with 27B, while 9B rejected the named collection and
tour offers after the artifact guard. This is one paired case, not population
accuracy or release readiness. The 27B targeted run took about 142 seconds;
the full Restaurant Antalya run took about 280 seconds for three proposed
fields. Run it as a background research job on the 48 GB Mac and stop the
model server when finished. Neither route uses an external AI API. Existing v9 entry
points retain their original 9B contract.

Autonomous **research draft** is distinct from autonomous **catalog import**.
Release the unattended draft runner only after a held-out, source-reviewed suite
has zero invented or wrong-venue facts, zero time-bounded offers in permanent
fields, zero area-hours promotion, no silent source failures, and useful coverage
across restaurant/bar, hotel, culture and activity cases. Measure field-level
precision, supported-field coverage, unresolved reasons, source availability,
latency and memory. An all-unresolved run is safe but fails useful coverage.
Keep the Admin review/commit boundary even after the draft runner passes.

The v2.5 source reader also follows explicitly observed accessible names on
icon-only official links, and copies a literal public address from a generic
`mailto:` link on an official home/contact page when the address itself is absent from visible text.
Department-labelled mail links are excluded; existing venue/role/identity
checks still apply. Job pages are outside the permanent Spot research frontier.
This improves contact and relevant-page coverage without allowing a model to
invent an address or URL.

`scripts/world-knowledge/nuknuk-readiness.mjs` evaluates a local, source-reviewed
cohort. Its manifest has `cases` with `category` (`FOOD_DRINK`, `STAY`, `CULTURE`,
`ACTIVITY`) and paths to each full report, a separately prepared reference, and
field assessments. Each reference needs `spotId`, `preparedAt`, and nonempty
`checks`; `preparedAt` must precede the report's `startedAt`. Each assessment
needs the field, outcome, counts of false assertions, venue misattributions and
missed facts, and a substantive note. Example invocation after building the
runtime:

```sh
node scripts/world-knowledge/nuknuk-readiness.mjs /private/path/cohort.json /private/path/readiness.json
```

The gate requires at least twelve distinct Spots, at least three per category,
pre-run references, zero incorrect, misattributed or missed reference facts, at least 30%
useful proposed-field coverage, triaged source failures, and no more than 25%
budget-stopped runs. A source-reviewed cohort and manually confirmed *untouched*
case selection are still necessary; timestamps and hashes cannot prove that a
human did not inspect a case earlier. A passing gate permits unattended local
**draft creation** only. `readyForCatalogWrites` is always false. Keep cohort
exports, reports and references local; no production Spot data or audited
reports are committed to the repository.
Each local `research.json` also summarizes proposed, unresolved, failed and
preserved fields, source/model failures, budget stops and deferred Spots. This
operational summary never claims a cohort pass or a catalog write.
Set `"resume":true` in a batch manifest to continue completed Spots after an
interruption. The CLI reuses only fully completed reports whose Spot order,
current Admin export, manifest, pinned model path and research code match the
saved run fingerprint; an interrupted Spot starts again. A changed export or
code version fails the resume check instead of mixing evidence from two runs.

### 19 October 2026 local source-reviewed evaluation

Independent expectations were written before the respective local 9B runs;
the raw Admin exports and reports are ignored local files, not repository
fixtures or production writes. The observations below are about these
particular official-site versions and code revisions, not a population-wide
accuracy estimate.

| Spot | Useful supported draft after correction | Remaining issue |
| --- | --- | --- |
| 8 Bar | Public phone/email and regular hours | Description and concrete offers unresolved |
| Alexander | Public phone/email and description; an isolated current-code hours run parsed all seven restaurant days without model calls | Full crawl still missed regular hours before the structured-hours fix |
| Alter Zoll | None | Stored HTTP site fails the exact-host HTTPS TLS probe; no certificate bypass |
| Märthof | Hotel description/email and four partial room offers | Phone format conflict in the original run; deterministic replay with Swiss optional-trunk normalization resolves it, pending a fresh full run |
| Kunstmuseum Basel | Public phone | Original blind run wrongly projected dated exhibitions. A later run removed the dated copy but still included a programme-scope virtual tour; current deterministic replay withholds it. Multi-building hours remain unresolved. A fresh current-code run is still required. |
| Zoo Basel | The latest full run used observed official read-only data endpoints to propose the main phone and public email | Opening hours differ by season and stay unresolved for the permanent weekly field. Enduring offers and description remain unresolved; the eight-request budget was exhausted. |
| Acero | Public phone/email, grounded description and all seven Bistro days including Sunday | The 9B model still misses literal concrete offers; source-grounded hyphen correction has a synthetic regression but needs a fresh full run. |
| Museum Tinguely | The latest full run correctly proposed the main museum phone and all seven days, including Monday closed and the Thursday extension to 21:00; dated event copy, shop/bistro phones and fake email did not become proposals | Description and concrete enduring offers remain unresolved; the run used its eight-request budget on multilingual contact/press pages before the press-frontier fix. |
| Fondation Beyeler | The latest full run proposed the museum phone, all seven days with Wednesday's later close, and a literal though generic description. Group contacts, dated group tours and ensemble buildings stayed out of the permanent fields. Final deterministic replay preserved that result. | Named enduring offers remained unresolved; one programme page had empty source text and the eight-request budget was exhausted. A final guard against an incorrectly `OFFER`-labeled building passed a synthetic test after the run. |

**Release decision: not yet approved for unattended batch operation.** These
cases exposed failures that unit tests alone missed. The current 9B route can
create useful review drafts but does not meet the coverage and held-out safety
gate across venue classes. Recheck every material rule against genuinely new
Spots, including another client-rendered activity site; do not treat a deterministic
replay or a corrected development case as an independent blind pass. The pinned
27B download completed later on 19 October.

### v2.3 exploratory source review, 19 October 2026

These local contexts used previously identified OSM spot identities and live
official websites, **not a current Admin export**. All statuses therefore remain
review drafts. The listed outcomes came from live-source runs as the v2.3 guards
were refined; the corrected Spots are development cases, not independent blind validation.

| Venue | Final live result | Material holdback |
| --- | --- | --- |
| Pizzeria Da Pia | Description, public phone/email, all seven weekly days and three named dishes from one official page | Generic wine-list heading withheld |
| Hotel Brasserie au Violon | Description, hotel phone and two literal room names; four requests, no failed source | Reception hours and unproven email withheld |
| Kletterhalle 7 | Description, public phone/email, seven regular days, four supported climbing/course activities | Dated holiday and summer exceptions excluded from the regular weekly field |
| SILO by TALENT | Description, public phone/email, one literal double-room offer | Reception or stay hours unresolved |
| Schweizerisches Architekturmuseum | Public phone/email and seven regular days | Membership benefits and unsupported visitor copy withheld |
| Schall und Rauch Bar | No permanent-field proposal from the final run | Email is obfuscated, published hours lack closing times, and photographed menu items require layout review; news/event pages and ingredient words stay out |
| Roter Bären | No proposal; explicit move away from the stored address stopped the run | Identity requires human reconciliation before research |

An older Admin export was used only to smoke-test the new `MISSING_FIELDS`
selection path: it selected one missing-field spot, wrote a local report, and
reported `canonicalWrite:false`. Its 30-second one-page result is not evidence
of research quality on current catalog data.

On the same ELYS website and v2.3 code, pinned 9B and 27B each returned five
review-field proposals. The 9B run took 71 seconds and found `Bouldern` and
`Grundkurs`; 27B took 283 seconds and found only `Trainingsbereich`. Website
bytes were fetched live rather than frozen, and Mac memory was not measured.
This limited comparison does not justify promoting 27B.

**Release decision on 19 October: local autonomous draft selection was implemented but
not certified for unattended catalog-scale use.** The exploratory suite shows
useful coverage and safe abstention, but it is too small and was used to develop
the rules. A fresh current Admin export, an untouched cross-category validation
set, source review of every projected claim, and sustained budget/latency checks
remain required. No catalog import or approval is automated.

### v2.4 current-export blind review, 20 October 2026

A fresh Admin export contained six selected Spots. Three previously untested
restaurant, hotel and bar entries were independently re-researched against live
official websites with five requested fields. This is a small blind set, not a
catalog-wide accuracy estimate. It exposed general source-handling errors:

- The resolver rejected a public `192.0.66.202` address as private because it
  blocked all of `192.0/16`. Within that range only the reserved `192.0.0/24` is now blocked;
  the private-address test and live hotel fetch pass.
- A hotel on a multi-location brand site followed another city's pages, a
  special programme and pagination. The crawl now stays under the selected
  venue path when that path identifies a multi-segment instance, and skips
  campaign/artist-programme and pagination URLs. The corrected hotel run read
  three pages in 108 seconds without source failures, versus ten requests in
  248 seconds before the scope fix. Its main phone and email matched the
  official hotel page; hours and generic offer groups remained unresolved.
- A catering mailbox was counted as a second general restaurant email. Role
  mailboxes are now excluded from venue-wide contact projection. The rerun
  selected the literal `info@` address. HTML low-quote entities are decoded
  before evidence extraction, so source-backed copy does not contain raw
  `&bdquo;` text.
- Separate lunch and dinner rows previously produced a false schedule conflict.
  They now merge when intervals do not overlap, while contradictory overlapping
  times still stop projection. Partial weekly schedules retain only named days;
  the review page explicitly warns that missing days are unknown and must not
  replace a complete existing schedule without human reconciliation.
- A named room on an official hotel detail page was rejected because the local
  critic labeled the room as an area. A narrow deterministic rule now requires a
  room URL slug, matching page heading, descriptive text and hotel identity in
  the first page lines. A page headed for another hotel is held even if the
  model approves it. The agent keeps looking for up to four distinct room
  offers within its existing request/time budget.

The bar's published phone and weekly hours agreed with its existing catalog
values. A separate automatic `MISSING_FIELDS` run selected five current Spots
and completed with no catalog writes. It preserved all known fields, safely
abstained when laptop policy was not explicitly stated, and exposed an external
site with a self-signed certificate rather than bypassing TLS validation. Its
first pass found no new fields; this is an accuracy success but a coverage gap.
After the room-detail change, a live Airport Hotel rerun proposed three distinct
named room types in 130 seconds and six requests. Each name was checked on its
own current official detail page; prices remained empty and the profile is
marked partial. The final tests cover the source/IP, identity, partial-hours,
role-mailbox, and multi-room guards. No catalog values were written.

**Current release decision: autonomous bounded research drafts are useful,
but unattended catalog-scale accuracy and coverage are not certified.** The
current-export sample is still small and exposed multiple general errors during
development. A larger untouched cross-category set and repeatability runs are
required before relaxing review. Canonical import and approval remain human-led.

### v2.5 new current-export development cases, 20 October 2026

A fresh four-Spot Admin export selected a museum, restaurant, wellness venue and
hotel that were not part of the previous development suite. The museum had a
source-only preflight; the other three received live local-9B research runs.
These are **development cases** because each failure informed a correction
during this iteration. They cannot count as an untouched release cohort.

| Spot | Source-reviewed final observation | Remaining limit |
| --- | --- | --- |
| Antalya | Three review drafts: the public `info@` address from a generic `mailto:` link, a seven-day schedule matching the current catalog value, and three literal named dishes from its official menu | Menu profile is partial; no price certification |
| ART HOUSE Basel | General `info@` address and four room names grounded in official hotel room/detail text; site-title-only room claims are held when the descriptive passage is missing | Hotel-wide regular hours are unresolved; nine requests reached the budget after several legitimate redirects |
| aquabasilea | General `info@` address; the final v2.5 run used eight requests, 15 model calls and no source/model failures | Separate area schedules cannot prove whole-venue hours. The model misclassified pool equipment and incidental food as offers in earlier runs; final guards withhold them, leaving the partial profile unresolved. Useful offer coverage remains insufficient. |

The same live exploration found a generic navigation bug: child pages inherited
the parent's `/informationen/` topic, causing news, a solar-panel page and
videos to consume the budget. Topic selection now uses the linked page's own
path segment and accessible label. Wellness pages are eligible, while dated
news, job and booking pages (including malformed filename extensions) are
excluded. Room detail URLs with bounded numeric CMS suffixes are accepted only
when the exact room heading, target-hotel identity and descriptive sentence
agree. A single address-bound `info@` address can resolve a conflict with a
same-domain booking mailbox, but foreign-domain conflicts remain unresolved.

The final aquabasilea run demonstrates the present trade-off: **zero projected
facility-as-offer errors, but no useful experience profile**. Another round of
single-venue regex tuning would not establish autonomy. The next release step
is a frozen, independently prepared twelve-Spot cohort, with field-level
source review and explicit measurement of missed genuine experiences. The
cohort gate remains closed; no automatic catalog write was made.

A 12-case synthetic language regression corpus covers false preferences,
venue/area confusion, reviews, expired offers, explicit facilities and affirmative
controls. It is a regression set, not a blind benchmark or production accuracy
estimate. The 9B model alone still fails the bar-hours-to-hotel negative case;
structural evidence gates are therefore mandatory even after two model passes.
High quality cannot be obtained by treating model agreement as proof.

Offer decoding permits all actual offer kinds and an empty abstention, even for a
STAY target. Restricting the decoder to room kinds forced a restaurant to be
mislabelled as accommodation in development. Decode actual kind first, then check
the research focus; the critic also checks the relation of name to kind. These
checks still depend on model interpretation and do not certify a full portfolio.

### v2.7 local web-search development status, 20 October 2026

The new search adapter and agent path were exercised with a SearXNG-compatible
test response: a missing official contact page was found, fetched and used for
a source-bound draft. A different-domain page with the same exact Spot name
and street address exposed a conflicting telephone number as an unverified
discrepancy; a same-name page without the address did not. A failing search
left the field unresolved and reported its error. A model-backed countercheck
retained a literal external contradiction about a named offer for review
without projecting that external statement into the Spot. These are controlled
regression tests, not live web-search quality evidence.

Both Docker Hub and the official GHCR mirror stalled while pulling the local
SearXNG image on the development Mac. No actual SearXNG query or new-Spot
live run was completed for v2.7. Therefore web-search coverage, cross-source
accuracy and autonomous readiness remain unverified. The model's semantic
countercheck is not an independent adjudicator; complex hours and experience
claims still need a source-authority policy and a held-out quality evaluation.

### v2.6 category-aware research case, 20 October 2026

Basler Papiermühle was researched from the current Admin export and its
official site. The v2.5 run spent 9 requests, 22 model calls and 419 seconds;
it offered an English description and a French permanent-exhibition label
without a sufficiently useful museum profile. The v2.6 live run spent 7
requests, 16 model calls and 233 seconds. It planned only missing description,
experience profile and amenities, skipped the museum-inapplicable food/drink
groups and laptop policy, and proposed a German description grounded in the
official `https://www.baslerpapiermuehle.ch/aktuell/` page. The description
is a review draft, not final Backyrd editorial copy. The live run found the
explicit `DAUERAUSSTELLUNG` heading but the profile remained unresolved because
the model's title case did not literally match the uppercase source heading.
After that run, source-heading case is preserved. Replaying the actual captured
source and fact through projection produced a partial permanent-exhibition
review draft. The final case fix has **not** had a third full live model run;
synthetic end-to-end and source-bound replay checks cover it.

The current-export Anatomisches Museum case has all meaningful fields known;
only the food/drink group was missing. The v2.6 CLI now reports
`NO_FIELDS_REQUIRE_RESEARCH` with zero requests and zero model calls. This
avoids asking the model to turn museum tours into snacks or drinks.

These are development cases, not an independent quality measurement. Source
selection still visited translated pages, and genuine experience coverage
remains incomplete. Unattended catalog writes and the release cohort gate
remain closed.

## Historical v4–v9 implementation and evaluation record

The sections below document the previous field-extraction pilot and its exact
limitations. Their six-request/one-hop bounds do not describe the active v2 CLI.

## Run

Build `npm run world-knowledge:build` and
`npm run build --workspace @backyrd/spot-research-runtime` first. Start the existing loopback-only MLX
server on `127.0.0.1:8088` with `mlx-community/Qwen3.5-9B-4bit`, revision
`8b2b98c00a6b4d291155e4890773ca8f769aee53`.

```sh
node scripts/world-knowledge/nuknuk-research.mjs manifest.json /absolute/model/path/8b2b98c00a6b4d291155e4890773ca8f769aee53 .local/research-output
npm test --workspace @backyrd/spot-research-runtime
```

Example manifest, using a synthetic identity:

```json
{
  "exportPath": "/absolute/path/current-admin-export.json",
  "discoverLinks": true,
  "spots": [{
    "spotId": "11111111-1111-4111-8111-111111111111",
    "name": "Example Spot",
    "locality": "Basel",
    "sources": ["https://example.org/contact", "https://example.org/menu"]
  }]
}
```

In the historical v9 pilot, the four pilot fields were researched only when the export does not already contain a known value. Explicit `fields` selects fields for rechecking; all results still remain review drafts. Known values are never automatically rewritten.

`exportPath` is a current Admin `world-research-batch@1.1` export. Its catalog,
manifest hashes and identity validation remain authoritative. The adapter uses
its stored category, address and country as context, not independent evidence.
Without an export there is no current-value comparison; profile proposals require
a known category and national phone numbers require a known country. The CLI does
not manufacture a current export from partial observations.

With an export, every source host must match the stored website, ignoring www.
Alternate domains require identity review and are skipped. Matching names or
hosts do not prove branch identity: check addresses and the specific venue.

## Evidence-first extraction (v4)

- Description: choose an immutable passage from the primary page’s main content; navigation and partner-venue footers are excluded; never generate a description
  from model knowledge. The selected text may still need editorial trimming.
- Telephone: extract the published digits; normalize formatting and supported
  national prefixes in code. Explicit fax labels are rejected. Unknown country
  codes are not guessed.
- Regular hours: select quoted day/time rows. Code expands supported German and
  English day groups, split intervals and midnight. Missing days stay unknown;
  closed days require an explicit statement. Missing closing times, unsupported
  formats and conflicting weekday scopes in the source candidates remain unresolved even if the model selects only one. This deliberately requires manual resolution for multi-branch sites and differently scoped restaurant/bar schedules. Kitchen,
  bar, event and branch distinctions also require reviewer attention.
- Experience profile: extract at most four named offers with surrounding evidence.
  Code creates IDs and empty unknown fields. EAT/DRINKS focus on food/drink offers;
  STAY focuses on overnight accommodation. Food is conservatively typed as GASTRONOMY, drinks as DRINKS and rooms as OVERNIGHT_STAY; a food item is not inferred to be a full meal. These are partial profiles, not complete
  inventories. Unsupported facilities, diets and suitability are never filled.
  Simple explicit CHF menu-item prices can be projected with midday/evening
  conditions. PDF/OCR images, group restrictions, variants and uncertain units retain
  evidence only, without canonical prices.

MLX decoding omits unsupported `uniqueItems` and `if`/`then`/`else` keywords.
This does not weaken acceptance: ordinary values use the canonical authoring
validator. Profiles use `parseExperienceProfile(value, false)`, the canonical
**draft** parser; `reviewed:false` is mandatory. The normal authoring validator
still rejects such an unreviewed profile for persistence.

Offer names and nearby evidence on separate lines are bound to one original contiguous span (at most 1,100 characters), without crossing another selected offer. Source matching permits only whitespace and typographic quotation-mark changes,
then stores the original source span. Different words, digits or ordering fail.
Exact wording alone does not prove scope, truth, freshness or semantic entailment.

## Source retrieval and bounds

At most 10 Spots, 12 fields and six public HTTPS requests per Spot. The four fields
above are the evaluated pilot scope; other catalog fields use the generic contract
and are not certified by these tests. One-hop HTML discovery follows relevant menu,
contact and opening-hours links on explicitly supplied pages on the same host.
Set `discoverLinks:false` to use only the explicit URLs. No external search/model
provider, credentials, recursive crawl or redirects. Private DNS addresses are
rejected and the selected address is pinned for HTTPS.

DNS and each HTTP request have separate 15-second limits. Responses are limited
to 2 MB; source excerpts to 12,000 characters. HTML paragraph breaks are retained.
PDF text extraction requires local Poppler `pdftotext` on PATH or an absolute
`NUKNUK_PDFTOTEXT` executable path. It runs without a shell, with a ten-second
limit and 200 KB output cap, reading at most ten pages in content-stream order.
PDFs retain `layoutReviewRequired:true`: inspect the original layout and dates
before accepting menu/price associations. Image-only PDFs still need manual conversion/review; there is no fabricated text fallback.
Embedded JPEG/PNG menu images can be read with local Tesseract, without a provider.
Set `NUKNUK_TESSERACT` if it is not on PATH. `NUKNUK_OCR_LANGUAGES` defaults to
`eng`; use installed languages such as `deu+ukr+eng` for multilingual menus.
`TESSDATA_PREFIX` can point to a local trained-data directory. Missing languages
or OCR failures are explicit failures. OCR has a 15-second/200 KB bound and image
bytes are limited to 2 MB. For food/drink image menus, the model selects immutable IDs for recognizable price lines; original names and script are copied by code. Incomplete wrapped names are omitted. OCR text is **not a verified transcription**: inspect
names, digits and diacritics in the original. Image schedules require manual
verification. Canonical prices are never derived from OCR.

Up to four actual menu-image URLs can be discovered on a retrieved official page,
within the same six-request total. Externally hosted images retain `discoveredOn`
and the original asset hash; their official parent must pass the website gate.
Arbitrary alternate-host pages do not gain that exemption. HTML link discovery
is limited to explicit pages, with at most four queued page URLs to reserve space
for image assets. Cover sheets may consume this budget; no full-menu coverage is
claimed. The report links the asset and its embedding page. A ten-page limit is not a complete-document
coverage claim. Retrieval failures and truncated source text remain visible.

Model calls are sequential, temperature zero, thinking disabled, 1,800 output
tokens maximum, 90 seconds per request and four minutes per Spot's model phase.
No automatic semantic retries. Stop the owned server after tests; a client timeout
alone does not guarantee that the model has stopped generating.

## Review and persistence

`research.json`, per-Spot source/partial files and `review.html` stay in ignored
local directories. Each proposed field carries evidence URLs, retrieval times,
source-text hashes, prompt hash and latency; reports pin the model and contract.
Raw responses are retained for diagnosing failed interpretation. Public contact
information may occur in these reports; keep them local and remove when unneeded.

`REQUIRES_REVIEW` is not factual approval. Check the outstanding interpretation
and evidence issues against identity/address, offer/area scope, dates, price
basis, dietary conditions and conflicting schedules. A `TEXT_VERIFIED` evidence
check removes the need to repeat the exact text comparison, not these judgments. Partial profiles must never replace a
complete stored profile. Failed/unresolved results never become negative facts.

The CLI has no database client or write path. It does not create Spots, overwrite
values, self-approve profiles or produce import-ready output. After a fresh export
and human approval, persist accepted additions through the existing Admin workflow.
Automated conversion to an import batch is not implemented.

For operator inspection, the Admin World Knowledge page can open a local
`report.json` from this runner as a read-only Nuknuk draft. The browser renders
each proposed value, cited original text, unresolved field and source failure;
the file is not sent to the import API. This path has no preview or commit
control and cannot turn an unreviewed partial profile into a canonical claim.

## Evaluation record

The initial six-Spot baseline had 24 field requests: 16 failed, eight unresolved,
zero reviewable proposals. Full-profile generation also exceeded the 90-second
limit. The old CTO packet incorrectly pointed the Alexander restaurant at a hotel;
use the stored restaurant website and address instead.

A controlled small extraction on the same model correctly read a description,
telephone and dish in 3.7 seconds without grammar / 4.8 seconds with simple grammar.
Thinking mode exhausted 1,600 tokens after 37 seconds. The failure was therefore
not simply inability to read German: oversized/status-first contracts and source
layout materially affected the result. Intermediate tests also exposed invented
closed days, room-as-meal classification and mixed PDF columns; v4 adds explicit
controls and bounded extraction for these failure modes.

Runtime regression tests cover source boundaries, exact grounding, fax/phone,
unknown days, scoped prices, draft-only profiles, PDF failure handling and bounded
link discovery. Real-model results must be evaluated separately. Passing mocked
transport or schema tests does not establish CTO-level research quality.

The final representative pilot produced reviewable partial experience profiles
for all six existing Spots, containing 23 named offers in total (three hotel room
options and up to four offers for each other Spot). HTML, two PDF menus and an
embedded Ukrainian image-menu page were exercised. The image-menu test initially
transliterated/translated evidence incorrectly; selecting immutable OCR-row IDs
preserved the original names and script. Names were checked against the rendered
menu. Complex/PDF/OCR prices remain unprojected. This is a small development set,
not a held-out accuracy claim or complete inventory.

The supplemental audit still found a seasonal Amani announcement unsuitable as a
permanent description, conflicting schedules for Alchemist/Amani, and differing
Alexander HTML/image hours. These must not be treated as approved replacements.
The default fill-missing mode preserves the existing known description/contact/
hours fields. Current-value conflict checking still requires a fresh full export;
the evaluation's partial Admin observations are not import authority.

## Deterministic verification (nuknuk-evidence-v1)

Research no longer assigns every supported result the same review burden.
`AUTO_VERIFIED` means no repeat factual review is requested by this research
policy. Initially this covers only an explicit international telephone number
on a line containing the stored Spot name and street address, with exactly one
international number across retrieved sources and no conflicting stored value.
Missing retrievals or PDF/OCR/truncated sources prevent automatic phone approval.
This deliberately narrow first rule does not certify all contact-page layouts.

Each citation additionally gets an independent `TEXT_VERIFIED` or
`REQUIRES_REVIEW` evidence check. Verification requires a bound canonical export,
a matching stored website, name and street address in the source, an intact text
hash, an exact quote, non-truncated HTML/text and retrieval within 24 hours.
`TEXT_VERIFIED` confirms transcription only: it saves repeating a text comparison,
but does not establish that a named offer belongs to the right area, that an
announcement is a permanent description, or that a price applies to that offer.
PDF/OCR layout, prices, opening-hour scope and editorial interpretation still
need review. No numeric confidence score substitutes for these conditions.

The report records policy version, check time and reasons separately from model
output. Aggregate `humanReviewRequired` is false only when every requested field
is automatically verified or already preserved. Failed and unresolved fields
remain visible. Neither status grants import authority, sets a profile's
`reviewed` flag nor writes production data. The existing Admin persistence path
and its approval rules are unchanged. Cached pilot observations without the full
canonical export cannot be promoted to automatic verification.

## Kaphi regression corrections (v5 / evidence-v2)

`COFFEE_DAYTIME` now researches coffee, drinks and pastries rather than activities.
For supported explicit cafe prose, immutable product spans preserve a shared-prefix
variant list as one named offer; code never invents expanded variant names. Named
coffee and pastry patterns currently cover only a small German/English subset;
other supported profile categories retain the earlier extraction path. This is a
partial inventory, not a claim that all menu items were found.

Offering groups and amenities now use closed, evidence-bound enum selections.
Each selected value must have its own supported affirmative source sentence, and
validation repeats this check independently of the model's selection schema.
An unrelated exact quote no longer validates a unique, syntactically valid WIFI
or CLOAKROOM claim. Negative, conditional and historical phrases and PDF/OCR
material are excluded from these mappings. Currently covered groups are coffee,
baked goods, beer and wine; covered facilities are Wi-Fi, cloakroom, terrace,
playroom and explicit outdoor seating. Unsupported expressions remain open;
coverage is deliberately limited and does not imply an absent facility. Image
captions alone are not used to establish equipment availability or access rules.

Menu discovery ignores navigation controls and SVG assets. An already stored
phone can be reconfirmed from its exact normalized citation on an intact, fresh,
identity-checked official contact page even when address and number occupy
separate lines. This rule never applies to a different or missing stored number;
those still require the stricter explicit identity-bound phone rule. Retrieval
failures and competing numbers still block automatic confirmation. Policy v2
records `EXISTING_PHONE_RECONFIRMED` separately from a new contact fact.

The final eight-field Kaphi rerun produced five supported partial proposals
(phone automatically reconfirmed), three unresolved fields and zero failed fields.
It recovered Blue Mountain Coffee and the original shared Cornetto variant list,
and four explicit offering groups. Unsupported Wi-Fi/cloakroom no longer appears.
Opening hours, laptop permission and amenities without supported textual assertions
remain unresolved. Model-request elapsed time was 19.286 s, median 2.280 s per
field; source retrieval and model startup are excluded. Same export and requested
fields, freshly fetched official pages. This is a development regression case,
not a held-out accuracy result. 108 runtime tests cover the final implementation.

## Generalized assertion checks (v6)

Counterexamples beyond Kaphi exposed five additional false-positive facility
patterns: visitor wishes, outages, future plans, another branch and a nearby cafe.
Current-assertion filters now exclude these explicit uncertainty/scope markers;
facility predicates must attach to the equipment instead of a separate food offer
in the same sentence. English and German positive controls remain supported.
These are conservative bounded language rules, not a general semantic proof;
indirect or unsupported formulations remain unresolved or reviewable.

Cafe name extraction strips price/extra tails and deduplicates repeated names.
Independent profile validation rejects changed kinds or source spans when immutable
cafe candidates exist, and excludes explicitly uncertain cafe-offer quotes even
when there are no candidates. The pinned model weights are unchanged; request and
validation behavior are versioned as v6.

Validation: 111 runtime tests, core typecheck and repository/security gates passed.
Seven synthetic real-model cases passed (five negative assertions and two positive
controls). Replaying all eight Kaphi fields with the exact cached source package
preserved every value and status from the successful v5 run. This is regression
coverage, not an estimate of real-world accuracy across unseen Spots. All evaluation
artifacts stay local; no canonical data was changed and the owned model was stopped.

## Krafft corrections (v7)

Descriptions prefer exact sentences that explicitly state cuisine or what the
venue serves over atmospheric opening prose, when such sentences exist in the
primary source. No rewritten promotional description is generated.

Weather-limited affirmative terrace statements now establish TERRACE existence.
The exact weather qualifier remains in the citation; no unconditional opening
schedule, outdoor seating inventory or suitability claim is inferred. Negative,
future and nearby-venue statements remain excluded.

HTML extraction retains up to 12 actual same-host HTTPS menu links from the main
content, excluding header/nav/footer/aside sections. Exact recognized labels can
support partial LUNCH, DINNER and WINE groups. Bare text headings do not qualify.
Links containing numeric calendar dates are withheld pending separate validity
assessment; this excludes the expired Krafft weekly lunch menu without treating
it as current proof. Seasonal named menus remain reviewable, not automatically
certified as available on a particular visit date. Missing groups never remove
existing groups or imply the absence of an offering.

The Krafft regression comparison uses identical stored source-text hashes and
refreshes only link provenance from the matching official HTML. The canonical
weekly schedule remains unresolved when the source provides time windows without
weekdays. Restaurant service windows are not converted into kitchen hours.

Final real-model validation: all eight Krafft fields rerun with matching source
text hashes. The description now names French cuisine; partial groups DINNER/WINE
and TERRACE existence are recovered. Telephone, email and all four named dishes
match the earlier correct results. Weekday-less hours and unproven laptop policy
remain unresolved. Eight cached Kaphi fields were replayed as a value regression
check without fresh export authority; supported values remain intact. 114 runtime
tests, core typecheck and repository/security gates pass. Krafft model requests
elapsed 28.127 s total, median 2.523 s; Kaphi replay 15.040 s total, excluding startup
and retrieval. No canonical writes; owned model process stopped after evaluation.

## Cross-Spot generalization (v8)

A replay of the six earlier source packages found the same coverage gaps beyond
Krafft: Amber's explicit rooftop terrace and inflected German beer/wine names,
Airport Hotel's affirmative free-Wi-Fi label, and useful room/dish descriptions
competing with atmospheric or seasonal text. The general rules now recognize
these positive forms, preserve negative/outage/future/nearby exclusions and
validate short fixed facility labels against their exact source text. This is
still a bounded vocabulary, not unrestricted language understanding.

Menu label classification is shared by HTML extraction and independent enum
validation. It covers lunch/dinner card variants, spacing, wine labels and explicit
branded lunch-menu titles. Generic menus, sample/event titles, foreign hosts and
calendar-dated links still do not establish current general offering groups.
Actual links remain required; headings and mentions alone are insufficient.

Stable description candidates suppress seasonal closures, new-menu announcements,
signoffs and slogans, and prefer concrete room, cuisine, dish and service facts.
If none are supported, the field stays unresolved rather than substituting a
seasonal notice. Independent proposal validation enforces the same candidate
boundary; an exact quotation alone cannot bypass it.

Evaluation uses cached source packages rather than asserting current Spot facts.
Menu-link metadata is refreshed only when the fetched source-text hash exactly
matches the saved text. Amber's live pages changed, so its saved snapshot is kept
unchanged for the regression test without attaching fresh metadata. Source
identity/current-value approval and production persistence are separate concerns;
none of these evaluation outputs is an import-ready or automatically approved
production update. Missing mappings never erase existing facts.

Final v8 evaluation: eight cached Spot packages, 34 real-model field requests,
zero FAILED fields. Amber recovered BEER/WINE and TERRACE, Airport Hotel recovered
WIFI and a concrete room description, and Alchemist recovered DINNER from actual
menu links and a concrete Tavolata description. Amani's description remained open
instead of using seasonal text. All eight Krafft values and all eight Kaphi values
match their previous successful control runs. Candidate coverage before/after was
recorded for the six additional Spots; they were not all rerun with the old model
request version. 119 runtime tests, core typecheck and repository/security gates
passed. These small development cases do not establish general accuracy; unknown
fields remain unknown and local evidence remains outside Git.

## Fresh three-Spot evaluation (v9)

Three new current authenticated exports (Museum Tinguely, Nomad Eatery & Bar and
Unternehmen Mitte) were researched against freshly retrieved official HTML on
19 October 2026. Baseline: 24 fields, seven partial proposals, 12 unresolved,
five FAILED. This revealed missing HTML spacing entities/midnight parsing,
closing-only weekday exceptions, duplicate identical schedules, insufficient
cultural description/offer coverage, placeholder-email handling and unsupported
contact/boolean abstentions. Actual linked CDN menu PDFs were not being retrieved.

The v9 changes decode spacing entities, use main-content schedule rows when
available to avoid navigation-area schedules, and exclude explicit kitchen blocks.
A contiguous closing-only exception can inherit an opening time only from a
preceding complete range containing that weekday and exactly one interval; otherwise
it stays unresolved. Identical repeated weekday rows deduplicate; differing rows
still conflict. Midnight is 00:00 of the next day. Scope conflicts between genuine
Eatery/Bar schedules remain unresolved rather than being silently merged.

Emails are selected from exact bounded literal candidates; explicit spam-decoy and
placeholder domains are excluded and never reconstructed. Absent telephone evidence
stays unresolved. Null with supporting context remains an abstention, while malformed
output still fails. Explicit open Wi-Fi and stroller-space labels are supported;
these facts do not establish laptop permission. Cultural visit terms and common
named pastry spans are copied immutably within their supported category; this is
still a limited vocabulary and partial inventory.

Actual menu PDF links may use a public CDN when discovered on the approved official
parent. The same parent identity gate, public-network constraints, byte/time/request
limits and PDF layout-review requirement apply. External menu links establish a
partial group only after a matching-parent PDF has actually been fetched. The CLI
keeps the total six-request cap; no arbitrary external URLs gain identity authority.

Final fresh-case replay: same saved HTML bodies with corrected extraction plus two
observed Nomad menu PDFs, 24 fields, 14 supported partial proposals, ten unresolved,
zero FAILED. This is an end-to-end research-method comparison, not an isolated
model-only accuracy gain. Museum weekly hours include Thursday until 21:00; Mitte
main-venue weekly hours include midnight and remain separate from other branches;
Nomad recovers four named dishes while differing Eatery/Bar hours remain open.
Names were checked against the rendered Food Menu. There is no full-inventory,
held-out-accuracy or fully autonomous-discovery claim. 129 runtime tests, core
typecheck and repository/security gates pass. No canonical writes; owned model
processes stopped after both runs. Live exports, public-source snapshots and
review artifacts remain local and are excluded from Git.

## Evaluation discipline for v2

`nuknuk-evaluation.ts` binds every field assessment to a report hash and an
independent reference hash. All requested fields must be assessed exactly once.
Correct assertions, partial answers, omissions, incorrect assertions and justified
abstentions are distinct; false assertions, wrong subjects and missed reference
facts have separate counts. A technical successful exit or zero FAILED fields is
not an accuracy metric. Missing supported facts cannot count as correct
abstentions. Recorded reference checks do not certify every possible fact.

Development reports remain in ignored `.local/nuknuk-research/v2-heldout/`.
The first all-field extraction experiment abstained on all 24 fields across
Acero, Café Frühling and Fondation Beyeler. It exposed invented explanatory
conditions, copyright-year validity and a stored-URL redirect failure. That
experiment is explicitly a failed quality baseline, not a safe/reliable success.
The subsequent blocked-span all-field experiment also underperformed. v2 now
splits the model's tasks and uses literal parsers for non-generative facts.
Interrupted runs and model-unavailable results are excluded from quality claims.
The final real-model evaluation, exact source digests, independent pre-run checks,
source failures and field-by-field audit are recorded locally, with a summary
below after completion. Small samples cannot establish autonomous production
reliability. The same weights remain in use; no model training is claimed.

## V2 development acceptance, 19 October 2026

Code validation: 181 runtime tests and 373 world-knowledge core tests pass;
both typechecks and the relevant repository/security checks pass locally. The
incremental change classifier selects repository-security, world and supply-chain;
the manifest changes build/test scripts only and adds no dependency or lockfile
change. CI remains authoritative; no release, deployment, import or canonical
Spot write is authorized by this research adapter.

New development Spots were Acero, Café Frühling, Fondation Beyeler, Basler
Papiermühle, Volkshaus Basel and Restaurant Kunsthalle. These became development
cases during iteration and must never subsequently be called blind held-out
accuracy evidence. Before adopting different weights, use new independent cases.
The museum/hotel model comparison reuses identical freshly retrieved page bytes;
it isolates model interpretation, not autonomous discovery. The additional
restaurant run starts from its exported official seed and retrieves live sources.

The full restaurant run used four requests and 16 model calls in about 273 seconds.
It recovered public contacts, an original description and partial food offers,
but confused bar and restaurant schedules in its intermediate ledger; projection
held the conflict. It also selected the venue name as an offer. General fixes now
separate explicit operating-area labels before model verification and withhold a
verbatim duplicate of the target name as a concrete offer. These are explicitly
scoped repairs, not a claim that the entire eight-field run has been repeated on
the final code. A fresh single-field hours run and deterministic evidence replay
check the affected path separately. PDF-derived names remain layout-review drafts;
prices are never projected.

Known quality limitations remain material: source planning can spend budget on an
old linked PDF; the 9B critic can reject clearly supported target facts; general
venue names can still be less useful than concrete offers; coverage is partial.
The 27B download and its real-model comparison are not complete at this acceptance
point. The experimental route is not adopted as a proven improvement. Green tests
are software-contract evidence, not a certificate of autonomous research quality.

Final targeted results after moving deterministic eligibility before the critic:
the fresh restaurant hours run correctly held all three bar rows, but the critic
still rejected the valid restaurant row (one request, one model call). On the same
prepared museum/hotel pages, the museum description and activity profile remain
omissions; the hotel description is correct and its room profile partial, with a
missing Terrace-Suite and an overly general hotel-name entry. The raw language
regression remains 11/12. These are recorded failures and coverage gaps, not a
release pass. A replay of previously supported restaurant evidence demoted the
three bar rows and duplicate venue-name offer, promoted zero facts, recovered six
restaurant weekdays, left Sunday unknown and retained four price-free food names.
That replay is not a new model run. The local review summary and hashed audits
remain ignored under `.local/nuknuk-research/`; no customer/admin exports enter Git.

## v4.40 publication boundary

This release publishes the local draft-only research CLI and its versioned method. It does not deploy an unattended worker, change model weights, or write Spot profiles. The AREA booking catalog migration is included for coordinated review but requires its own production release approval before application. Until applied, area-scoped booking proposals may be reviewed as research evidence but must not be treated as successfully imported canonical profile data. Admin UI changes are a separate release.

## v4.41 source completeness repair

Observed singular/plural offer overview links are visitor research sources. Exact same-site reservation information paths may be fetched read-only, with no query, transaction submission or external booking traversal. Excluded transaction and campaign links retain their policy reason in SOURCE_LINK_EXCLUDED actions. Proximity text and postcode/city alone cannot complete a street-address field; incomplete addresses remain reviewable and discovery stays open. The fixed restaurant lexicon explains EAT as a category code, not a provider. The Marmaris v4.40 run is a failed quality fixture, not approved training data.

The v4.41 fresh Marmaris run confirmed the discovery/address fixes but exposed a second lexical bottleneck: a published house-specialities main-dish section was held while pizza/pasta passed. v4.42 admits this section context to the independent critic without asserting a meal schedule or bypassing negation, ownership or daypart restrictions. The frozen full run and the bounded fresh-model meal verification are distinct evidence; no new end-to-end latency is inferred from their sum.

v4.43 separates the source proposition from catalog naming: the independent critic verifies prepared main-meal dining existence. Only an eligible, non-negated ordinary dining assertion receives an auditable ORDINARY_MAIN_MEAL_TO_CATALOG mapping; software retains LUNCH/DINNER labels. The critic is not asked to find those literal labels on the website, and all schedule, ownership and property checks remain separate. The v4.42 model rejection is retained as evidence of the former contract mismatch.
