# D2 Operations

Commands:

```bash
npm run decision-lab:test
npm run decision-lab:d2:recertify
npm run decision-lab:d2 -- self-validate
npm run decision-lab:d2 -- development
npm run decision-lab:d2 -- regression
npm run decision-lab:d2 -- multi-seed
npm run decision-lab:d2 -- ab-null
npm run decision-lab:d2 -- freeze
DECISION_LAB_HOLDOUT_UNLOCK=<first-16-of-frozen-constitution-hash> npm run decision-lab:d2 -- holdout-acceptance
```

The last command is authorized once per evaluation version after a reviewed freeze and is recorded in `holdout-openings-v1.json`. Generated reports remain ignored. DB-backed demos inherit D1 localhost guards. FAST_SIMULATION latency is Lab latency only; FULL_FIDELITY requires its dedicated Lab key and never silently falls back. No Production credentials or hosted Supabase targets are permitted.

D2.1 commands use the v1.1 Constitution and must validate `decision-quality-v1.1.freeze.json`. The old v1 freeze is historical and cannot certify a new D3 baseline.
