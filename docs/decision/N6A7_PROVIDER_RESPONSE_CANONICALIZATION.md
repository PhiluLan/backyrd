# N6A.7 — Provider Response Canonicalization & Checkpoint Integrity

Status: PASS for offline measurement-infrastructure validation; no AI calls and no pilot resume.

## Incident and root cause

The failed slot contained a Responses API item at `output[0].encrypted_content`. This is opaque provider-internal response material. It is not consumed by ranking, structured-output parsing, reason authorization, validator evaluation, token accounting, cost accounting, latency measurement, or the scientific result aggregator. The model’s usable structured output is the `output_text` content; the opaque encrypted field is not scientific evidence.

## Canonical response contract

N6A.7 introduces `backyrd-n6a7-canonical-provider-response-v1`. The live executor now applies an explicit allowlist before checkpointing:

- response identity/status: `id`, `object`, `model`, `status`, `created_at`, `completed_at`, `service_tier`;
- output structure: item `type`, `role`, `status`, content `type`, and `text`;
- usage: `input_tokens`, `output_tokens`, `total_tokens`.

All other provider fields are dropped, including `encrypted_content`, opaque metadata, schemas, instructions, billing metadata, and internal response material. The canonical output text is parsed exactly as before. Parsed output, reason/evidence audits, validator disposition, tokens, latency, cost, slot identity, treatment identity, and model configuration remain unchanged.

The checkpoint now stores `canonicalProviderResponse` and `checkpointContractVersion`; it no longer requires a complete provider `rawOutput` for new responses. The strict secret scanner remains unchanged and still scans the canonical response and every other persisted field.

## Existing 30 committed slots

The 30 committed slots were inspected directly. All contain the required scientific fields and the opaque `encrypted_content`, but none requires that field for evaluation. Offline migration of immutable copies canonicalizes all 30 responses, removes the opaque field, preserves parsed output, validator disposition, candidate IDs, slot identity, treatment identity, token counts, latency, and cost, and leaves the originals unchanged.

This is a persistence-only migration under `backyrd-n6a7-checkpoint-compatibility-v1`. The experiment identity remains `a37254a131df1f65d7d11feaa828e859f18d28bf0042d29bc7a46bee3dc74844`; Buddy, prompt, model, timeout, N2–N5, candidates, treatments, ground truth, and thresholds are unchanged. Therefore the 30 slots are **SAFE MIGRATION + RESUME FROM 30**, subject to an explicit offline migration of immutable copies before any future resume. The in-flight slot remains unusable and is not reconstructed.

## Security and adversarial behavior

Unknown provider fields are not persisted. `encrypted_content` can change without changing the canonical scientific response hash. Secrets in allowed model text or nested audits still fail closed; malformed or incomplete provider responses fail closed. The global secret scanner was not weakened and no path-wide authorization exception was added.

## Offline verification

The full synthetic 72-slot rehearsal runs through canonicalization, parsing, audit, validation, secret scanning, atomic checkpointing, manifest updates, aggregation, interruptions, retries, and resumed execution. Direct and resumed scientific result hashes remain equal. Existing N6A.3/N6A.4/N6A.5 crash, immutability, budget, parity, and aggregation tests remain required.

## Disposition

- encrypted_content scientifically required: **NO**
- canonical response contract: **PASS**
- provider field allowlist: **PASS**
- real secret detection: **PASS**
- scientific sufficiency: **PASS**
- existing 30 committed slots: **REUSABLE after immutable-copy migration**
- pilot disposition: **SAFE RESUME FROM 30**
- in-flight slot: **NOT REUSABLE**
- external AI calls/cost: **0 / USD 0**
- production: **UNCHANGED**

## Freeze identity

`backyrd-n6a7-provider-response-canonicalization-freeze-v1` records the canonical-response contract hash and the unchanged Decision-Buddy scientific identity.

