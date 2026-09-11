import { canonicalJson, replayContextFlipWorkbench, runContextFlipWorkbench } from "../dist/index.js";

const result = await runContextFlipWorkbench();
await replayContextFlipWorkbench(result);
process.stdout.write(`${canonicalJson({ contractVersion: result.contractVersion, scenarioCount: result.scenarios.length, scenarioIds: result.scenarios.map((item) => item.scenarioId), productRankingQualityConfigured: result.productRankingQualityConfigured, workbenchHash: result.workbenchHash })}\n`);
