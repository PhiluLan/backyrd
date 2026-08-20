# Production Deterministic Ranking

Version: `backyrd-deterministic-ranking-v1`.

The strategy is a lexicographic composition, not a new learned score:

1. Hard eligibility and candidate freeze are completed by Sprint 3.
2. Explicit current-intent compatibility.
3. Current-moment concepts supported by canonical candidate N4.
4. Bounded N5 projection fit (`SUFFICIENT=1`, `PARTIAL=0.5`, `LOW_OR_UNKNOWN=0`).
5. Existing v13 retrieval position as the stable final tie-breaker.

Because N5 is evaluated after intent and moment fit, historical taste cannot overturn explicit current intent. Missing N4 is not a negative signal; it merely cannot prove a concept fit. Commercial, payment, owner-tier, sponsored, completeness, latent-truth, and raw-history fields are absent and rejected by validation.

The same semantic package produces the same ranking hash, final order, authorized reasons, response, and response hash. Timestamps and latency are excluded from semantic response identity.
