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
  "fields": ["description.highlight", "contact.phone", "hours.regular", "experience.profile"],
  "spots": [{
    "spotId": "11111111-1111-4111-8111-111111111111",
    "name": "Example Spot",
    "locality": "Basel",
    "sources": ["https://example.org/contact", "https://example.org/menu"]
  }]
}
```

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
  conditions. PDFs, group restrictions, variants and uncertain units retain
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
and are not certified by these tests. One-hop discovery follows relevant menu,
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
before accepting menu/price associations. Image-only PDFs need manual OCR/review;
there is no fabricated text fallback. A ten-page limit is not a complete-document
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

`REQUIRES_REVIEW` is not factual approval. Check every assertion against the
original source, identity/address, offer/area scope, dates, price basis, dietary
conditions and conflicting schedules. Partial profiles must never replace a
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
