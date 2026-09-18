# Historical delivery controls

Week-1/2/3, Phase-2/3 and Founder-Lab controls are retained only for historical
recertification and forensic evidence. They do not authorize Product runtime,
Production deployment, current Decision semantics or a parallel client route.

Routine PRs must not invoke them. Use `CI / Deep Historical Recertification`
for a historical compatibility audit. The current source of truth is
[`DELIVERY_WORKFLOW_V2.md`](../DELIVERY_WORKFLOW_V2.md).
