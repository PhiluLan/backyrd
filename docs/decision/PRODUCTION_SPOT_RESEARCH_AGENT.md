# Production Spot Research Agent v2

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
- Backyrd deterministically validates typed values, compares accepted facts (`NEW/SAME/CONFLICT/STALE/UNSUPPORTED`), applies the existing official-source confidence policy and builds proposals. Age requires explicit numeric official support. Indoor alone never creates rain suitability.
- The database stores validated extractions, source-bound proposals, attempt metadata and pass disposition atomically and idempotently for response-loss replay.

## Data and operational contract

`backyrd_spot_research_jobs_v1` stores the durable job lifecycle. `backyrd_spot_research_passes_v2` stores independent Pass A/B state, response identity, retry and usage. `backyrd_spot_research_runs_v1` stores attempt traces; `backyrd_spot_research_extractions_v2` stores validated non-canonical evidence candidates. All are service-role only.

`backyrd_finalize_spot_research_pass_v2` persists one complete pass, sources, deterministic proposals, attempt metadata and next disposition in one transaction. Every response declares `canonicalWrite=false`. Existing proposal review, accepted facts, N4 and Gold Readiness are unchanged.

Admin invocation is available in Gold Authoring as **Spot recherchieren**. A successful run only adds visible PENDING proposals. The Admin must inspect the proposed value, exact source and excerpt before accepting it.

## Configuration

- `SPOT_RESEARCH_AGENT_ENABLED=true` enables internal execution. Unset/false is the kill switch.
- `OPENAI_API_KEY` remains server-only.
- `SPOT_RESEARCH_MODEL` may pin the approved integration model; default is `gpt-5-mini`.
- Deploy `research-spot`, `research-spot-worker`, and the updated scheduled `decision-engine-worker`. Public or automated bulk enrichment is not enabled by this foundation.

## Current intentional limitations

v2 researches only the Spot's official HTTPS domain. Spots without a trustworthy official website remain honest data gaps. Additional official institutional domains need an explicit future allowlist extension. No Basel bulk enrichment or automatic proposal acceptance is part of this change.
