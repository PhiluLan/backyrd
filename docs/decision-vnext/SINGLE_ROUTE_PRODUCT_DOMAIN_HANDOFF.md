# Decision vNext single-route product domain handoff

Status: domain patch for Integration; no deployment or runtime activation.

## Fixed architecture

- `decision-v13` is the single stable transport slug. Its integration-time implementation must invoke only Decision vNext.
- There is no Founder product route, UUID allowlist, engine selector, dual run or fallback in the product contract.
- Every successfully authenticated Backyrd account may call the product handler. Runtime capability, kill switch, rate limit, idempotency and canonical World/User/Context ports remain mandatory.
- Failures return an explicit `UNAVAILABLE`/denied response and never invoke Legacy.
- The client controls only the product request. Actor, server time, location authority, ports, policies and engine identity are server-bound.

## Contracts

Canonical runtime schemas and inferred TypeScript types live in:

- `src/product-v1-contracts.ts`
- `src/product-v1-authority.ts`
- `src/product-v1-evaluator.ts`
- `src/product-decision.ts`

Versions:

- request: `backyrd.decision-vnext.product-request@1.0`
- context: `backyrd.decision-vnext.product-context@1.0`
- World cohort: `backyrd.decision-vnext.product-world-cohort@1.0`
- candidate assessment: `backyrd.decision-vnext.product-candidate-assessment@1.0`
- intent policy: `backyrd.decision-vnext.product-intent-policy@1.0`
- response: `backyrd.decision-vnext.product-response@1.0`
- envelope: `backyrd.decision-vnext.product-envelope@1.0`
- ranking policy: `backyrd.decision-vnext.product-ranking-policy@1.0`
- evaluator result: `backyrd.decision-vnext.product-evaluation@1.0`
- evaluator policy/release: `backyrd.decision-vnext.product-evaluation-policy@1.0` / `backyrd.decision-vnext.product-evaluation-release@1.0`
- product presentation: `backyrd.decision-vnext.product-presentation@1.0`
- canonical User learning input: `backyrd.user-intelligence.product-decision-learning-input@1.0`
- required User write port: `backyrd.user-intelligence.product-decision-learning-port@1.0`

The normal response includes the canonical spot identity, product-safe presentation, eligibility tier, core-intent coverage, actual availability, hard-constraint proofs, transparent rank vector, reasons and limitations. Commercial and Owner fields have no schema channel.

The Product evaluator is an independent authority boundary: Product Context, World cohort, intent policy and candidate assessment do not import or accept Founder-Lab contracts. It rejects Phase-3C Lab flags, Founder cohorts, fixture authority and synthetic fallback sources. Its pinned release approves the explicitly authorized Product-v1 semantics and ranking while deliberately keeping `runtimeActivated:false` and `productionExecutionAuthorized:false`; Integration must seal and activate an exact combined release rather than relabel a Lab result.

Candidate generation is server-owned. The evaluator accepts a hash-bound candidate-ID set from an injected neutral selection port and reads every item through the canonical `WorldKnowledgeReaderPort` under the accepted World source policy. It has no direct table, ledger, Founder-manifest, spot-name, commercial or array-position path. The closed Product-v1 matrix covers eating, coffee, drinks, sport/movement, nature/animal experiences, culture/art and activities/experiences. Specific classifications take precedence over broad domains; embedded or part-of-spot offerings never confirm the primary intent.

## Ranking policy v1

The comparator is deterministic and lexicographic:

1. hard constraints and contextual rejection;
2. eligibility tier;
3. confirmed core-intent coverage;
4. actual availability at the target time;
5. consented direct-spot relevance from the canonical `RelevantUserProjection`;
6. situational context fit;
7. conflict-free World evidence and confirmed evidence count;
8. a content hash of canonical spot and snapshot identity only as the neutral final tie-break.

Fixture order, display name and commercial state are forbidden. User Intelligence cannot modify eligibility. Candidates that fail a hard constraint, are contextually rejected, or have incompatible/disputed core intent receive no rank.

## Alternative, reject and learning

- `previouslyPresentedCandidateIds` advances Alternative to the next permissible candidate without creating a negative signal.
- `rejectedCandidateIds` are scoped to Spot × Decision × Context and never create a World fact.
- Active projections produce only canonical `ProductDecisionLearningInput` values without raw text. Decision defines no parallel event schema.
- Neutral projections—including `NO_CONSENT`—produce no learning event while Decision remains usable.
- Decision-request, Alternative and contextual Reject use deterministic event and idempotency identities. The same canonical builder supports server-bound `candidate_impression` and `candidate_opened`; Mobile supplies an action, never User, policy or signal authority.
- The canonical User port owns consent, lifecycle, authority and idempotent repository persistence. Decision does not write User state directly.
- A retry revalidates the durable Decision replay, then resubmits the same deterministic User inputs. The User repository returns `REPLAYED`, preventing duplicate learning; receipt implementation details do not alter the byte-identical Decision response.

## Runtime capability boundary

`createDecisionProductHttpHandler` requires an injected `control.assertBoundary()` at request start, Auth, rate limit, body parsing, evaluation, idempotency, learning and final output. Integration must bind this interface to the externally rooted, process-local capability pattern from PR #312. The domain package deliberately cannot mint that capability. One deadline races every asynchronous stage and propagates a shared `AbortSignal`; hanging Auth, evaluation, idempotency or learning therefore produces visible `REQUEST_TIMEOUT` and no Legacy fallback. Integration adapters must honor that signal before and during I/O.

## Integration conflicts to resolve

1. Use the canonical User head containing `product-decision-learning.ts`. The final adapter must return the canonical neutral `NO_CONSENT` projection and invoke the canonical learning write port; Decision must synthesize neither projection nor consent outcome.
2. The existing durable Decision idempotency adapter is typed to Founder execution. Integration needs a narrow adapter to the same canonical durable store for `DecisionProductExecution`; no second store or migration is required.
3. The World integration must provide a hash-bound `DecisionProductPresentation` for every evaluated candidate. It must not use direct Mobile table reads.
4. PR #312 authority records are Founder/read-only/ranking-false. Integration must issue a new exact-release product authority; it must not relabel the Founder authority.
5. Mobile and Edge still contain `EXISTING_ENGINE`, `legacyBody`, `fallbackFunction` and v13 response code. Those are Integration-track deletions and are not part of this domain-only commit.

## Fast lane

Run:

```bash
npm run typecheck --workspace @backyrd/decision-vnext-core
npm run build --workspace @backyrd/decision-vnext-core
node --test packages/decision-vnext-core/test/product-decision-single-route.test.mjs
```

The final combined candidate still requires the complete repository Risk Gate. This domain handoff intentionally does not generate release evidence or activate a runtime.
