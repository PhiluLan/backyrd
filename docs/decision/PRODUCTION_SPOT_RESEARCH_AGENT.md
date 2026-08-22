# Production Spot Research Agent v1

## Purpose and boundary

The Spot Research Agent prepares source-bound, typed proposals for the existing Gold Authoring review workflow. It is not a truth writer. Its only allowed flow is:

`Admin/Founder enqueue → durable job → background provider response → strict typed validation → PENDING proposals`

It cannot accept a proposal, write an accepted fact, rebuild N4, change Gold Readiness, create Reviews, or influence ranking. Admin/Founder review remains the canonical qualification boundary.

The implementation follows the official OpenAI Responses API contracts for [web search](https://developers.openai.com/api/docs/guides/tools-web-search) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): web content is an untrusted data source, while the response is constrained to a strict proposal schema.

## Safety model

- `research-spot` only enqueues or reads safe progress. The browser never waits for the provider.
- `research-spot-worker` and the scheduled `decision-engine-worker` claim jobs with leases. OpenAI Background Responses are resumed by provider response ID after worker restarts.
- Admin/Founder authorization is rechecked through the authenticated Gold profile RPC.
- Kill switch `SPOT_RESEARCH_AGENT_ENABLED`; default is disabled when unset.
- One explicit Spot per job; ten jobs per Admin per rolling day; at most twelve proposals per run. Double-clicks for the same Spot/contract/source scope return the active job.
- v1 requires an HTTPS official Spot website and restricts web search and every returned source URL to that domain. If the Spot record has no website, Admin/Founder may supply an explicit seed URL for that run; the seed only scopes research and is not written as canonical truth.
- Local, private-network, credential-bearing, non-HTTPS, cross-domain, and display-only claims fail closed.
- Every typed value is checked against the live server Fact catalog and then checked again by the transactional database proposal API.
- Provider text and URLs never become instructions. No opaque provider response, raw search result dump, secrets, or full pages are persisted.
- Provider output is accepted as a complete batch or rejected whole. The database batch is atomic and idempotent for response-loss replay.

## Data and operational contract

`backyrd_spot_research_jobs_v1` stores the durable `QUEUED → RUNNING → READY_FOR_REVIEW|FAILED|CANCELLED` lifecycle, lease, bounded retry count and provider response identity. `backyrd_spot_research_runs_v1` stores one bounded attempt trace. Both are service-role only.

`backyrd_finalize_spot_research_job_v1` persists sources, validated proposals, attempt metadata and final job disposition in one transaction through the existing proposal-only RPC. The response always declares `canonicalWrite=false`. Existing proposal review, accepted facts, N4 and Gold Readiness are unchanged.

Admin invocation is available in Gold Authoring as **Spot recherchieren**. A successful run only adds visible PENDING proposals. The Admin must inspect the proposed value, exact source and excerpt before accepting it.

## Configuration

- `SPOT_RESEARCH_AGENT_ENABLED=true` enables internal execution. Unset/false is the kill switch.
- `OPENAI_API_KEY` remains server-only.
- `SPOT_RESEARCH_MODEL` may pin the approved integration model; default is `gpt-5-mini`.
- Deploy `research-spot`, `research-spot-worker`, and the updated scheduled `decision-engine-worker`. Public or automated bulk enrichment is not enabled by this foundation.

## Current intentional limitations

v1 researches only the Spot's official HTTPS domain. Spots without a trustworthy official website remain honest data gaps. Other source classes, multi-source conflict comparison and safe automation policies require a separately reviewed extension. No Basel bulk enrichment or automatic proposal acceptance is part of this change.
