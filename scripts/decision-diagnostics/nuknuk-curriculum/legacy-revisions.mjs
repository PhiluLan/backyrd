// Concrete revisions commissioned after independent review. Parent stays immutable.
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
const individualCounts=new Set(['two-people-total-budget','expanded-logical-binding-02','expanded-access-participation-10','expanded-budget-time-02','r2-roles-10','r2-roles-11','r2-boundaries-12','r5-train-budget-1','r5-train-budget-2','r5-train-budget-7','r5-train-budget-8','r5-train-revision-5']);
export function reviseLegacy(rows){
 const ledger=[];
 const cases=rows.map(source=>{
  if(source.content.task!=='INTERPRET_REQUEST')return source;
  const row=structuredClone(source),m=row.content.target.meaning,reasons=[];
  const entity=(id,kind,label,members=[])=>{if(!m.entities.some(e=>e.id===id))m.entities.push({id,kind,label,members});};
  if(individualCounts.has(row.id)||/^r4-train-(people-2|budget-1|revision-3)-\d+$/.test(row.id)){
   for(const f of m.facts.filter(f=>f.key==='people.count')){f.modality='REQUIRED';f.subjectIds=['gVisit'];}
   entity('gVisit','GROUP','Vollständige nutzende Gruppe');reasons.push('COMPLETE_GROUP_CAPACITY_REQUIRED');
  }
  if(['expanded-recipient-context-08','expanded-family-precision-10'].includes(row.id)){
   const total=m.facts.find(f=>f.id==='totalParty');total.subjectIds=['gVisit'];
   entity('gVisit','GROUP','Gesamte anwesende Gruppe',['pMember1','pMember2','pSelf']);
   if(row.id==='expanded-family-precision-10')total.modality='REQUIRED';
   else {total.modality='CONTEXT';m.facts.find(f=>f.id==='f2').modality='REQUIRED';}
   reasons.push('ACTIVE_PARTICIPANTS_DISTINCT_FROM_ATTENDANCE');
  }
  if(row.id==='expanded-budget-time-09'||/^r4-train-budget-5-\d+$/.test(row.id)){
   const f=m.facts.find(f=>f.id==='f4');if(f.key!=='budget.maximum'||f.value.amount!==0)throw Error('legacy_currency_review_mismatch');
   f.value.currency='UNSPECIFIED';reasons.push('NO_CURRENCY_IN_FREE_REQUEST');
  }
  if(row.id==='r2-roles-6'||/^r4-train-people-3-\d+$/.test(row.id)){
   const f=m.facts.find(f=>f.id==='f4');if(f.key!=='participation.accessibility')throw Error('legacy_access_review_mismatch');
   f.basis='INFERRED';reasons.push('ACCESS_INFERRED_FROM_EXPLICIT_WHEELCHAIR');
  }
  if(row.id==='r2-roles-9'){
   entity('pSon','PERSON','Erwachsener Sohn');for(const id of ['f2','f3'])m.facts.find(f=>f.id===id).subjectIds=['pSon'];
   reasons.push('ADULT_ROLE_BELONGS_TO_SON');
  }
  if(row.id==='r2-language-8'){
   const f=m.facts.find(f=>f.id==='f3');if(f.key!=='participation.booking'||f.modality!=='NOT_REQUIRED'||f.value.text!=='ohne Reservation')throw Error('legacy_booking_alias_review_mismatch');
   f.value.text='spontaneous';reasons.push('OPTIONAL_SPONTANEITY_CANONICAL_WIRE_ALIAS');
  }
  if(row.id==='anniversary-familiar'){
   m.facts.push({id:'noSurprise',key:'experience.character',value:{text:'ausgefallen'},modality:'EXCLUDED',basis:'EXPLICIT',subjectIds:['a1']});
   reasons.push('OWN_EXPERIENCE_EXCLUSION_NOT_INDIFFERENCE');
  }
  if(row.id==='r5-train-food_permission-8'){
   m.facts.push({id:'laterOwnFood',key:'experience.purpose',value:{text:'Nach dem Bouldern eigene Brotbox an einem anderen Ort essen'},modality:'CONTEXT',basis:'EXPLICIT',subjectIds:[]});
   row.content.target.moment.goal.statement='Bouldern; danach eigene Brotbox woanders essen, keine Gastronomie- oder Mitbringerlaubnis am Boulderort verlangen.';
   reasons.push('OWN_FOOD_AFTER_VISIT_ELSEWHERE_PRESERVED');
  }
  if(!reasons.length)return source;
  row.content.trainingPermission='PENDING';row.contentHash=contentHash(row.content);row.reviews=[];
  ledger.push({id:row.id,sourceContentHash:source.contentHash,revisedContentHash:row.contentHash,reasons});return row;
 });
 return{cases,ledger};
}
