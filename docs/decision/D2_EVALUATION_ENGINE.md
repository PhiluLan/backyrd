# D2 Evaluation Engine

The evaluator consumes Flight Recorder stages plus evaluation-only latent truth. It never recommends. Pure modules implement canonical JSON/hashes, contracts, Recall/Precision/HitRate, weighted utility recall, NDCG, regret, utility summaries, diversity/novelty/duplicates, Jaccard, paired bootstrap, failure attribution, replay-compatible trace validation and blinded A/B.

Primary attribution is deterministic: missing best item in the first candidate stage is retrieval; present but low final rank is ranking; hard eligibility/distribution violations supersede soft failures; incomplete traces are contract failures. Reports separate Framework Validity, Engine Quality and D3 Readiness.

A/B requires identical world, evaluation version and embedding mode. Reviewer bundles omit engine identity and randomize position deterministically. Unblinding material is separate. Identical comparisons return INCONCLUSIVE, never a winner.
