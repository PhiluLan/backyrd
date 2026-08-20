import { rebuildUserIntelligence } from "./worker.mjs";
import { randomUUID } from "node:crypto";

const terminalCodes = ["runtime_user_mismatch","runtime_duplicate_node","runtime_invalid_node_state","runtime_invalid_node_numeric","runtime_invalid_scope","invalid_shared_runtime_result","cross_user","contract_violation","unknown_spot_evidence_concept","unsupported_memory_event","memory_contract_version_mismatch","learning_event_requires_spot_evidence"];
const codeFor = (error) => String(error?.message ?? "UNKNOWN_FAILURE").slice(0,120);
const isTerminal = (code) => terminalCodes.some((candidate) => code.includes(candidate));

export async function runQueueOnce({ repository, leaseSeconds = 300, hooks = {} }) {
  const claim = await repository.claimWork(leaseSeconds);
  if (!claim) return { status:"IDLE" };
  const workerRunId = randomUUID();
  const started = performance.now();
  try {
    await hooks.afterClaim?.(claim);
    const result = await rebuildUserIntelligence({ userId:claim.userId,repository,reason:claim.reason ?? "QUEUE",watermark:claim.watermark,workIds:claim.workIds,leaseToken:claim.leaseToken });
    await hooks.afterCommit?.(claim,result);
    return { status:"COMMITTED",workerRunId,claim,snapshotHash:result.snapshotHash,nodesChanged:result.nodesChanged,runtimeVersion:result.runtimeVersion,durationMs:Number((performance.now()-started).toFixed(3)) };
  } catch (error) {
    const code = codeFor(error);
    if (await repository.reconcileWork?.(claim) === "COMMITTED") return { status:"COMMITTED_RECOVERED",workerRunId,claim,failureCode:code,durationMs:Number((performance.now()-started).toFixed(3)) };
    const retryable = !isTerminal(code);
    await repository.failWork(claim,{retryable,code});
    return { status:retryable?"RETRYABLE_FAILED":"TERMINAL_FAILED",workerRunId,claim,failureCode:code,durationMs:Number((performance.now()-started).toFixed(3)) };
  }
}

export async function drainQueue({ repository, limit = 25, leaseSeconds = 300, hooks = {} }) {
  const results=[];
  for(let i=0;i<Math.max(1,Math.min(limit,100));i+=1){const result=await runQueueOnce({repository,leaseSeconds,hooks});if(result.status==="IDLE")break;results.push(result);}
  return results;
}
