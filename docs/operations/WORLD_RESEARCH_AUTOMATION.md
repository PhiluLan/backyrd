# World Knowledge research automation

Task class: DATABASE_PR + privileged-server Product release certification. This
extends the existing reviewed World import; it does not create a new canonical
fact writer or bypass Admin conflict decisions.

## Flow and authority

An authenticated Admin selects up to ten approved Spots in World Knowledge and
starts research. The Admin route creates a fresh one-Spot export using the same
catalog and hash binding as the manual JSON flow. A service-only database job
holds that export, leases one run to the existing scheduled internal worker,
and stores a proposal-only result. The browser polls progress and opens the
completed document in the existing preview. The existing Admin import RPC and
rebuild are the only path to canonical World Knowledge; no worker can invoke
them. Existing different or UNKNOWN values still require explicit review.

The provider receives Spot identity, public World values, the complete exported
field catalog and export instructions. It has web search, must consult target
pages, and must return a claim or a concrete unresolved reason for each
otherwise missing field. The worker rejects private/credential-bearing source
URLs, unconsulted source URLs, uncorroborated secondary sources and sensitive
evidence. It inserts the UTC observation time after receiving the completed
response. The unchanged World import parser is the final contract authority
when the Admin opens the proposal. Model output is not treated as proof:
the Admin must inspect the linked target page, value, evidence and conflicts.

## Operational controls

- Apply the forward migration through the normal, explicitly authorized
  Supabase production release. Do not edit a deployed schema manually.
- Deploy the changed `decision-engine-worker` via the same release plan. Its
  `LIVE_TICK` calls the World worker only when enabled, at most one job per tick;
  failures are isolated from the existing intelligence work.
- Set `WORLD_RESEARCH_AUTOMATION_ENABLED=true` in both Admin server and Edge
  worker only for an approved pilot. Unset/false disables new starts and worker
  execution; previously completed proposals remain readable for review.
- `OPENAI_API_KEY` is server-only in the Edge environment. Optional
  `WORLD_RESEARCH_MODEL` pins the tested research model; absent uses `gpt-5.5`.
  Never add either value to browser/public environment variables.
- The table and enqueue/claim RPCs are service-role-only. The Admin API checks
  the Admin session before using the service role, scopes job reads to that
  actor, limits to ten new jobs per rolling day, and reuses an active job for
  a repeated click by the same actor. A lease, three-create-attempt ceiling,
  sixty-poll/two-hour ceiling and persisted provider response ID bound retries.
- If a provider result is incomplete, invalid, or misses a trustworthy source,
  it is failed or left unresolved. The manual export/import route remains
  available. Never replace an unresolved field with `false` or an UNKNOWN claim.

## Pilot and recovery

Keep the switch off until the database clean-boot/authorization gate, Admin
contract/build gate, World contract gate, release certification and CI merge
gate are green. Then authorize a production release separately. Pilot with one
approved Spot and a human comparison to the operator's primary pages, checking
hours, subvenues, social links, existing-value conflicts, and source freshness
before widening scope. Check `FAILED` job codes in the Admin list without
logging provider payloads or credentials. If quality or cost is unacceptable,
turn off the switch in both server environments. Existing jobs remain durable;
no canonical facts are changed by stopping research.
