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

No Decision process contacts Supabase, reads tables, changes Claims or writes World/User state. The handoff is `FOUNDER_EVALUATION_ONLY`, `productionAuthorized:false` and `productQualityClaim:false`.

## Degradation

- No import: clearly labelled synthetic test world.
- Invalid scope, Registry, policy, manifest, snapshot or content hash: fail closed before preview.
- One imported spot: evaluate it without adding fixtures and show that no meaningful ranking/comparison conclusion is possible.
- Reset: remove only the local Decision-Lab copy.
