# D2 Evaluation Engine

> v1 is historical. `decision-evaluator-v1.1` is the D2.1 re-certified evaluator for the next D3 attempt.

The evaluator consumes Flight Recorder stages plus evaluation-only latent truth. It never recommends. Pure modules implement canonical JSON/hashes, contracts, Recall/Precision/HitRate, weighted utility recall, NDCG, regret, utility summaries, diversity/novelty/duplicates, Jaccard, paired bootstrap, failure attribution, replay-compatible trace validation and blinded A/B.

Primary attribution is deterministic: missing best item in the first candidate stage is retrieval; present but low final rank is ranking; hard eligibility/distribution violations supersede soft failures; incomplete traces are contract failures. Reports separate Framework Validity, Engine Quality and D3 Readiness.

A/B requires identical world, evaluation version and embedding mode. Reviewer bundles omit engine identity and randomize position deterministically. Unblinding material is separate. Identical comparisons return INCONCLUSIVE, never a winner. Trace replay verifies a canonical SHA-256 seal and refuses mutation; Development, Regression, Locked Holdout and multi-seed commands now execute scenario records rather than returning declarations.

v1.1 resolves candidate truth from the synthetic World, evaluates the full returned set through the central Hard-Gate Registry and emits `PASS | FAIL | NOT_EVALUATED | NOT_APPLICABLE` per gate. A result is certifiable only when the version contract is compatible, evaluation is complete and every applicable hard gate passes. Result invariants reject contradictory Engine/hard/certification states.
