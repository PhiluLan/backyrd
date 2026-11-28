// Evidence inventory, not an approval generator. No reviewer identity is invented.
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {semanticPattern} from './nuknuk-beta-training-cases.mjs';
import {productTrainingCases} from './nuknuk-product-training-cases.mjs';
const utterance=row=>row.turns?.map(t=>t.answer).join(' ')??row.query;
const normalize=text=>text.normalize('NFKC').toLocaleLowerCase().replace(/\d+(?:[.,:]\d+)*/gu,'#').replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/gu,' ').trim();
const tokens=text=>new Set(normalize(text).split(' '));
export function betaCaseHash(row){return contentHash({id:row.id,locale:row.locale,query:row.query,reference:row.reference,expected:row.expected,previousMeaning:row.previousMeaning??null,turns:row.turns??null});}
export function auditBetaTransfer(rows,transfer){
 const history=productTrainingCases();const seen=[...rows,...history];
 const patterns=new Map();for(const r of seen){const key=semanticPattern(r);patterns.set(key,[...(patterns.get(key)??[]),r.id]);}
 const exact=[],structural=[],near=[];
 for(const r of transfer){
  const key=normalize(utterance(r));
  for(const prior of seen){
   if(normalize(utterance(prior))===key)exact.push({transfer:r.id,prior:prior.id});
   else if(prior.locale===r.locale){const a=tokens(utterance(r)),b=tokens(utterance(prior)),union=new Set([...a,...b]);const score=[...a].filter(t=>b.has(t)).length/union.size;
    if(score>=0.70)near.push({transfer:r.id,prior:prior.id,jaccard:score});}
  }
  const known=patterns.get(semanticPattern(r));if(known)structural.push({transfer:r.id,prior:known});
 }
 return {version:'backyrd.beta-transfer-audit@1',sourceSetHash:contentHash(rows.map(betaCaseHash)),transferSetHash:contentHash(transfer.map(betaCaseHash)),historicalRows:history.length,exactNormalizedUtteranceCollisions:exact,structuralCollisions:structural,nearPhraseReview:near,automatedResult:exact.length||structural.length?'REVISE':'NO_DETECTED_COLLISION',humanParaphraseAdjudication:'PENDING',independentHumanGold:false,limitations:['Hashes and lexical thresholds cannot establish semantic independence.','Same assistant authored this bank; distinct wording is not independent authorship.']};
}
export function betaNativeReviewPacket(rows,transfer){
 return {version:'backyrd.beta-native-review-packet@1',instructions:'A human proficient in the locale must compare each exact source/target for idiom, meaning, scope and inference; do not approve based on JSON validity. Enter identity, language competence, timestamp, caseHash, verdict and reasons in a separate receipt. Any source change invalidates its receipt.',status:'PENDING',rows:[...rows,...transfer].map(row=>({id:row.id,locale:row.locale,caseHash:betaCaseHash(row),query:row.query,reference:row.reference,turns:row.turns??null,previousMeaning:row.previousMeaning??null,expected:row.expected,review:null})),reviews:[],independentHumanGold:false};
}

/** Reviews development teaching targets without changing a split or granting
 * export/training approval. Shared held-out semantic patterns are quarantined. */
export function auditBetaRemediationTargets(rows,frozenRows,transferRows=[]) {
 const protectedPatterns=new Map();
 for(const row of [...frozenRows.filter(r=>r.split==='TEST'||r.split==='VALIDATION'),...transferRows]){
  const key=semanticPattern(row);protectedPatterns.set(key,[...(protectedPatterns.get(key)??[]),row.id]);
 }
 const results=rows.map(row=>{
  const issues=[],m=row.expected.meaning,byId=new Map(m.entities.map(e=>[e.id,e]));
  if(row.split!=='DEVELOPMENT'||row.trainingAuthorized!==false)issues.push('NOT_ISOLATED_DEVELOPMENT');
  for(const f of m.facts){
   if(f.key==='people.count'&&f.value.amount>1&&f.subjectIds.some(id=>byId.get(id)?.kind!=='GROUP'))issues.push('COUNT_REQUIRES_GROUP');
   if(f.key==='budget.scope'){
    const budgets=m.facts.filter(x=>['budget.maximum','budget.amount','budget.target'].includes(x.key));
    if(!budgets.some(b=>contentHash([...b.subjectIds].sort())===contentHash([...f.subjectIds].sort())))issues.push('BUDGET_SCOPE_UNBOUND');
   }
  }
  if(row.theme==='roles'){
   const recipient=m.facts.some(f=>f.key==='people.role'&&f.value.text==='recipient');
   const relatives=m.facts.filter(f=>f.key==='people.relationship'&&f.value.text!=='adult_accompanied');
   const selves=m.facts.filter(f=>f.key==='people.role'&&f.value.text==='self').flatMap(f=>f.subjectIds);
   if(!recipient&&(!selves.length||!relatives.length||relatives.some(f=>f.subjectIds.some(id=>selves.includes(id)))))issues.push('SELF_AND_COMPANION_NOT_DISTINCT');
   if(recipient&&selves.length)issues.push('GIFT_ASSUMES_SHARED_ATTENDANCE');
  }
  if(row.theme==='subgroups'){
   const counts=m.facts.filter(f=>f.key==='people.count').sort((a,b)=>b.value.amount-a.value.amount);
   const total=counts[0],part=counts[1];
   if(counts.length!==2||counts.some(f=>f.modality!=='CONTEXT')||!byId.get(total?.subjectIds[0])?.members.includes(part?.subjectIds[0]))issues.push('SUBGROUP_NOT_LINKED');
  }
  if(row.theme==='visit-time'){
   const visitTimes=m.facts.filter(f=>f.key.startsWith('time.')&&f.subjectIds.includes('a1'));
   if(!visitTimes.some(f=>f.key==='time.date')||visitTimes.some(f=>f.modality!=='REQUIRED'))issues.push('VISIT_TIME_NOT_REQUIRED');
  }
  if(row.theme==='exclusions'&&!m.facts.some(f=>f.modality==='EXCLUDED'&&f.key===(row.familyId.endsWith('-venue')?'offer.kind':'experience.activity')))issues.push('EXCLUSION_LOST_OR_MISSCOPED');
  if(row.theme==='party-capacity'&&!m.facts.some(f=>f.key==='people.count'&&f.modality===(row.familyId.endsWith('-capacity')?'REQUIRED':'CONTEXT')))issues.push('PARTY_CAPACITY_MODALITY');
  const collisions=protectedPatterns.get(semanticPattern(row))??[];
  return {id:row.id,caseHash:betaCaseHash(row),issues,protectedPatternCollisions:collisions,exportStatus:collisions.length?'QUARANTINED_HELDOUT_PATTERN':'REVIEW_REQUIRED'};
 });
 return {version:'backyrd.beta-remediation-target-audit@1',status:results.some(r=>r.issues.length)?'REVISE':'TARGET_INVARIANTS_PASS_NOT_TRAINING_APPROVAL',rows:results,sourceSetHash:contentHash(rows.map(betaCaseHash)),frozenSourceSetHash:contentHash(frozenRows.map(betaCaseHash)),quarantinedRows:results.filter(r=>r.protectedPatternCollisions.length).length,independentHumanGold:false,modelOutputsUsedForTargets:false,trainingAuthorized:false,holdoutModified:false};
}
