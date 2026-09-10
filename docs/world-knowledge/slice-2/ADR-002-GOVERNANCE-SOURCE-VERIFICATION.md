# ADR-002: Governed Registry and Record-bound Verification

Status: proposed for CTO review.

Decision: Registry evolution uses immutable release records, fully validated predecessor artifacts, historical deprecation proof and separately accepted approval authorities/records. Source policy is an independent, per-attribute versioned contract that produces claim-level, hash-bound purpose authorizations. `VERIFIED` resolution requires a matching immutable Verification Record plus separately accepted process and execution-authority contracts; a claim flag, self-declared role/process, admin role, owner status or source reference is insufficient. Legacy adaptation is isolated, deterministic and conservative, and its Decision projection is policy-filtered.

Consequences: historical snapshots remain meaningful; policy uncertainty produces non-ready outcomes; evidence remains append-only; rollout needs trusted policy/authority distribution, real identity and execution attestation, server time, revocation, persistence and RLS before runtime use. The extra version/hash references are intentional audit cost.

Rejected: latest-wins, admin-wins, owner-verifies-self, numeric confidence conversion, mutable registry keys, generic JSON fact import and direct production integration.
