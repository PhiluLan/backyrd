# ADR-002: Governed Registry and Record-bound Verification

Status: proposed for CTO review.

Decision: Registry evolution uses immutable release records and semantic transition validation. Source policy is an independent, per-attribute versioned contract. `VERIFIED` resolution requires a matching immutable Verification Record under a configured policy/process; a claim flag, admin role, owner status or source reference is insufficient. Legacy adaptation is isolated, deterministic and conservative.

Consequences: historical snapshots remain meaningful; policy uncertainty produces non-ready outcomes; evidence remains append-only; rollout needs a policy catalog and persistence design before runtime use. The extra version/hash references are intentional audit cost.

Rejected: latest-wins, admin-wins, owner-verifies-self, numeric confidence conversion, mutable registry keys, generic JSON fact import and direct production integration.
