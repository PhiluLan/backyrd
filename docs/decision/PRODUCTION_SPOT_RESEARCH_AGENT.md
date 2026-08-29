# Production Spot Research Agent v2.1

## Purpose and boundary

The Spot Research Agent prepares source-bound, typed proposals for the existing Gold Authoring review workflow. It is not a truth writer. Its only allowed flow is:

`Admin/Founder enqueue → durable job → compact Pass A/Pass B evidence extraction → deterministic Backyrd validation/comparison → review proposals`

It cannot accept a proposal, write an accepted fact, rebuild N4, change Gold Readiness, create Reviews, or influence ranking. Admin/Founder review remains the canonical qualification boundary.

The implementation follows the official OpenAI Responses API contracts for [web search](https://developers.openai.com/api/docs/guides/tools-web-search) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Web content is untrusted data. The provider extracts only compact evidence candidates; it does not classify, recommend, score or construct proposals.

## Safety model

- `research-spot` only enqueues or reads safe progress. The browser never waits for the provider.
- `research-spot-worker` and the scheduled `decision-engine-worker` claim jobs with leases. OpenAI Background Responses are resumed by provider response ID after worker restarts.
- Admin/Founder authorization is rechecked through the authenticated Gold profile RPC.
- Kill switch `SPOT_RESEARCH_AGENT_ENABLED`; default is disabled when unset.
- One explicit Spot per job; ten jobs per Admin per rolling day. Double-clicks for the same Spot/contract/source scope return the active job.
- Pass A covers objective core facts. Pass B covers separate deep facts. Each pass is independently atomic and has at most one technical retry. A complete pass can remain reviewable if the other pass fails.
- Each pass receives only Spot identity, its official domain, its small allowlisted Fact subset, compact typed schemas and source policy. Accepted facts and wider Engine/N4/Gold contracts never enter the provider request.
- v2 requires an HTTPS official Spot website and restricts web search and every returned source URL to that domain. If the Spot record has no website, Admin/Founder may supply an explicit seed URL for that run; the seed only scopes research and is not written as canonical truth.
- Local, private-network, credential-bearing, non-HTTPS, cross-domain, and display-only claims fail closed.
- Every typed value is checked against the live server Fact catalog and then checked again by the transactional database proposal API.
- Provider text and URLs never become instructions. No opaque provider response, raw search result dump, secrets, or full pages are persisted.
- Provider output is accepted per complete pass or rejected whole. Truncated output creates zero proposals for that pass. Valid UNKNOWN is not retried.
- Backyrd deterministically validates typed values, compares accepted facts (`NEW/SAME/CONFLICT/STALE/UNSUPPORTED`), applies the existing official-source confidence policy and builds proposals. Every extraction is scoped as `SPOT`, `EVENT`, `PROGRAM`, `TEMPORARY`, or `UNKNOWN_SCOPE`; only `SPOT` evidence can create a general Spot proposal. Age requires explicit numeric official support. Indoor alone never creates rain suitability.
- Policy `backyrd-spot-research-policy-v2.2` limits review proposals to objective `identity.name`, `contact.website`, `category.primary` (plus its deterministic `place_type` adapter), `opening.regular`, `activity.types`, and `accessibility.capabilities`. Qualitative or contextual Pass-B evidence remains an auditable extraction but cannot create routine proposals. The policy identity is part of the durable source-scope hash, so a policy replay is explicit and independently idempotent.
- Official root and `www` hosts are treated as the same boundary; unrelated sibling domains still fail closed. Supported evidence must carry a non-null exact typed value. The per-pass output ceiling is 2,600 tokens, still below the pre-existing 2,896-token safety bound.
- The database stores validated extractions, source-bound proposals, attempt metadata and pass disposition atomically and idempotently for response-loss replay.

## Data and operational contract

`backyrd_spot_research_jobs_v1` stores the durable job lifecycle. `backyrd_spot_research_passes_v2` stores independent Pass A/B state, response identity, retry and usage. `backyrd_spot_research_runs_v1` stores attempt traces; `backyrd_spot_research_extractions_v2` stores validated non-canonical evidence candidates. All are service-role only.

`backyrd_finalize_spot_research_pass_v3` persists one complete pass, scoped extractions, sources, deterministic proposals, attempt metadata and next disposition in one transaction. Every response declares `canonicalWrite=false`. Existing proposal review, accepted facts, N4 and Gold Readiness are unchanged.

Admin invocation is available in Gold Authoring as **Spot recherchieren**. A successful run only adds visible PENDING proposals. The Admin must inspect the proposed value, exact source and excerpt before accepting it.

## Configuration

- `SPOT_RESEARCH_AGENT_ENABLED=true` enables internal execution. Unset/false is the kill switch.
- `OPENAI_API_KEY` remains server-only.
- `SPOT_RESEARCH_MODEL` may pin the approved integration model; default is `gpt-5-mini`.
- Deploy `research-spot`, `research-spot-worker`, and the updated scheduled `decision-engine-worker`. Public or automated bulk enrichment is not enabled by this foundation.

## Current intentional limitations

v2 researches only the Spot's official HTTPS domain. Spots without a trustworthy official website remain honest data gaps. Additional official institutional domains need an explicit future allowlist extension. No Basel bulk enrichment or automatic proposal acceptance is part of this change.

## Controlled Production v2.1 final pilot — 2026-08-22

The single authorized logical job `6d3ad430-58a9-430f-8b31-18740880b7cd` researched Naturhistorisches Museum Basel (`ab4da026-0d47-4ea1-b626-5293106b4fc2`) against `www.nmbs.ch`. Its original strict-schema HTTP 400 attempts were recovered in place; the unchanged original start time and one-row job identity prove that no second logical job was created.

- Strict Structured Outputs now uses an explicit type for every enum constraint and exact field-specific value schemas. The historical v2 Pass-B weakness was an arbitrary `typed_value_json` string that allowed a value outside the canonical field contract and was correctly rejected as `research_typed_value_invalid:0`; the server validator was not relaxed.
- Pass A, technical attempt 2: provider reached, two web searches, 15,234 input and 1,777 output tokens, then `incomplete:max_output_tokens`. Pass atomicity held: zero extractions and zero proposals. No third attempt was made.
- Pass B, technical attempt 2: complete provider response, two web searches, 13,052 input and 1,168 output tokens. Two validated extractions produced exactly one `SPOT` proposal. The EVENT extraction remained trace-only and `UNSUPPORTED`.
- The one review proposal is `time.dayparts = [MORNING, AFTERNOON, WEEKDAY, WEEKEND]`, `NEW`, deterministic confidence `0.90`, from the official opening-hours page. Human recommendation is `REVIEW`, because a reviewer must confirm that the canonical daypart field is intended to express operating availability rather than qualitative suitability.
- The suppressed EVENT evidence is `social.suitability.family = SUITABLE` from the “Night at the Museum” event for children aged 6–10. It created no general family or age proposal. Age therefore remains UNKNOWN.
- The final technical execution window was about 61 seconds. Combined provider usage was 28,286 input tokens, 2,945 output tokens, and four web searches. At the 2026-08-22 GPT-5 mini and web-search list prices, estimated cost was USD 0.052962.
- Production safety before/after: accepted facts 0; canonical N4 fingerprint `bf1f7c9a99688e55908028b3b5d6662cdb129c3824e174cf591ca60469c4d3b4`; 0 concepts; Gold Readiness `PARTIAL 45%`; Spot reviews 0; Spot memory events 0. Ranking was not invoked or written. The kill switch was returned to disabled.

That historical pilot remained correctly classified as not ready for a 60-Spot batch. Its evidence and proposal history are preserved. The later Basel City Bootstrap pilot is the reason for the independently versioned v2.2 policy above; no automatic acceptance is enabled.
