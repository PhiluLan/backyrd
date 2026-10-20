# Local Nuknuk Research v2

Status: experimental local evidence-backed review drafts for existing Spots. No automatic
publication, production enrichment worker or import-ready batch.

The user decision is whether a sourced addition belongs in an existing Spot.
The fallback is manual research and the canonical Admin preview/commit flow.
Invented facts, wrong branches, offer-to-Spot inference, silent overwrites and
model self-approval are unacceptable. Grounding establishes where text came
from, not that the source or its interpretation is correct.

## Active architecture: Research v2.6

Task class: FAST_PR. Owned paths: the local research adapter, public-source
reader, CLI, their tests and this document. No runtime client, shared catalog,
production worker, database, migration, import authority or model weight changes.
The CLI now uses `researchSpotV2` in `src/nuknuk-agent.ts`; the v9 field extractor
remains an API/regression reference, not the CLI execution path. The typed local adapter compiles to ignored `dist/` JavaScript for compatibility
with the repository’s Node 20 CI. Build and typecheck the adapter:

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
   link, while individual dated programme pages remain excluded. This is official-site link research, not an internet search engine or a browser
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

Supported v2 fields: description.highlight, contact.phone, contact.public_email,
hours.regular, experience.profile, offering.groups, amenity.features and
operation.laptop_policy. Other requested fields are explicitly unresolved. Named
offers remain bounded partial profiles (at most four), never full inventories.
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

The active default is the pinned local `mlx-community/Qwen3.5-9B-4bit`, revision
`8b2b98c00a6b4d291155e4890773ca8f769aee53`. An explicitly selected experimental
27B route is also supported: `mlx-community/Qwen3.5-27B-4bit`, revision
`45797d2985a12c55e6473686e9ea91b95e959553`, with a 240-second request timeout
and 15-minute default Spot budget. It is not automatically selected or downloaded
by the CLI. Larger weights are not evidence of better Backyrd performance; do not
promote this route until measured on identical sources, errors, useful coverage,
latency and memory. Neither route uses an external AI API. Existing v9 entry
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
pre-run references, zero incorrect facts or venue misattributions, at least 30%
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
