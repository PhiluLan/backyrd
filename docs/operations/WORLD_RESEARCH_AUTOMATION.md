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

The proposal-ready worker state is distinct from Admin review completion. A
reviewed job leaves the actionable list only after every proposed claim has
been resolved and any accepted claims have passed the existing canonical import
and reader rebuild. A fully reviewed no-change proposal can be explicitly
closed without writing World facts. Earlier proposals for the same Spot are
retained for audit but stop appearing as actionable after a later job is
reviewed. Historic jobs with complete, batch-bound import provenance are
recognized as already completed; partial imports are not silently closed.

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

## Release review (2026-09-29)

PR #406 is not a release authorization. The Founder approved only
`20260929193000_world_research_automation_jobs_v1.sql` with SHA-256
`2e1dca5cf05bc11b4d3dc64965c83e73323bffdfe76bedef38adf80a6a5b2b7d`
and explicitly accepted that no tested or guaranteed database rollback exists.
The migration is proposal-only and follows the already-shipped safety deletion
migration. The exact bytes are bound in `delivery/product-authority-v1.json`,
`scripts/ci/product-additive-migration-scope.mjs`, and the database release
evidence; this does not authorize any other SQL or bypass a failing gate.

Read-only Production inspection on 2026-09-29 found 169 applied migrations,
tip `20260929171915`, and no automation jobs table. The successful canonical
Main deployment run `36606832464` applied the safety deletion migration; its
audit and a fresh read-only migration list support the reconciled
`delivery/production-state.json`. Recheck immediately before release rather
than treating this ledger as a live monitor. Production already has an active
`decision-engine-worker` and a one-minute `backyrd-internal-live-worker-v1`
schedule; re-verify both immediately before release.

The Product release artifact now seals both `decision-v13` and
`decision-engine-worker` with its imported source modules. Its closure and
runtime checks cover the worker; the production deploy script must use the
verified artifact for both functions. No ad-hoc function deployment or Vercel
preview is production evidence. Keep
`WORLD_RESEARCH_AUTOMATION_ENABLED` unset in both Admin and Edge during
migration and deployment.

After all required PR gates are green, merge through the normal protected
workflow, then obtain a fresh backup timestamp, migration ledger, function
identity, Admin deployment identity and OFF-switch verification. Apply only
the reviewed versioned migration through the authorized release path; verify
the table, RLS, grants and enqueue/claim denial for `anon` and
`authenticated` before enabling any worker. Deploy the exact certified worker
and Admin candidate with both switches still OFF. Put `OPENAI_API_KEY` only in
the Edge server environment; confirm model availability, web-search support,
spend/rate bounds and background response retrieval before pilot. Enable both
switches for one approved Spot, verify the job reaches review, inspect the
opened primary pages and every proposed claim/conflict, and make no automatic
canonical import. On any fault, disable both switches first; retain job
evidence, stop further rollout, and use only reviewed forward correction for
database errors. No Production data copy or untested restore-success claim.
