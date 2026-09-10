# Foundation Slice 2 plan

Slice 2 begins only after CTO approval of Slice 1 contracts and open Product semantics.

Recommended sequence:

1. Freeze registry key governance, source-reference authority, and verification roles.
2. Audit current Spot/category/fact/opening data against the Slice 1 registry without writes.
3. Define storage options and RLS/ACL boundaries; review Admin and verified-Owner claim permissions.
4. Define fact-type-specific staleness policies from operational evidence, not arbitrary defaults.
5. Prototype the append-only persistence and resolution transaction in an isolated environment.
6. Define a read-only adapter from WorldKnowledgePort to Decision vNext without ranking changes.
7. Create and evaluate a separate Capability→Intent relation-registry proposal.
8. Expand only high-value taxonomy clusters with evidence-backed Applicability.

Open gates before implementation:

- stable Spot and source identity strategy
- who may verify each fact family
- which hard constraints require reference or verification
- whether public contact belongs in the Decision projection or only the public Spot projection
- exact group-capacity semantics
- operational definition of Current State scopes
- event/temporary-place boundary
- privacy classification and retention of Evidence references
