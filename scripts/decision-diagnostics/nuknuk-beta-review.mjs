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
