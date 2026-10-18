# Local Nuknuk Research

Status: local evidence-backed review drafts for existing Spots. No automatic
publication, production enrichment worker or import-ready batch.

The user decision is whether a sourced addition belongs in an existing Spot.
The fallback is manual research and the canonical Admin preview/commit flow.
Invented facts, wrong branches, offer-to-Spot inference, silent overwrites and
model self-approval are unacceptable. Grounding establishes where text came
from, not that the source or its interpretation is correct.

## Run

Build `npm run world-knowledge:build` first. Start the existing loopback-only MLX
server on `127.0.0.1:8088` with `mlx-community/Qwen3.5-9B-4bit`, revision
`8b2b98c00a6b4d291155e4890773ca8f769aee53`.

```sh
node scripts/world-knowledge/nuknuk-research.mjs manifest.json /absolute/model/path/8b2b98c00a6b4d291155e4890773ca8f769aee53 .local/research-output
node --test packages/spot-research-runtime/test/*.test.mjs
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

By default the four pilot fields are researched only when the export does not already contain a known value. Explicit `fields` selects fields for rechecking; all results still remain review drafts. Known values are never automatically rewritten.

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
