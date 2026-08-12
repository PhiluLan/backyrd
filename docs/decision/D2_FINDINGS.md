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

## D3-CONSTITUTION-ISSUE-001 — declared hard gates were not executable

- Area: D2 v1 evaluation framework
- Severity: P1 Framework integrity
- Status: RESOLVED IN D2.1 / pending merge
- Evidence: v1 accepted exclusion, hard-category, open-now and duplicate violations as hard PASS
- Fix: v1.1 Hard-Gate Registry, fail-closed completion, result/readiness guards and 45-case adversarial acceptance
- Freeze: `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf`
- Ownership: Decision Lab

No P0/P1 Framework finding remains open after the D2.1 re-certification is merged.
