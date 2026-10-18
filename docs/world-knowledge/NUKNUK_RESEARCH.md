# Local Nuknuk Research pilot

Status: proposal-only pilot, not a production enrichment worker.

The user decision is whether sourced additions belong in an existing Spot. The
fallback is manual research and the existing Admin authoring/research-batch flow.
Invented facts, wrong branches, area-to-Spot inference, silent overwrites and
model self-approval are unacceptable. Exact quotes and canonical validation help
review; they do not establish that a claim follows from a source.

## Run

Build `npm run build --workspace @backyrd/world-knowledge-core` first. Start the
existing local MLX server on `127.0.0.1:8088` with
`mlx-community/Qwen3.5-9B-4bit`, revision
`8b2b98c00a6b4d291155e4890773ca8f769aee53`. Keep the server loopback-only.

```
node scripts/world-knowledge/nuknuk-research.mjs manifest.json /absolute/model/path/8b2b98c00a6b4d291155e4890773ca8f769aee53 .local/research-output
node --test packages/spot-research-runtime/test/*.test.mjs
```

Manifest example (replace the synthetic identity with the intended existing Spot):

```json
{
  "fields": ["description.highlight", "contact.phone", "hours.regular", "experience.profile"],
  "spots": [{
    "spotId": "11111111-1111-4111-8111-111111111111",
    "name": "Example Spot",
    "locality": "Basel",
    "sources": ["https://example.org/contact"]
  }]
}
```

Optional `exportPath` points to a current Admin `world-research-batch@1.1` export.
Its existing catalog and manifest validation remains authoritative. Without this
export the output explicitly lacks current-value/conflict comparison. An input
name and URL list do not independently prove that a Spot exists or that a source
belongs to the right branch. The operator must select the correct identity and
sources before running. With an export, source hosts must match the stored website
(ignoring www); other hosts require manual identity review and are skipped. A host
match still does not prove branch or entity identity.

## Bounds and evidence

At most 10 Spots, 12 fields per Spot, 6 explicit public HTTPS URLs per Spot.
No recursive crawl, search provider, website credentials or redirects. Private
DNS addresses are rejected and the selected address is pinned for HTTPS.
DNS and each HTTP fetch have separate 15-second limits; responses are bounded to
2 MB and model excerpts to 12,000 characters per source. HTML and plain text are
supported; PDFs and JavaScript-only pages require manual research for now.
Truncated material and unavailable sources remain visible in the saved evidence.

One local model request at a time, temperature zero, 5,000 output tokens maximum,
90 seconds per request and four minutes per Spot's model phase. No automatic
semantic retry. These are new pilot bounds, not measurements of the CTO's manual
research. Stop the owned model server after testing; a client timeout alone does
not guarantee the model server has stopped generation.

Every field has a status, exact source quotes where proposed, retrieval timestamp,
source-text hash, latency and prompt hash where available. Reports identify the
model revision and contract version. `research.json`, per-Spot source/partial JSON
and `review.html` stay in ignored local output directories, not Git. Public source
material and raw model responses can contain contact details; keep reports local
and delete them when no longer needed. No provider keys or private profile data
are needed for the initial pilot.

## Human review and persistence

`REQUIRES_REVIEW` means format and quoted text passed checks, not factual approval.
Check every individual assertion, branch, offer/area scope, date, price unit,
opening/last-order distinction and contradiction. `FAILED` and `UNRESOLVED` are
never converted to facts or negative answers. Structured profiles cannot set
`reviewed:true` themselves.

The command has no database client, insert/update path or import-ready output.
It neither creates Spots nor overwrites existing values. After a fresh export and
human review, use the existing Admin preview/commit workflow to persist accepted
additions. Automated conversion to an import batch is not implemented. This keeps
conflict handling and authorization in the canonical flow.

Run the runtime tests for boundary/format regressions. Real-model quality must be
assessed separately; mocked transport tests do not certify semantic correctness.

## Pilot findings, 2026-10-18

The initial six-Spot run covered 24 field requests: 16 failed validation and 8
were unresolved, with no accepted proposals and no canonical writes. The initial
string-encoded JSON value was replaced by a directly typed value in contract v2.
A subsequent live telephone extraction produced a correct quoted proposal in
about 12 seconds, but a later prompt variant incorrectly described that same
contact number as a fax. This is a measured semantic failure, not production
readiness. The initial thermal monitor reached fair pressure, not serious pressure.

The local MLX grammar compiler rejects `uniqueItems` and `if`/`then`/`else`.
These keywords are omitted only from the decoding grammar. The complete field
contract stays in the prompt and every proposal still passes the canonical
validator before review. Never treat decoding as validation.

The current authenticated Admin export showed existing values on all six Spots.
Description, telephone and regular hours were already present; the scoped
experience profile was absent. The Alexander Spot was a restaurant while the
old manual research packet pointed at a hotel. Hotel results must be discarded.
Alternative source domains require identity review; matching names are insufficient.
Do not batch-import this pilot or use it to certify the existing stored values.

Version v3 bounds each experience-profile proposal to one offer and one area.
Reports mark this as a partial profile; it must never replace a stored complete
profile. This follows a live test that exceeded the 90-second request limit while
trying to generate the full profile. Batching/merging many partial profiles is not
yet implemented. The syntax-only compiler regression passes; that does not imply
that the model has correctly understood the source.
