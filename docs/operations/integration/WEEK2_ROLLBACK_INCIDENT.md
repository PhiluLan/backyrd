# Week 2 Rollback, Kill-Switch, Incident, and Recovery

This document covers the dark-wiring release candidate only. It does not authorize a merge, deployment, migration, shadow traffic, or Product activation.

## Default and emergency state

The global kill switch and every domain kill switch default engaged. Every feature flag defaults `false`; missing or unknown configuration resolves to OFF and rejects activation. `USER_LEARNING_RUNTIME` remains false with `FORCED_OFF`. `DECISION_VNEXT_PRODUCT_RANKING` remains false in every Week-2 rehearsal.

Emergency sequence:

1. Engage `WEEK2_DARK_WIRING_GLOBAL_KILL_SWITCH`.
2. Engage the DECISION shadow kill switch and confirm sampling/evaluation is zero.
3. Force USER learning and persistence OFF.
4. Engage WORLD product-read kill switch.
5. Preserve immutable evidence and mark the affected track RED.
6. Re-run OFF invariant checks before any recovery work.

## Rollback and recovery

Before merge, rollback means abandoning or superseding the Integration candidate; no Product runtime exists to roll back. Never rewrite a domain candidate. Create a new forward candidate, rebind its exact head/tree, and repeat the entire four-track rehearsal.

If a later separately authorized merge train fails, stop at the failed track. Do not continue to downstream tracks. Use the last canonical Main commit as the recovery anchor, keep all flags OFF, and require a new source-aware plan and full recertification before retrying.

No automatic activation or automatic rollback is allowed. Database recovery must be forward-only, independently reviewed, restartable, and supported by allow/deny authorization tests. Never weaken RLS, grants, privacy, consent, or moderation controls to restore service.

## Incident evidence

Record exact base/head/tree, artifact hash, flag and kill-switch state, counters, failing gate, timestamps, owner, scope, user impact, Production-action status, and recovery decision. Do not store secrets, personal raw data, or detection details that increase abuse risk.

## Maximum acceptable deviation

**Pending CTO decision:** no nonzero deviation is pre-authorized. Until the CTO records a bounded value, the maximum acceptable deviation is zero for writes, network calls, persistence, Product output, unknown configuration, skipped required gates, identity drift, and unauthorized activation. Timing or performance deviations may be observed but cannot waive correctness or safety gates.
