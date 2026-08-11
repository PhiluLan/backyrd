# D2 Findings

## D2-F-001 — Holdout secrecy requires protected storage

- Area: Split custody
- Evidence: fixtures and generator code in the repository are visible to contributors
- Impact: local v1 can prove isolation and tamper evidence, not cryptographic secrecy
- Severity: P2
- Status: OPEN / documented limitation
- Reproduction: inspect `splitRegistry().custody`
- Ownership: Decision Lab operations

## D0-F-002 — semantic/fallback Distribution priority omission

- Area: current V13 Engine
- Evidence: deterministic NORMAL/REDUCED semantic-only fixture and acceptance classification
- Impact: REDUCED may outrank NORMAL
- Severity: P1
- Status: KNOWN CURRENT DEFECT / measured, not fixed
- Reproduction: `npm run decision-lab:d2:acceptance`
- Ownership: Decision Engine (post-D2)

No P0/P1 Framework finding is open.
