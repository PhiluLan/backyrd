# Mobile Candidate Validation

## Green source checkpoint

- Strict TypeScript: pass
- Targeted Expo lint: pass, zero warnings
- Mobile Product control-plane tests: 6/6
- Mobile Product contract suite, including native contracts: 24/24
- Repository single-route scan: pass
- Forbidden Legacy/client-secret scan: pass
- Local iOS Hermes export: pass without upload or Production access
- Git whitespace validation: pass

These results are a source checkpoint. They are not a Production acceptance,
release seal, OTA publication, or runtime activation.

## Contract coverage

- One Product transport slug: `decision-v13`.
- Strict Product request and response contracts; no Legacy/Founder fallback.
- Server ordering, presentation, availability, reasons, and limitations render
  without client invention.
- A visible card emits `candidate_impression` only after the visibility gate;
  unseen response candidates do not.
- Opening a candidate emits `candidate_opened` on the same Product route.
- Alternative and contextual reject remain Decision-bound and do not mutate
  World truth.
- Decision-origin navigation suppresses historical Decision/Taste/Memory
  writers.
- Missing or mismatched release authority fails closed before Product output.

## Remaining release acceptance

Final acceptance stays open until the exact frozen candidate has one Node-20
artifact/source set, complete local and GitHub Risk Gates, protected merge,
exact-Main post-merge validation, and a separate explicit Release-GO. Physical
device validation must use the exact accepted update identity before rollout.

No Production query, migration application, Function deployment, secret
mutation, activation, channel mutation, or OTA action is part of this
validation.
