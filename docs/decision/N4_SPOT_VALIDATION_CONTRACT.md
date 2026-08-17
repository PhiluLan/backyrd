# N4 Spot Validation Contract v1

Version: `backyrd-spot-validation-contract-v1`

The contract was defined before the official run. Missing arms fail closed; thresholds, schema and evidence policies cannot change after result sighting.

## Required scenarios

Three deterministic seeds run: rich Premium bar, misleading Premium Spot, Free Spot with strong community evidence, sparse new Spot, Context-dependent bar, family restaurant, date restaurant, Basel/Copenhagen compatibility, Premium wrong-for-request and Free perfect-fit.

## Mandatory gates

- Fact Accuracy, Provenance Completeness, Owner Claim Isolation, Free/Premium Fairness, Contradiction Handling, Contextual Intelligence, UNKNOWN Correctness, Cross-City compatibility, security, N6 serialization and deterministic replay: `1.0`.
- Confidence Calibration: Brier `<= 0.08`, evaluated from actual N4 Concept Confidence against prospectively specified evidence-strength targets.
- Synthetic lookup p95 `<= 20 ms` and N6 serialization p95 `<= 5 ms` at 300, 1,000 and 10,000 Spot cases.

## Scientific boundary

Latent Truth is evaluator-only and never runtime input. Payment status is prohibited as a Decision feature. N4 validates knowledge representation, evidence isolation and boundaries; it does not claim Production accuracy, Production latency, ranking lift or real-world calibration.
