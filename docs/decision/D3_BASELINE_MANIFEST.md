# D3-A V13 Baseline Manifest

## Identity

| Field | Value |
|---|---|
| Baseline | `backyrd-decision-v13-baseline-d3-a-v1` |
| Source `main` | `47855231ba12583b1fc5900c320cc705698c9cae` |
| V13 source | `a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba` |
| D2.1 freeze | `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf` |
| D2.2 freeze | `9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053` |
| Constitution | `cf0df61e94db56a480a1334b701fe1725d563c989225bdfd5158ba16e0a5fca1` |
| Scenario Registry | `4f3e4294c385e29c35ea7911557bfc5bc014115b28cb6f58a1a856706c971bef` |
| Evaluator | `c60fdb75dc6e7550bc106dfbc1fd648e4f39227eb6901ebc2775ef62a9feae76` |
| Gate Registry | `2925d28d4eee37580fe3b6ddc6cb9c6adeb772c033122b63d749bab49f1230dc` |
| Run-plan hash | `b77fe855dee8de7d4eefcf0837202ad865f2d66195fdbf0c58fabe27976df00e` |
| Result hash | `b0701aebb83878ae2ee28c3e0cfe0a17617952aad3bb0a51bc4589689138908c` |

The execution used the three predeclared seeds. Each World passed health validation. The complete 18/12/12 Development/Regression/Locked-Holdout registry ran in every World.

## Fidelity and safety

V11/V12 SQL, V13 orchestration/fusion, Product Eligibility and Distribution used current canonical code in a disposable local Supabase stack. Query and Spot embeddings used deterministic `FAST_SIMULATION`; semantic and aggregate quality are therefore `SIMULATION_ONLY`/`STRUCTURALLY_VALIDATED`, never full-fidelity Product quality. There was no Production connection, data, mutation or deployment.

The run created no migration and changed no Engine, Constitution, Scenario Registry, Evaluator, Ground Truth or Treatment Contract.

## Sample sizes

| Evidence | N |
|---|---:|
| Worlds | 3 |
| Golden Decisions | 126 |
| Counterfactual pairs | 15 |
| Personalization treatments | 18 (54 Engine executions) |
| Remix pairs | 18 |
| Explanation candidates | 1,260 |

## Reproduction

```bash
npm run decision-lab:d3.1:preflight
npm run decision-lab:d3-a
npm run decision-lab:d3-a:validate
```

The heavy command creates, resets and destroys one guarded disposable local stack. No linked project is permitted. Large per-request traces remain disposable; aggregate results, failures, findings, a blinded human sample and identity hashes are versioned.

Future Engine comparison must use the same D2.1/D2.2 identities, Scenario Registry, seeds, Evaluator and hard gates. If the benchmark contract changes, use a new baseline ID and bridge evaluation.
