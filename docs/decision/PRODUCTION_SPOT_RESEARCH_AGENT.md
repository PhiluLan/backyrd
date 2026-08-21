# Production Spot Research Agent v1

## Purpose and boundary

The Spot Research Agent prepares source-bound, typed proposals for the existing Gold Authoring review workflow. It is not a truth writer. Its only allowed flow is:

`Admin/Founder request → official public source research → strict typed validation → PENDING proposals`

It cannot accept a proposal, write an accepted fact, rebuild N4, change Gold Readiness, create Reviews, or influence ranking. Admin/Founder review remains the canonical qualification boundary.

The implementation follows the official OpenAI Responses API contracts for [web search](https://developers.openai.com/api/docs/guides/tools-web-search) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): web content is an untrusted data source, while the response is constrained to a strict proposal schema.

## Safety model

- Server-only Edge Function: `research-spot`.
- Admin/Founder authorization is rechecked through the authenticated Gold profile RPC.
- Kill switch `SPOT_RESEARCH_AGENT_ENABLED`; default is disabled when unset.
- One explicit Spot per invocation; ten runs per Admin per rolling day; at most twelve proposals per run.
- v1 requires an HTTPS official Spot website and restricts web search and every returned source URL to that domain. If the Spot record has no website, Admin/Founder may supply an explicit seed URL for that run; the seed only scopes research and is not written as canonical truth.
- Local, private-network, credential-bearing, non-HTTPS, cross-domain, and display-only claims fail closed.
- Every typed value is checked against the live server Fact catalog and then checked again by the transactional database proposal API.
- Provider text and URLs never become instructions. No opaque provider response, raw search result dump, secrets, or full pages are persisted.
- Provider output is accepted as a complete batch or rejected whole. The database batch is atomic and idempotent for response-loss replay.

## Data and operational contract

`backyrd_spot_research_runs_v1` stores only bounded operational metadata: Spot/actor identity, contract/model, input hash, provider disposition, token counts, latency, proposal count, failure code, and timestamps. It is service-role only.

`backyrd_gold_submit_research_batch_v1` persists validated proposals in one transaction by using the existing proposal-only RPC. The response always declares `canonicalWrite=false`. Existing proposal review, source provenance, qualification, N4 rebuild, and Gold Readiness behavior are unchanged.

Admin invocation is available in Gold Authoring as **Spot recherchieren**. A successful run only adds visible PENDING proposals. The Admin must inspect the proposed value, exact source and excerpt before accepting it.

## Configuration

- `SPOT_RESEARCH_AGENT_ENABLED=true` enables internal execution. Unset/false is the kill switch.
- `OPENAI_API_KEY` remains server-only.
- `SPOT_RESEARCH_MODEL` may pin the approved integration model; default is `gpt-5-mini`.
- Deploy with `supabase functions deploy research-spot`. Public or automated bulk enrichment is not enabled by this foundation.

## Current intentional limitations

v1 researches only the Spot's official HTTPS domain. Spots without a trustworthy official website remain honest data gaps. Other source classes, scheduled queues, multi-source conflict comparison and safe automation policies require a separately reviewed extension. No Basel bulk enrichment or automatic proposal acceptance is part of this change.
