# Source, Verification, Freshness and Conflict Calibration

All options are `DRAFT_CANDIDATE`. They are simulations, not accepted Source Policies.

## Source landscape

| Source class | What it proves | Alone verified? | Main risk |
|---|---|---:|---|
| Owner assertion | An authorized owner made the statement | No | self-interest and staleness |
| Admin observation | An admin recorded an observation | No | human error and limited observation |
| Official website/social/document | Bound official content contained the value | No | identity, scope and update lag |
| Public/provider/municipal source | A named external record returned the value | No | record mismatch and provider lag |
| Independent manual check | A controlled observation/cross-check occurred | Only through an accepted process and authority | execution quality |
| System check | A deterministic consistency/reachability check passed | Only for its narrow approved scope | syntax is not reality |
| Research/legacy import | A source system supplied a candidate | No | semantic drift and missing provenance |
| User report | A contributor reported an experience | No | abuse and context loss |
| AI inference | A model proposed a candidate | Never | hallucination and unbound evidence |

“Source exists”, “source is referenced”, “source was read”, “source matches this fact”, “fact is confirmed” and “fact was independently verified” remain six separate states.

## Attribute-family policy options

Every one of the 25 Foundation areas has two machine-readable candidates in `POLICY_CALIBRATION_MATRIX`:

- **Referenced option:** policy-allowed actor/source plus a meaningful bound reference can reach `REFERENCED` and only the explicitly configured use cases.
- **Verified-sensitive option:** Eligibility, price, accessibility or hard constraints require a separately accepted verification process, execution authority and immutable record.

Neither option lets Admin, Owner, subscription or payment elevate trust. Missing stays absent; explicit unknown is retained. The recommended starting point is referenced for low-risk presentation and verified-sensitive for safety/eligibility facts, calibrated per attribute rather than globally.

## Verification process candidates

| Candidate | Narrow scope | Independence | Recommendation |
|---|---|---:|---|
| Owner relationship assertion | identity/contact submission authority | No | proves relationship only |
| Official source reference | public contact and schedules | No | creates reference evidence, not verification |
| Admin source cross-check | classification, offering, price/payment | Yes | candidate for accepted human process |
| Independent manual inspection | accessibility, amenities, capacity | Yes | preferred for physical hard constraints |
| Provider record match | location and public contact | Yes | narrow deterministic match only |
| Current-state observation | expiring operational state | Context-dependent | mandatory `valid_until` and bounded scope |

Any real process still needs Product approval, accepted execution authority, verifier identity binding, source requirements, allowed results, checked time, clock-skew rule, reverification reference and audit retention. AI-only execution is prohibited.

## Freshness / TTL candidates

No duration is activated. Candidate classes are:

- durable until contradiction: stable identity facts;
- long-lived with recheck: address, category, place type, capacity, amenities, accessibility;
- medium-term recheck: contacts, offerings, payment, takeaway and operational rules;
- short-term recheck: price;
- schedule-bound: regular and service hours;
- date-bound: special hours;
- `valid_until` required: current operational state;
- not automatically assessable: free-form description.

Expiry behavior is risk-specific. Current state becomes expired and cannot remain current. Mutable durable facts become stale/review-required rather than false. Schedules stay structurally present but cannot authorize eligibility once their fact-specific policy is unmet.

## Conflict sensitivity

| Conflict | May select current value? | Blocking scope | Evidence handling |
|---|---:|---|---|
| Owner vs official source | Not universally | affected use case | retain both |
| Admin vs Owner | Not universally | affected use case | retain both |
| Two official sources | Only by fact-specific policy | sensitive fact/use case | retain both and rationale |
| Current state vs durable fact | Yes, for its bounded time/scope | none if unambiguous | durable fact remains unchanged |
| Overlapping hours | No while unresolved | opening eligibility | preserve both schedules |
| Accessibility disagreement | No | accessibility/hard constraints | fail closed, manual review |
| Price disagreement | Possible display range only after policy | price readiness | retain alternatives |
| Duplicate external reference | No | identity mutation/merge | create work item, never move claims |

There is no universal Owner-wins, Admin-wins, official-wins or newest-wins rule.

## Synthetic calibration proof

The local harness runs the same claims under balanced-reference and conservative-verification candidates. It reports trust, source assessment, use-case authorization, readiness, freshness, conflicts, exclusions, Decision projection and deterministic hashes. Tests cover Owner hours, official-source hours, stale price policy, expiring/missing-expiry state, partial accessibility, AI-only research, official-source conflict and a payment/subscription counterfactual. Draft versions are rejected by default canonical readers unless the test explicitly injects their exact version/hash.
