import { canonicalJson, loadAcceptedPhase3BProductContextRelease, runPhase3BProductOracleWorkbench } from "../dist/index.js";

const release = loadAcceptedPhase3BProductContextRelease();
const workbench = runPhase3BProductOracleWorkbench();
process.stdout.write(`${canonicalJson({ contractVersion: workbench.contractVersion, releaseHash: release.release.releaseHash, founderDecisionRecordHash: release.decisionRecord.recordHash, registryHash: release.registry.registryHash, policyHash: release.policy.policyHash, scenarioCount: workbench.scenarios.length, workbenchHash: workbench.workbenchHash, productionAuthorized: false, runtimeActivated: false, productQualityClaim: false })}\n`);
