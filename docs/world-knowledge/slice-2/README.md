# World Knowledge Slice 2

Status: isolated contract and read-only adapter prototype. No database, UI, Decision runtime, migration, or production activation.

Canonical base: `origin/main` at `6f2f259e1bd82f4fbdb56b14dab61ff2bfed6f1a`. This includes World Knowledge Slice 1 (`29db4bee3ed7207f9ecaf8cd711045cf40a063bb`), User Intelligence Phase 1 (`c6092ba`) and Decision vNext Phase 1 (`ff96cba`). PR #270 remains research evidence only.

The implementation is in `packages/world-knowledge-core`: `governance.ts`, `source-policy.ts`, `verification.ts`, `legacy-mapping.ts`, and `legacy-adapter.ts`. Every output is runtime validated or constructed from validated input, version-bound, canonicalized and SHA-256 hashed.

## Truth boundary

- **Implemented contract:** registry transitions, source assessments, verification-process and execution-authority bindings, verification records, conservative legacy adaptation, and policy-filtered projections.
- **Locally proved behavior:** synthetic positive and adversarial tests demonstrate that recomputed outer hashes cannot bypass policy, authority, history, alias, or temporal validation.
- **Not yet a production authority:** the accepted authority catalogs are injected test contracts. Real identities, credentials, approval services, verification executions, policy distribution, storage, and revocation remain future work.
- **Supabase evidence:** documentation describes repository migrations and declared grants/policies only. Production was not queried, so it makes no claim about effective live state.

Decision vNext remains unconnected to a production World policy. Its deterministic sandbox injects a narrowly scoped, clearly named synthetic policy for fixture opening hours so cross-domain regression tests exercise the accepted-policy boundary instead of relying on the old “reference string implies trust” behavior.

## Ownership boundary

- World Knowledge owns fact, operational-rule, current-state, capability definitions and source/verification contracts.
- Product/CTO approval records authorize semantic changes only when separately accepted by the caller together with their authority contract; no individual, identity provider, or workflow is assumed.
- Decision Intelligence will own a separate, versioned capability-to-intent relation registry.
- User Intelligence owns neither World capabilities nor intent mappings.
- Owners, subscriptions, payments, advertising, and sponsorship have no registry or trust authority.

See the sibling documents for governance, policy, audit, identity, security, adapter and Slice 3 recommendations.
