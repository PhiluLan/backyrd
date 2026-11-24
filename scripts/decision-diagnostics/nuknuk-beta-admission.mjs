// Verify the already reviewed cohort; this creates no cloud resource.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const REVIEWED_BETA_MANIFEST='58caa68751ff2a779eaaebee519e14db3bf022cdd912302b629856fd65c464ee';
export async function verifyBetaAdmission(data,receipt,root){
 const bytes=await readFile(resolve(data,'manifest.json')),manifest=JSON.parse(bytes);
 if(manifest.cohort==='BETA_REMEDIATION_V2')return verifyRemediationAdmission(data,receipt,root,manifest,bytes);
 if(sha(bytes)!==REVIEWED_BETA_MANIFEST||receipt.catalogManifestSha256!==REVIEWED_BETA_MANIFEST||manifest.cohort!=='BETA_V1')throw Error('beta_admission_catalog_identity');
 checkBetaAdmissionPolicy(receipt);
 for(const [name,binding]of Object.entries(manifest.files))if(sha(await readFile(resolve(data,name)))!==binding.sha256)throw Error('beta_admission_payload_changed:'+name);
 // Every changed source is explicit and bound; no silent exemption for stale inputs.
 for(const [name,oldHash]of Object.entries(manifest.sourceHashes)){
  const actual=sha(await readFile(resolve(root,name))),binding=receipt.sourceHashes?.[name];
  if(actual!==binding)throw Error('beta_admission_source_not_bound:'+name);
  if(actual!==oldHash&&!['scripts/decision-diagnostics/nuknuk-product-training.mjs','scripts/decision-diagnostics/nuknuk-gpu.py','packages/decision-vnext-core/src/product-librarian-matching.ts','packages/decision-vnext-core/test/librarian-required-evidence.test.mjs'].includes(name))throw Error('beta_admission_unexpected_source_change:'+name);
 }
 for(const [name,hash]of Object.entries(receipt.executionSources??{}))if(sha(await readFile(resolve(root,name)))!==hash)throw Error('beta_admission_executor_changed:'+name);
 if(!receipt.executionSources?.['scripts/decision-diagnostics/nuknuk-beta-admission.mjs']||!receipt.executionSources?.['scripts/decision-diagnostics/nuknuk-beta-callback.py'])throw Error('beta_admission_executor_binding_missing');
 return {receiptSha256:sha(Buffer.from(JSON.stringify(receipt))),sourceHashes:receipt.sourceHashes,maximumTotalUsd:10};
}

export function checkBetaAdmissionPolicy(receipt){
 const {authorization,review,founderFeedback,founderPolicy}=receipt;
 if(authorization?.source!=='EXPLICIT_FOUNDER_CHAT_20261124'||authorization.instruction!=='Okay, also dann legen wir los mit dem Training'||authorization.maximumTotalUsd!==10||authorization.deployment!==false)throw Error('beta_admission_authorization');
 if(review?.verdict!=='ACCEPT_FOR_CONTROLLED_TRAINING_PREPARATION'||review.manifestSha256!==REVIEWED_BETA_MANIFEST)throw Error('beta_admission_independent_review');
 if(founderFeedback?.manifestSha256!==REVIEWED_BETA_MANIFEST||founderFeedback.cohortVerdict!=='GENERALLY_ACCEPTED_WITH_WORDING_RESERVATION'||founderFeedback.rows?.length!==10||founderPolicy?.humanSample?.status!=='COMPLETE_WITH_WORDING_NOTE'||founderPolicy.manifestSha256!==REVIEWED_BETA_MANIFEST)throw Error('beta_admission_human_sample');
 return true;
}


export const REVIEWED_REMEDIATION_MANIFEST='dc08575da70135f7af23d3e06193a730ba5004943f8f6d0253b8d2d6bf1d2e73';
export const REMEDIATION_REVIEW_SHA256='cebdd13692dffe49f0cb80982cb97d25d144c51b4852d233194372c0cd2b60a8';
export async function verifyRemediationAdmission(data,receipt,root,manifest,bytes){
 if(sha(bytes)!==REVIEWED_REMEDIATION_MANIFEST||receipt.catalogManifestSha256!==REVIEWED_REMEDIATION_MANIFEST
   ||manifest.counts.TRAIN!==484||manifest.counts.VALIDATION!==200||manifest.counts.TEST!==200
   ||manifest.parent.hfAdapterSha256!=='2b620aa7fbec48946c3e8ce25182452f0e4e366bab8e9ea20f1ebb47d02ce271')throw Error('remediation_admission_catalog_identity');
 if(receipt.authorization?.source!=='EXPLICIT_FOUNDER_CHAT_20261124_REMEDIATION'||receipt.authorization.maximumAggregateUsd!==10
   ||receipt.authorization.deployment!==false||receipt.authorization.resumeLiveParent!==true
   ||receipt.authorization.priorAttemptCostUsd<3.8225856877)throw Error('remediation_admission_authorization');
 const reviewBytes=await readFile(receipt.reviewFile),review=JSON.parse(reviewBytes);
 if(sha(reviewBytes)!==REMEDIATION_REVIEW_SHA256||review.manifestFileSha256!==REVIEWED_REMEDIATION_MANIFEST
   ||review.verdict!=='ACCEPT_FOR_REMEDIATION_TRAINING_PREPARATION'||review.rowReceipts.length!==42
   ||review.recipe.optimizerUpdates!==121||review.recipe.learningRate!==0.000002||review.recipe.automaticSecondEpoch!==false)throw Error('remediation_admission_independent_review');
 for(const[name,binding]of Object.entries(manifest.files))if(sha(await readFile(resolve(data,name)))!==binding.sha256)throw Error('remediation_admission_payload_changed:'+name);
 for(const[name,oldHash]of Object.entries(manifest.sourceHashes)){
  const actual=sha(await readFile(resolve(root,name)));
  if(receipt.sourceHashes?.[name]!==actual||actual!==oldHash&&!['scripts/decision-diagnostics/nuknuk-gpu.py','scripts/decision-diagnostics/nuknuk-product-training.mjs'].includes(name))throw Error('remediation_admission_source_not_bound:'+name);
 }
 for(const[name,hash]of Object.entries(receipt.executionSources??{}))if(sha(await readFile(resolve(root,name)))!==hash)throw Error('remediation_admission_executor_changed:'+name);
 for(const name of ['scripts/decision-diagnostics/nuknuk-beta-admission.mjs','scripts/decision-diagnostics/nuknuk-beta-callback.py','scripts/decision-diagnostics/nuknuk-beta-run.py'])if(!receipt.executionSources?.[name])throw Error('remediation_admission_executor_binding_missing');
 return {receiptSha256:sha(Buffer.from(JSON.stringify(receipt))),sourceHashes:receipt.sourceHashes,maximumTotalUsd:10};
}
