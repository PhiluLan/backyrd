# Decision vNext OTA Readiness Report

Status: **NO-GO — Product runtime composition is not closed**

This report is a source-only release checkpoint. It does not authorize or
perform an EAS update, channel mutation, republish, deployment, migration,
secret read, runtime activation, or any other Production action.

## Accepted native baseline

- Accepted iOS identity: Build 57
- EAS build ID: `9baaf56b-36f2-4799-be18-cce5cf19f09d`
- App/runtime: `1.1.0`
- Channel: `production`
- The single-route candidate does not change `package.json`, lockfiles,
  `app.config.ts`, `eas.json`, native projects, or Expo plugins.
- A local inert iOS Expo export completed successfully with Hermes bytecode
  version 96, 46 assets, and no upload or Production access.
- Local bundle SHA-256:
  `9a97eec64add6ea43d6b74309b4cb2074118bc60f32cc2bacaec5ed6582443a7`
- Local export metadata SHA-256:
  `c95fd7083326fd0c97c38ce81dc0f8235cd9f0d675ebeef8095b926b04cee772`

These local export hashes are diagnostic evidence only. They are not the final
sealed release artifact and must be regenerated after the functional tree is
frozen.

## Current integration checkpoint

- Canonical base: `3ba36825017959b1c6b54bb2b0aefc987da06fa9`
- Integration branch: `codex/decision-vnext-single-route-cutover`
- Checkpoint head: `99aff9b4f7a9f3ca4faade9f56125631aee26cbb`
- Checkpoint tree: `40fea80e27aa51f8811f517ab987ce9050859aad`
- User Domain patch: original `2474bc627febb2c123a620067954358585c5d585`,
  integrated `9f760b9fc8216264e2e02b3cfbb11fefb4c244d0`, stable patch ID
  `cdb8becf59bbc21caf55ff92a6e0e1ebd9e325cc`
- Decision Domain patch: original `f9112356dae14e06cafb0f3a6c72630af8db7c44`,
  integrated `0bf964eea98283627062406189b0675a9513b194`, stable patch ID
  `f848942a04e7191109e17aad07f6ab1c9682f600`
- Product-v1 authority refactor: original
  `ec1997fb4f5aeee8e518f0699bbd4b8f0ac31d87`, original tree
  `41e690e410340bbe19954de092c807d0c9160fac`, integrated as
  `99aff9b4f7a9f3ca4faade9f56125631aee26cbb`. The authority and evaluator
  blobs are byte-identical; the documented additive overlap moves the existing
  same-route impression/open contracts into the new Product-v1 contract file.
- World/Admin cutover patches: original `9bb0aeb00c18768683c5b08cdea761df37e3ef9d`
  and `663a4c920939f63acee8601a3d4c37921923d10a`, integrated as `d32979b`
  and `eeea301` with identical stable patch IDs.

## Verified Product path

- Mobile and Web use one transport slug: `decision-v13`.
- The deployed entrypoint imports only `./vnext-only.ts`.
- The separate `decision-founder-live` Function is disabled in source config.
- Product request, response, impression, open, alternative, and contextual
  reject use strict versioned contracts on the same route.
- Product Context, World cohort, candidate assessment, intent classification,
  evaluation, and ranking are independent Product-v1 contracts. They do not
  import or relabel Founder Lab or synthetic cohort authority.
- Product intent policy SHA-256:
  `42832b387aa7adad838f9fef9fd25dc6fa73b3c48753aa471776bb9f7ff28c0a`
- Product ranking policy SHA-256:
  `5d71d1505970d54b67b1f92f6208a02ab5274894e35b7c70af436e76b3473472`
- Product evaluation policy SHA-256:
  `1fc6a43c571bdaaab7a8ca6d80c101a57148db50507ee2e9e9079acdc873896d`
- Product evaluation release SHA-256:
  `22bb5b7d24539339fed81982d7cad102e7c64a5a3401b9c65bd28c47709e940d`
- Client-provided identity, runtime authority, ranking authority, fallback, and
  legacy writeback are rejected.
- Mobile and Web display server presentations, ordering, availability, reasons,
  limitations, and honest unavailable states.
- Decision-originated Spot navigation does not invoke the old impression,
  feedback, memory, analytics, or review-link writers.
- Web and Admin legacy Decision histories are visibly identified as historical
  and are not presented as complete vNext projections.

## Runtime and data safety

- The new Product runtime control is append-only, release/generation bound,
  and created at generation zero in `OFF` state.
- There is no ON RPC. Service code can only read control or append an
  Emergency-OFF event.
- Product idempotency is isolated from the historical Founder store, bounded to
  24 hours, immutable, and service-only.
- The nine Product learning events retain their exact meanings. They are not
  translated into legacy Taste or Memory events and remain learning-ineligible
  until an exact Product consumer is authorized.
- No-consent, withdrawal, reset, erasure, wrong identity, wrong release,
  expired authority, and kill-switch paths fail closed before personal reads or
  writes.
- The migration and pgTAP contract were applied only to a local transactional
  test database and rolled back. Nothing was applied to Production.

## Green checkpoint gates

- Complete Decision suite, including Product-v1 and adapter tests: 219/219
- Single-route CI classifier tests: 5/5
- Repository scan against the actual Mobile, Web, Edge, generated binding, and
  Supabase config paths: pass
- User Product learning tests: 15/15
- Mobile single-route client tests: 6/6
- Mobile TypeScript, targeted lint, and Product contract suite: pass
- Web TypeScript and contract suite: 18/18
- Admin TypeScript and contract suite: 32/32
- World/Admin cutover target suite: 6/6
- Founder-live compatibility/control tests: 15/15
- SQL migration/authority/negative tests: pass with transactional rollback
- `git diff --check`: pass

These are checkpoint gates, not the final full Risk Gate or a release seal.

## Blocking runtime-composition gap

The Product-v1 semantic authority is now closed without relabeling Founder Lab
authority. The committed Product release remains deliberately
`runtimeActivated:false` and `productionExecutionAuthorized:false`.

The deployed source entry still injects unavailable evaluation and learning
ports. Before a release candidate can be sealed, Edge must compose the new
Product evaluator with the canonical `WorldKnowledgeReaderPort`, a
server-authorized and hash-bound candidate selection, the canonical minimized
User projection, and the exact `PRODUCT_RUNTIME` learning authority. No weaker
adapter, synthetic cohort, Lab authority, Legacy route, or fallback may fill
these ports. Until that composition and its negative tests exist,
`decision-v13` remains deliberately unavailable behind the OFF-default control.

## Remaining acceptance before any OTA proposal

1. Compose the Product-v1 evaluator from the canonical World reader,
   server-bound candidate selection, and canonical User projection.
2. Bind the canonical User `PRODUCT_RUNTIME` learning port to the external,
   exact-release authority and dynamic kill switch.
3. Freeze the functional tree and regenerate one Node-20 artifact, source set,
   Mobile binding, Production plan, and this report.
4. Run the complete repository, database, Decision, World, User, Mobile, Web,
   Admin, delivery, deployment, secret, and Risk gates once against the frozen
   candidate.
5. Merge only through the protected path, then pass the exact Main post-merge
   gate.
6. Obtain a new explicit Release-GO naming the exact Main SHA, tree, artifact,
   update identity, rollout cohort, monitoring thresholds, and rollback plan.
7. Perform physical-device validation of the exact installed update before any
   rollout expansion.

Final conclusion: **Production NO-GO. OTA not created, uploaded, published,
activated, or delivered.**
