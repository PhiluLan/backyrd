import test from 'node:test';import assert from 'node:assert/strict';
import {BETA_PLAN,admitBetaQuote,remainingTrainingFits} from './nuknuk-beta-training-plan.mjs';
const quote=()=>({atEpochSeconds:1000,gpu:'NVIDIA H100 PCIe',gpuCount:1,memoryGb:80,containerDiskGb:200,volumeDiskGb:0,networkVolumes:0,allocationAttempts:1,otherRunningPods:0,otherBillableResources:0,allChargesKnown:true,autoRechargeDisabled:true,postpaidDisabled:true,availableCreditUsd:10,computeHourlyUsd:2.89,storageHourlyUsd:200*.1/720,otherHourlyUsd:0,taxFraction:0,fixedChargesUsd:0,priorAttemptCostUsd:0});
test('one bounded run includes storage, taxes, prior attempts and closing reserve',()=>{const q=quote();q.taxFraction=.10;const r=admitBetaQuote(q,1100);assert.equal(r.plannedMaximumIncludingReserveUsd,9.03);assert.equal(r.resourcesStarted,false);assert.equal(r.watchdog.maxComputeHourlyUsd,2.89);assert.equal(Object.values(BETA_PLAN.phasesMinutes).reduce((a,b)=>a+b,0),150);});
test('unknown, stale, excess or repeated resources cannot be admitted',()=>{
 for(const patch of [{memoryGb:undefined},{memoryGb:NaN},{postpaidDisabled:false},{availableCreditUsd:1},{otherBillableResources:1},{atEpochSeconds:100},{computeHourlyUsd:2.90},{taxFraction:NaN},{storageHourlyUsd:undefined},{allChargesKnown:false},{autoRechargeDisabled:false},{networkVolumes:1},{volumeDiskGb:20},{allocationAttempts:2},{otherRunningPods:1},{fixedChargesUsd:3},{priorAttemptCostUsd:3}])assert.throws(()=>admitBetaQuote({...quote(),...patch},1100),/beta_quote/);
});
test('a measured slow probe aborts rather than increasing cost or claiming an incomplete epoch',()=>{
 assert.equal(remainingTrainingFits({stepSeconds:Array(10).fill(5),minimumProbeTokens:4000,maximumRemainingTokens:4984,remainingUpdates:190,remainingSeconds:4800}).status,'FITS_ESTIMATED_REMAINDER');
 assert.match(remainingTrainingFits({stepSeconds:Array(10).fill(30),minimumProbeTokens:2000,maximumRemainingTokens:4984,remainingUpdates:190,remainingSeconds:4800}).status,/ABORT/);
 assert.throws(()=>remainingTrainingFits({stepSeconds:[],minimumProbeTokens:4000,maximumRemainingTokens:4984,remainingUpdates:190,remainingSeconds:4800}),/measurement/);
});
test('available lower-price A100 fits existing credit, with explicit bounded rate slack',()=>{const q=quote();Object.assign(q,{gpu:'NVIDIA A100-SXM4-80GB',computeHourlyUsd:2.19,computeHourlyCeilingUsd:2.22,availableCreditUsd:7.65});const r=admitBetaQuote(q,1100);assert.equal(r.plannedMaximumIncludingReserveUsd,6.62);assert.equal(r.watchdog.maxComputeHourlyUsd,2.22);assert.equal(r.watchdog.hourlyUsd,2.25);assert.equal(r.watchdog.ceilingUsd,7.65);});

test('one-time initialization is charged once; recurring slowdown and elapsed budget still abort',()=>{
 const measured={stepSeconds:[127.604,9.862,9.855,11.853,10.737,9.746,9.967,9.780,9.934,10.426],minimumProbeTokens:4352,maximumRemainingTokens:4984,remainingUpdates:190,remainingSeconds:5100-368.045};
 assert.equal(remainingTrainingFits(measured).status,'FITS_ESTIMATED_REMAINDER');
 assert.match(remainingTrainingFits({...measured,remainingSeconds:1000}).status,/ABORT/);
 assert.match(remainingTrainingFits({...measured,stepSeconds:[127.604,...Array(9).fill(30)]}).status,/ABORT/);
});

test('a separately authorized shorter attempt accounts for prior consumption and never extends the cap',()=>{
 const q={...quote(),gpu:'NVIDIA A100-SXM4-80GB',computeHourlyUsd:2.19,computeHourlyCeilingUsd:2.22,availableCreditUsd:6.81,priorAttemptCostUsd:1,maximumBillingSeconds:7200};
 const receipt=admitBetaQuote(q,1100);assert.equal(receipt.maximumBillingSeconds,7200);assert.equal(receipt.plannedMaximumIncludingReserveUsd,6.50);assert.equal(receipt.watchdog.priorUsd,1);
 for(const duration of [0,600,9001,NaN])assert.throws(()=>admitBetaQuote({...q,maximumBillingSeconds:duration},1100),/billing_seconds/);
});

test('additional account funding cannot raise the authorized aggregate ceiling',()=>{
 const q={...quote(),gpu:'NVIDIA A100-SXM4-80GB',computeHourlyUsd:2.19,computeHourlyCeilingUsd:2.22,availableCreditUsd:16,priorAttemptCostUsd:1.60,maximumBillingSeconds:5400,maximumAggregateUsd:5.98};
 const r=admitBetaQuote(q,1100);assert.equal(r.plannedMaximumIncludingReserveUsd,5.98);assert.equal(r.watchdog.ceilingUsd,5.98);
 assert.throws(()=>admitBetaQuote({...q,maximumAggregateUsd:5.97},1100),/total_limit/);assert.throws(()=>admitBetaQuote({...q,maximumAggregateUsd:11},1100),/total_limit/);
});
