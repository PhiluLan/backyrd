# Week-1 Rollback and Incident Runbook

This runbook covers preparation and verification. It grants no deployment, migration, OTA, feature activation, or merge authority.

## Dark-release boundary

All four switches in `backyrd.dark-release-contracts@1.0` default to off. Missing configuration means off, and every kill switch defaults engaged. Flags are server-owned and environment-scoped. A client value, an evaluation artifact, a merged migration, or a successful CI run cannot activate runtime behavior.

Before any later activation, record the exact Main SHA, tree, artifact hash, environment, cohort, owner, expiry, metrics, stop thresholds and tested kill-switch command in a separately authorized release record. World read, User learning, Decision ranking and Decision shadow traffic are separate authorities and separate switches.

## Rollback order

1. Engage the affected kill switch and verify the effective server-side state. For uncertainty, engage all vNext switches.
2. Stop cohort expansion and new work. Preserve immutable logs and release hashes without PII.
3. Revert runtime routing or deploy the last known-good immutable artifact through the existing release mechanism. Do not rewrite an applied migration.
4. For database incidents, prefer a forward repair migration. Use backup/restore only under `DATABASE_AND_MEDIA_RECOVERY_RUNBOOK.md` and its separate authority.
5. Re-run post-deploy checks on eligibility, authorization, privacy, degraded behavior and kill-switch effectiveness.
6. Keep the track RED until Founder/CTO accepts the evidence and recovery state.

## Incident command

The incident lead records start time, affected environment/cohort, detected symptom, candidate SHA/tree/artifact, effective flags, last known-good identity and customer impact. Domain owners diagnose semantics in their own authority; Integration coordinates evidence and release state. Trust & Safety or privacy impact immediately blocks rollout expansion and requires the least harmful intervention.

Never put secrets, raw user events, access tokens, service-role keys, personal data or private production payloads into CI artifacts, chat, issue bodies or the daily report.

## Required closure evidence

- immutable affected and recovered identities;
- activation and kill-switch audit timestamps;
- verification results for allowed and denied paths;
- forward-repair or runtime-rollback record;
- remaining data, privacy, safety and user-impact assessment;
- explicit owner and Founder/CTO closure decision.
