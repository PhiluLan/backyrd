# Gold Spot Authoring Foundation

Status: implemented on `codex/admin-gold-authoring-foundation`; not deployed. Decision Engine, N3, N5, N6 and organic ranking are unchanged.

## Canonical authoring path

```text
Admin / Founder / Owner / Research Agent
  -> source-bound typed proposal
  -> Admin/Founder review
  -> accepted Product fact
  -> frozen qualification mapper
  -> allowed evidence in the frozen 60-dimension N4 registry
  -> atomic N4 snapshot rebuild
  -> Gold Readiness
```

The browser cannot write accepted facts, N4 evidence, confidence, snapshots or readiness. Research uses a service-only proposal RPC and cannot write truth. An accepted proposal and its N4/readiness rebuild share one database transaction: the result is either the previous complete state or the new complete state.

## Roles and capabilities

| Actor | Spot scope | BASIC | DEEP | Accept truth | Rebuild/read N4 |
|---|---|---:|---:|---:|---:|
| Founder | all | yes | yes | yes | yes |
| Admin | all | yes | yes | yes | yes |
| Owner Basic | owned only | yes | no | no | read simplified |
| Owner Pro | owned only | yes | yes | no | read simplified |
| Research Agent | service-submitted spot | proposals only | proposals only | no | no |

The existing `FREE/PREMIUM` N4 entitlement is reused as the authoritative `BASIC/PRO` capability. Downgrade locks new Deep edits but never removes accepted Deep facts, evidence or N4. The legacy free-text intelligence RPC is Pro-only and remains explicitly non-canonical.

Public Owner V2 is compiled but off by default. It requires both `NEXT_PUBLIC_GOLD_AUTHORING_OWNER_V2=enabled` and the server-side public switch or an explicit Owner allowlist row. Existing Owner behavior is unchanged while the switch is off; server authorization remains authoritative regardless of UI state.

## BASIC and DEEP contract

### Owner Basic

- identity, contact, website, address/location and price
- description and media source
- primary category and basic place type
- regular opening hours and temporary status
- Family/Kids tri-state
- Indoor/Outdoor/Mixed
- basic accessibility facts
- reservation recommended and approximate duration
- basic audience suitability

### Owner Pro Deep Intelligence

- explicit age range and adult-supervision requirement
- detailed family characteristics and rain suitability
- controlled activity types
- detailed accessibility capabilities
- conversation and noise characteristics
- Solo, Date, Friends, Family, Groups and Work suitability
- occasion and daypart suitability
- reservation and duration character
- signature characteristics and controlled atmosphere descriptors

This is a semantic capability split, not an arbitrary column ratio.

## Typed facts and UNKNOWN

`backyrd_spot_fact_catalog_v1` defines field, section, capability, value kind, allowlist and engine role. Enums and multi-select values are allowlisted; structured objects are bounded. The contract models `UNKNOWN` separately from false. Proposal lifecycle is `PENDING`, `ACCEPTED`, `REJECTED`, `CONFLICT`, `STALE`, or `UNSUPPORTED`. Conflicting values become `CONFLICT` and do not silently replace accepted truth.

Fields are classified as `RAW_FACT`, `SUITABILITY_FACT`, `N4_EVIDENCE`, or `DISPLAY_ONLY`. Raw facts that have no frozen N4 mapping remain useful Product facts; no new N4 dimensions are created to improve completeness.

## Provenance and authority

Each source records spot, type, URL/reference, provider/title, observed/retrieved/checked timestamps, legal-use state and creating actor. Supported source types are:

1. official website/institution source;
2. official document, booking, event or government source;
3. approved structured provider;
4. verified Owner claim;
5. Admin-verified source;
6. Research proposal;
7. community, legacy and import with explicit labels.

Owner claims retain `OWNER_CLAIM`; marketing superlatives do not become truth merely because an Owner submitted them. Community reviews remain separate evidence. Existing verified legacy suitability is adapted with `LEGACY` provenance only—no age or other fact is invented.

## Qualification and N4

The mapper only emits evidence for concepts already present in the frozen registry. Current safe mappings include explicit family, indoor/outdoor, conversation and noise facts. Rain, age, activity and other structured facts remain available in `facts.suitability` when no frozen interpretation exists. N4 confidence is policy-derived and read-only.

Accepted changes supersede prior authoring evidence, synchronize structured suitability, rebuild the complete snapshot, and expose the new deterministic hash. Fixture/Test Spots are rejected by the Gold rebuild. Owner tier/payment never enters N4, eligibility, N5, reasons or ranking.

## Product surfaces

- Admin Spot Editor V2: typed fact/source proposal form, review actions, Readiness gaps, canonical N4 read-only view and legacy label.
- Owner editor: existing standard profile for Basic; legacy Deep section only for Pro; new typed Gold panel feature-flagged off for public rollout.
- Description load/save: Admin fields now load first after `upsert_spot_admin_content_v1`, fixing the previous reload bug.
- Gold Readiness: reports `GOLD_READY/PARTIAL`, coverage and separate `UNKNOWN/MISSING/STALE/CONFLICT` gaps. It is not recommendation confidence.

## Research-ready API

`backyrd_gold_submit_research_proposal_v1` accepts a typed value, source URL, observed time, bounded excerpt, confidence rationale, and contract/idempotency identity. It is service-only and always returns `canonicalWrite=false`. No online research or enrichment was run in this sprint.

## Operational validation

- clean local migration replay: pass;
- frozen registry count: 60;
- Admin and Owner web production builds: pass;
- focused new-file lint: pass;
- DB acceptance: Admin/Founder all-spot, own-spot isolation, Basic/Pro, fake entitlement denial, downgrade retention, typed validation, conflict, accept/reject boundary, atomic/repeat rebuild, Research proposal-only, N4 read-only and commercial isolation: pass;
- full repository lint remains red on pre-existing unrelated files; no new-file lint errors.

Production and public Owner rollout remain unchanged. Deploy the additive migration and Admin surface first; enable Owner V2 only through a separately authorized rollout.
