# Phase 3C Real Founder Cohort Handoff

## Root cause

The Phase-3C Decision port required a manifest and a separately injected World reader. The actual “Founder World Cohort exportieren” file contained only identities and hashes. Offline Decision therefore had neither spot names nor immutable World values and correctly fell back to its synthetic world.

## Closed read-only flow

1. The existing local World authoring action freezes the cohort manifest.
2. Its authenticated read boundary loads the already-built snapshot for each selected spot.
3. `@backyrd/world-knowledge-core` removes contacts, precise coordinates, private references and commercial fields and creates `backyrd.world-knowledge.founder-cohort-handoff@1.0`.
4. The Founder downloads that one JSON file.
5. The loopback Decision Lab parses the complete contract, verifies scope, Registry, source policy, spot set, manifest hashes, source snapshot references and canonical content hashes, then shows a preview.
6. Only explicit confirmation activates it. The file is stored atomically outside Git with directory mode `0700` and file mode `0600`.
7. Evaluation and replay bind the handoff hash into the Decision cohort and result.

The consumer contract now also follows the Registry-2.0 `AGE_ACCESS_RULE_V2` shape emitted by local World authoring: `notes` belongs to the rule-set value, while each nested rule remains the closed seven-field condition. A nested or otherwise unknown field still fails closed. This closes the concrete `founder_handoff_unknown_field` import failure without weakening validation or changing World data.

No Decision process contacts Supabase, reads tables, changes Claims or writes World/User state. The handoff is `FOUNDER_EVALUATION_ONLY`, `productionAuthorized:false` and `productQualityClaim:false`.

## Degradation

- No import: clearly labelled synthetic test world.
- Invalid scope, Registry, policy, manifest, snapshot or content hash: fail closed before preview.
- One imported spot: evaluate it without adding fixtures and show that no meaningful ranking/comparison conclusion is possible.
- Reset: remove only the local Decision-Lab copy.

## Founder-facing proof

The browser flow is tested through an actual file chooser using the same `createFounderWorldCohortHandoff` export builder as the World route. Its five-spot integration fixture uses the canonical local Founder spot identities and names. The final manual retest additionally loads the local World export artifact itself; neither path synthesizes missing spots or mixes the Founder cohort with the fallback world.

## Candidate-evaluation closure

The imported snapshot's authorized `classification.primary_category` and `offering.groups` facts now feed a versioned, evaluation-only core-intent mapping. Candidate logic contains no spot names or spot IDs. A candidate can enter `ELIGIBLE_CONFIRMED` only when core intent, target location and every hard condition are confirmed. Missing World data remains an unconfirmed fallback, missing mapping authority remains `NOT_CONFIGURED`, and contradictory authorized facts remain incompatible.

The normal browser view exposes that core-intent state per spot, shows an explicit target city as a binding condition, and separates “Für diese Anfrage abgewählt” from objective hard-constraint failures. The controlled flip keeps drinks, Basel and hard conditions fixed while changing only the named situational dimensions. Direct comparison lists every spot's old/new group and reason deltas without making a ranking claim.

For the bound five-spot Founder export, both sides of that controlled drinks flip resolve to three confirmed candidates (Volta Bräu, Consum Weinbar and Café Frühling) and two unknown-data fallbacks (ELYS Boulderloft and Tierpark Lange Erlen). Café Frühling is confirmed by the authorized, current `offering.groups` fact containing `NON_ALCOHOLIC_DRINKS`, which is accepted by the versioned evaluation-only drinks mapping. This result follows the snapshot and policy rather than a name- or ID-specific exception. The regular Founder view translates limitations and reasons into German; raw reason codes and hashes remain available only after deliberately opening the expert view.

For an independent local acceptance run, set `PHASE3C_FOUNDER_COHORT_PATH` to the exported handoff (or its local state wrapper) before running `npm run decision-vnext:phase3c:ui:e2e`. The suite then exercises the real five-spot file through the same browser import and Decision consumer path and reports `realFounderCohort:true`.
