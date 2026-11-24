// Pure planning/quote admission. Cannot create/start/stop a resource or invoke a model.
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
export const BETA_PLAN={
 version:'backyrd.nuknuk-beta-execution-plan@1',
 scope:'PREPARE_ONLY_NO_ALLOCATION_OR_TRAINING_AUTHORITY',
 catalogManifestSha256:'58caa68751ff2a779eaaebee519e14db3bf022cdd912302b629856fd65c464ee',
 hardware:{gpu:'NVIDIA H100 PCIe',equivalentGpuIds:['NVIDIA A100-SXM4-80GB','NVIDIA A100 80GB PCIe'],count:1,vramGb:80,containerDiskGb:200,volumeDiskGb:0,networkVolumes:0,allocationAttempts:1},
 money:{ceilingUsd:10,closingReserveUsd:1,maxComputeHourlyUsd:2.89,maxAllInHourlyUsd:3.5,maximumBillingSeconds:9000},
 phasesMinutes:{bootAndDownload:25,tenUpdateProbe:5,remainingTraining:80,developmentSmoke:15,exportAndVerification:15,deleteAndConfirm:5,slack:5},
 recipe:{model:'Qwen/Qwen3.6-35B-A3B',revision:'995ad96eacd98c81ed38be0c5b274b04031597b0',parentHfSha256:'9d9eef4a46c8441082002635dc74917a3cf5f29be9c0cbed372d44f7e320a311',parentMlxSha256:'ade9ce9b2b73f56188af73e42870ba953a5f04f08dfc0ad78032a24811ad3740',rank:16,alpha:32,trainRows:800,epochs:1,microBatch:1,gradientAccumulation:4,optimizerUpdates:200,learningRate:6e-6,seed:42,maxTotalTokens:5120,maxAnswerTokens:2048,truncate:false,checkpointEveryUpdates:50},
 controls:{noAutomaticAllocationRetry:true,noNetworkVolume:true,watchdogProfile:'beta-10',nativeWorkTimeoutSeconds:8400,startDeletionBySeconds:8700,confirmDeletionBySeconds:9000,retainLiveModel:true},
 qualification:{gpu:'PARENT/CANDIDATE DEV smoke only within budget; never use TEST for checkpoint selection',mac:'Full matching baseline/candidate evaluation after GPU deletion, in a separately scheduled isolated session; no concurrent second live model',candidateSelection:'DEV then freeze checkpoint; TEST/TRANSFER once after freeze'},
 readiness:'BLOCKED_PENDING_FRESH_INCLUSIVE_QUOTE_AND_BETA_TRAINER_ADMISSION',
 blockers:['Actual available Pod quote with storage, tax and fees; reference web price is not a live quote.','Beta GPU exporter remains intentionally blocked: reviewed-cohort admission, immutable bundle and existing trainer integration need validation before allocation.','HF/MLX parent and runtime parity must be verified for this exact bundle.','Local/provider watchdog and deletion controller must be armed before training.'],
 pricingSources:[{url:'https://www.runpod.io/pricing',checkedDate:'2026-11-24'},{url:'https://docs.runpod.io/pods/pricing',checkedDate:'2026-11-24'}],
 authorization:{preparationOnly:true,paidResources:false,trainingExecution:false,deployment:false},
};
const finite=(value,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('beta_quote_'+label);return value;};
export function admitBetaQuote(quote,nowEpochSeconds){
 const now=finite(nowEpochSeconds,'clock'),at=finite(quote.atEpochSeconds,'timestamp');
 if(at>now||now-at>300)throw Error('beta_quote_expired');
 if(![BETA_PLAN.hardware.gpu,...BETA_PLAN.hardware.equivalentGpuIds].includes(quote.gpu)||quote.gpuCount!==1||quote.memoryGb!==80||quote.containerDiskGb!==200||quote.volumeDiskGb!==0||quote.networkVolumes!==0||quote.allocationAttempts!==1||quote.otherRunningPods!==0||quote.otherBillableResources!==0)throw Error('beta_quote_resource_scope');
 if(quote.allChargesKnown!==true||quote.autoRechargeDisabled!==true||quote.postpaidDisabled!==true)throw Error('beta_quote_billing_unknown');
 const compute=finite(quote.computeHourlyUsd,'compute'),storage=finite(quote.storageHourlyUsd,'storage'),fees=finite(quote.otherHourlyUsd,'fees'),tax=finite(quote.taxFraction,'tax'),fixed=finite(quote.fixedChargesUsd,'fixed'),prior=finite(quote.priorAttemptCostUsd,'prior');
 const computeCeiling=finite(quote.computeHourlyCeilingUsd??compute,'compute_ceiling');
 if(computeCeiling<compute||computeCeiling>2.89)throw Error('beta_quote_compute_ceiling');
 const inclusive=(computeCeiling+storage+fees)*(1+tax);
 if(compute<=0||compute>2.89||inclusive>3.5)throw Error('beta_quote_rate_limit');
 // Round upward to cents; use an all-in accrual guard, not the GPU-only rate.
 const lifetime=finite(quote.maximumBillingSeconds??9000,'billing_seconds');
 if(lifetime<=600||lifetime>9000)throw Error('beta_quote_billing_seconds');
 const upper=Math.ceil((inclusive*lifetime/3600+fixed+prior+1)*100)/100;
 const ceiling=finite(quote.maximumAggregateUsd??10,'aggregate_ceiling');
 if(ceiling>10||upper>ceiling)throw Error('beta_quote_total_limit');
 if(finite(quote.availableCreditUsd,'credit')<upper)throw Error('beta_quote_insufficient_credit');
 return {status:'WITHIN_PLANNED_ENVELOPE_NOT_RESOURCE_AUTHORIZATION',quoteHash:contentHash(quote),allInHourlyUsd:inclusive,plannedMaximumIncludingReserveUsd:upper,maximumBillingSeconds:lifetime,watchdog:{budgetProfile:'beta-10',hourlyUsd:Math.ceil(inclusive*100)/100,maxComputeHourlyUsd:computeCeiling,ceilingUsd:Math.min(ceiling,Math.floor(quote.availableCreditUsd*100)/100),reserveUsd:1,priorUsd:fixed+prior},resourcesStarted:false};
}
export function remainingTrainingFits({stepSeconds,minimumProbeTokens,maximumRemainingTokens,remainingUpdates,remainingSeconds}){
 if(!Array.isArray(stepSeconds)||stepSeconds.length!==10||stepSeconds.some(s=>typeof s!=='number'||!Number.isFinite(s)||s<=0))throw Error('beta_probe_measurement_required');
 for(const x of [minimumProbeTokens,maximumRemainingTokens,remainingUpdates,remainingSeconds])if(typeof x!=='number'||!Number.isFinite(x)||x<=0)throw Error('beta_probe_bounds');
 const seconds=Math.max(...stepSeconds.slice(1))*remainingUpdates*Math.max(1,maximumRemainingTokens/minimumProbeTokens)**2*1.5;
 return {status:seconds<=Math.min(4800,remainingSeconds)?'FITS_ESTIMATED_REMAINDER':'ABORT_AND_EXPORT_PARTIAL_NOT_COMPLETE',conservativeEstimatedSeconds:Math.ceil(seconds),guaranteesCompletion:false};
}
