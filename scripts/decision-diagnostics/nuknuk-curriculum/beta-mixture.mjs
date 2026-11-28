/** Preregistered data objective and target-free packets. No model or network. */
export function trainingStratum(row){return row.task==='DIALOGAKTUALISIERUNG_V3'?'DIALOGUE':row.theme==='lexicon'?'LEXICON':['INDIVIDUALLY_AUTHORED_SYNTHETIC_COMPOSITION','AUTHORED_CORRECTION_WITH_CONTROLLED_REPHRASINGS','INDEPENDENT_REVIEWER_AUTHORED_SYNTHETIC_HOLDOUT'].includes(row.provenance.kind)?'COMPOSITION':'BLUEPRINT';}
export const STRATUM_MASS=Object.freeze({LEXICON:0.05,BLUEPRINT:0.25,COMPOSITION:0.35,DIALOGUE:0.35});
export function betaMixture(rows){
 if(!rows.length||rows.some(r=>r.split!=='TRAIN'))throw Error('beta_mixture_train_only');
 const strata={};for(const r of rows){const s=trainingStratum(r);(strata[s]??=new Map());const g=strata[s].get(r.scenarioGroup)??[];g.push(r);strata[s].set(r.scenarioGroup,g);}
 if(Object.keys(strata).length!==4)throw Error('beta_mixture_missing_stratum');
 const cases=rows.map(r=>{const stratum=trainingStratum(r),groups=strata[stratum],n=groups.get(r.scenarioGroup).length;return{id:r.id,stratum,scenarioGroup:r.scenarioGroup,lossWeight:rows.length*STRATUM_MASS[stratum]/groups.size/n};});
 const groupMass={};for(const c of cases)groupMass[c.scenarioGroup]=(groupMass[c.scenarioGroup]??0)+c.lossWeight/rows.length;
 const sum=cases.reduce((s,r)=>s+r.lossWeight,0);if(Math.abs(sum-rows.length)>1e-7)throw Error('beta_mixture_not_normalized');
 return {version:'backyrd.nuknuk-beta-mixture@1',stratumMass:STRATUM_MASS,cases,trainingRows:rows.length,loss:'Per-example supervised-token mean, multiplied by frozen stratum/group weight; microbatch1, one complete epoch, no duplicate correction rows.',maximumGroupObjectiveMass:Math.max(...Object.values(groupMass)),limitations:['Objective weights do not imply exact Adam/clipping gradient-contribution shares.','This is a preregistered hypothesis, not a measured optimal or real-user distribution.']};
}
export function evaluationPacket(catalog,split){
 if(!['DEV','TEST'].includes(split))throw Error('beta_eval_split_invalid');
 return {version:'backyrd.nuknuk-beta-inference-inputs@1',split,targetIncluded:false,cases:catalog.cases.filter(r=>r.split===split).map(r=>({id:r.id,split,task:r.task,locale:r.locale,familyId:r.family,scenarioGroup:r.scenarioGroup,query:r.query,reference:r.reference,promptHash:r.request.promptHash,inputHash:r.request.inputHash,schemaHash:r.request.schemaHash,messages:[{role:'system',content:catalog.prompts[r.request.promptHash]},{role:'user',content:r.request.input}],outputSchema:catalog.schemas[r.request.schemaHash]}))};
}
