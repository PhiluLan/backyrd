import { replayFounderLabReport, runFounderLabOracles } from "../dist/index.js";

const first = await runFounderLabOracles();
const replay = await replayFounderLabReport(first);
if (first.reportHash !== replay.reportHash) throw new Error("phase3c_report_replay_mismatch");
process.stdout.write(`${JSON.stringify({ contractVersion: first.contractVersion, scenarioCount: first.scenarioIds.length, reportHash: first.reportHash, releaseHash: first.releaseHash, valid: true, productionAuthorized: first.productionAuthorized })}\n`);
