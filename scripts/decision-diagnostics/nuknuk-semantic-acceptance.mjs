#!/usr/bin/env node
/** The commissioned assistant's dated content review of ONE frozen snapshot.
 * Not a generic automatic reviewer. Any changed input/vocabulary is rejected.
 * No model call, training, remote connection or product activation. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {auditUnderstandingDataset,understandingSplitHash} from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
import {validateNuknukUnderstanding} from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {NUKNUK_TRAINING_VOCABULARY,NUKNUK_TRAINING_VOCABULARY_HASH} from '../../packages/decision-vnext-core/dist/nuknuk-training-vocabulary.js';
export const REVIEW_VOCABULARY_HASH='0cbeb88174184705819afe54b19f736f6156c198582ec0512ef8445528155199';
export const REVIEW_PARENT_HASH='e278c5aafb74a270681cd8cba5cc4b6c0b0dffb2a7070cabdb42b94ff8fbe90a';
const notes={
 'birthday-recipient-dinner':'Birthday is an occasion, dinner the activity; recipient taste is unknown. Specialness guides preference, never luxury eligibility.',
 'anniversary-casual':'Meal duty, cozy preference, explicit luxury exclusion; occasion does not imply organised party.',
 'playground-parent-child':'Playground duty; four-year-old daughter context and adult accompaniment, no additional activity invented.',
 'family-animal-experience':'Animal experience duty, family accompaniment; pet access not inferred.',
 'quiet-necessary-alone':'Explicit necessary quiet stays required; alone does not mean renting a private venue.',
 'open-special-recipient':'No activity is known; one direction question, no invented restaurant or date.',
 'reunion-conversation':'Dinner and conversation are separate duties; reunion does not imply quiet, luxury or booking.',
 'gratitude-parents':'Lunch and gratitude; parents taste not borrowed from own profile.',
 'decompress-tea':'Tea and cozy preference; now is calculated from explicit reference, not an invented visit time.',
 'first-date-coffee':'Coffee duty and relaxed preference; no romance or expensive venue inference.',
 'family-indoor-food-options':'Family activity indoor plus alternative meal/snacks at same place, separate consumption activity.',
 'rain-child-museum':'Museum duty, four-year-old with accompaniment, stated rain context; suitability is inferred, not a weather forecast.',
 'group-vegan-budget':'A vegan option for the single named participant, no whole-group or whole-venue vegan duty; qualitative budget without invented amount.',
 'cozy-coffee-cake':'Coffee AND cake duties, cozy preference; no category or quiet inferred.',
 'drinks-without-party':'Bar and nonalcoholic cocktails, no party as selected experience; do not prohibit unrelated events elsewhere in venue.',
 'jazz-wheelchair':'Live jazz and accessible access are real duties; rollstuhl is context, location Basel is explicit.',
 'dinner-booking-advice':'No mandatory reservation; recommendation allowed, no free-table guarantee.',
 'family-bring-food':'Family accompaniment and explicit tomorrow; permission for own food, not a catering duty.',
 'alternative-culture-indoor':'Museum OR cinema; indoor applies to either alternative.',
 'meal-then-drink':'The sequence is real, but the current search cannot represent independent venue choices safely.',
 'couple-group-total':'Two people, dinner and hard total CHF 80; not CHF 80 each.',
 'baby-stroller-coffee':'Coffee and room for stroller; no invented age, step-free access or extra child activity.',
 'beginner-shared-cooking':'Cooking course with friend, beginners context; companion is not a provider-supplied partner.',
 'expanded-special-meal':'Explicit meals and diets preserved; soft specialness is a preference, price bounds retain operators/scopes; no invented tastes.',
 'expanded-special-beyond-price':'Specialness never implies price or category; open direction may need clarification. Explicit quiet and duration remain binding.',
 'expanded-recipient-context':'Named recipient interests distinguished from own taste; participant counts and activity/spectator roles need actual group scope.',
 'expanded-food-precision':'Actual consumption versus venue-wide restrictions distinguished; meal/dish/drink/diet and external guest permission are separate.',
 'expanded-family-precision':'Accompaniment follows approved family policy; explicit child ages and concrete activities preserved; no animal/pet or bath/sauna substitution.',
 'expanded-logical-binding':'AND/OR, same place, separate activity and consumption scopes; actual sequence retained rather than silently made one visit.',
 'expanded-access-participation':'Access, facilities, booking and hire duties explicit; dog permission must apply to the requested indoor area.',
 'expanded-budget-time':'Numeric bounds, total/per-person, date/day-phase, duration and food-only coverage preserved without invention.',
 'expanded-language-meaning':'German/English/Italian and typos reviewed by meaning; non-required is not excluded, atmosphere not category.',
 'expanded-instruction-boundary':'Keep actual request while refusing invented opening, veganity, reservations or disclosure of private information.',
 'r2-train-polarity':'Required/preferred/not-required distinctions retained; consumption exclusions cannot mean banning every venue offering it.',
 'r2-train-roles':'Ages and relationships attached to named persons; explicit party sizes include requester. Own taste is not companion taste.',
 'r2-train-time':'Explicit temporal operators and local dates computed from reference; absence of date remains absence.',
 'r2-train-budget':'LT versus LTE, preferred versus mandatory, total versus per-person checked; no numeric budget invented from cheap.',
 'r2-train-special':'Specialness as preference or expressly not-required; explicit luxury/experimental menu exclusions preserved.',
 'r2-train-conditional':'Weather branches are alternatives with own activity scopes, not simultaneous requirements or forecasts.',
 'r2-train-binding':'Alternatives, independent activities, consumption and sequence distinguished; optional bread is not an inferred preference.',
 'r2-train-scope':'Diet and alcohol needs attached to individuals, area properties to appropriate activities; no whole-venue exclusion from personal diet.',
 'r2-train-boundaries':'Private room, hire, quiet and occasion meanings preserved; no availability guarantees or guessed age.',
 'r2-train-language':'English, French and Swiss German equivalents reviewed; pas forcément differs from surtout pas; explicit time operators remain.',
 'r5-train-area':'Area versus atmosphere/conversation; only explicit quiet duties; preferably stays soft, no requirement from indifference.',
 'r5-train-food_permission':'Own food/drink permission differs from sale and delivery; eating elsewhere adds no access duty at activity venue.',
 'r5-train-dog':'Pet access differs from animal experience; negative pet participation adds no pet access requirement; area-specific permission held aside.',
 'r5-train-booking':'Recommended booking permitted by spontaneous request; mandatory booking only when explicitly requested. No table guarantee.',
 'r5-train-occasion':'Occasion is context, organised event only when requested; specialness preference, not compulsory luxury.',
 'r5-train-composition':'Keep conjunction, alternatives, place and sequence; activity and consumption have distinct scopes.',
 'r5-train-budget':'Total/per-person and preferred/required bounds distinguished; budget coverage not an invented purchase requirement.',
 'r5-train-revision':'Latest correction replaces abandoned wish; abandoned option is not automatically banned.',
};
const r4={
 polarity:['Activity with drinks; meal not required.','Personal refusal of a meal must not ban venues offering meals.','Terrace preferred, WLAN irrelevant.','Step-free duty, parking irrelevant.','Explicit quiet duty and loud-music exclusion.'],
 intent:['Birthday/recipient context, special preference, no luxury.','Surprise context, special preference, high price not required.','Conversation is required, not automatic quiet.','Colleagues context, uniqueness not required.','Particularly important strengthens vegan option, not special event.'],
 logic:['Dish alternative AND coffee.','Sequence and same place explicit.','Different venue must be represented, not silently lost.','Activity and meal OR snack, independent scopes at same place.','Both dishes must be available, no alternative.'],
 people:['Named child age and accompaniment, concrete activity duty.','Only one vegan person, not all participants or all dishes.','Wheelchair context entails usable access, not accessible claim about unknown spot.','Father age/mobility not invented.','Concrete family activity and indoor duty, no invented child age.'],
 budget:['Hard total budget and participant count.','Both dish and amount explicitly preferred.','Per-person activity-only budget, food paid separately.','Qualitative cheap, no amount.','Free family activity with own food permission, not catering.'],
 time:['Tomorrow local date and exact stated clock.','Today and strictly after clock.','Strictly after clock, date unknown.','Maximum visit duration, not clock time.','Evening only, no invented date.'],
 place:['Activity/food same place in Basel, not same room.','Outdoor for meal; indoor not required.','Indoor activity, club explicitly excluded.','Rhein proximity qualitative, terrace preferred, no guessed distance.','Activity and both explicit facilities required.'],
 weather:['Rain-dependent activity versus meal; no forecast.','User rain context, explicit indoor activity.','Sun/outdoor activity versus indoor food; independent branch scopes.','No area duty from indifference.','Heat-conditioned activity in cool indoor space, no guessed temperature.'],
 revision:['Replacement dish only; old dish not automatically banned.','Indoor replaces outdoor.','Corrected party size and total budget.','Activity/drinks remain, food duty removed.','Today evening replaces tomorrow.'],
 language:['Drinks required, dinner not required.','Dinner and special preference, expensive not required.','Swiss German tomorrow and hard per-person ceiling.','Keep activity, refuse invented availability.','Keep dish, no invented opening or seating.'],
};
for(const [theme,items]of Object.entries(r4))items.forEach((note,i)=>notes[`r4-train-${theme}-${i+1}`]=note);
for(let i=1;i<=30;i++)notes[`expanded-evidence-${String(i).padStart(2,'0')}`]='Candidate evidence reviewed: missing atmosphere remains POSSIBLE; confirmed matching property may be STRONG. Citations stay candidate-specific, no inferred seats, tastes or guaranteed enjoyment.';
const perCaseHold={
 'expanded-recipient-context-02':'Recipient dislikes sushi, but negative request is not scoped to their meal; a venue can also serve sushi.',
 'expanded-access-participation-06':'Indoor dog permission lost: general dog permission alone may refer to terrace.',
 'r2-polarity-5':'General catering need was narrowed to a full meal; snacks could satisfy it.',
 'r2-scope-9':'Personal no-meat diet is not venue prohibition; fish permission/vegetable interest lacks faithful scoped encoding.',
 'r5-train-occasion-1':'Explicit exclusion of organised jubilee activity is omitted; needs faithfully scoped exclusion.',
 'r5-train-occasion-8':'Today may qualify actual dinner or only the negated celebration; ambiguous temporal scope, held aside.',
};
function addActivity(m,id,label){if(!m.entities.some(e=>e.id===id))m.entities.push({id,kind:'ACTIVITY',label,members:[]});}
function splitConsumption(m){
 const before=contentHash(m);
 const activity=m.facts.filter(f=>f.key==='experience.activity'&&!['NOT_REQUIRED','EXCLUDED','CONTEXT'].includes(f.modality));
 const food=m.facts.filter(f=>['food.meal','food.drink','food.dish'].includes(f.key)&&!['NOT_REQUIRED','EXCLUDED','CONTEXT'].includes(f.modality));
 if(!activity.length||!food.length)return false;
 addActivity(m,'a1','Aktivität');addActivity(m,'a2','Verpflegung');
 activity.forEach(f=>f.subjectIds=['a1']);food.forEach(f=>f.subjectIds=['a2']);
 for(const f of m.facts){if(f.key==='offer.area'&&f.subjectIds.length===0){const idx=m.facts.indexOf(f);f.subjectIds=[food.some(x=>m.facts.indexOf(x)<idx)?'a2':'a1'];}}
 // Pairwise bindings only activate the selected food alternative.
 m.bindings=m.bindings.flatMap(b=>b.kind==='SAME_PLACE'&&b.factIds.some(id=>activity.some(f=>f.id===id))&&b.factIds.some(id=>food.some(f=>f.id===id))
  ? activity.flatMap(a=>food.filter(f=>b.factIds.includes(f.id)).map(f=>({kind:'SAME_PLACE',factIds:[a.id,f.id]}))) : [b]);
 return contentHash(m)!==before;
}
export function acceptFrozenSemanticCorpus(source,reviewedAt){
 if(NUKNUK_TRAINING_VOCABULARY_HASH!==REVIEW_VOCABULARY_HASH)throw Error('semantic_review_vocabulary_changed');
 if(contentHash(source)!==REVIEW_PARENT_HASH)throw Error('semantic_review_snapshot_changed');
 if(!Number.isFinite(Date.parse(reviewedAt)))throw Error('invalid_review_time');
 auditUnderstandingDataset(source,understandingSplitHash(source.splitPlan));
 const commission={instruction:'Dann nehme sie jetzt inhaltlich ab',scope:'LOCAL_SEMANTIC_REVIEW_OF_FIXED_2384_CASE_SNAPSHOT',
  actor:'COMMISSIONED_ASSISTANT_NOT_INDEPENDENT_HUMAN_GOLD',parentHash:REVIEW_PARENT_HASH,vocabularyHash:NUKNUK_TRAINING_VOCABULARY_HASH};
 const delegationHash=contentHash(commission),ledger=[],accepted=[],quarantined=[];
 for(const original of source.cases){
  if(original.split!=='TRAIN'||!notes[original.scenarioGroup])throw Error('unreviewed_family:'+original.id);
  const row=structuredClone(original),changes=[],hold=[];const t=row.content.target;
  if(row.content.task==='INTERPRET_REQUEST'){
   const m=t.meaning;
   // Reviewed policy: these relative adjectives express wishes, never a
   // factual property assertion or a mandatory luxury/romance threshold.
   for(const f of m.facts){
    if(f.key==='experience.character'&&f.modality==='CONTEXT'){
     f.modality='PREFERRED';changes.push({factId:f.id,reason:'SPECIALNESS_IS_SOFT_SELECTION_WISH',before:'CONTEXT',after:'PREFERRED'});
    }
    if(f.key==='experience.purpose'&&/^(?:etwas besonderes|etwas besonder[e]?s)$/iu.test(f.value.text??'')){
     f.key='experience.character';f.modality='PREFERRED';changes.push({factId:f.id,reason:'SPECIALNESS_NOT_UNSTRUCTURED_PURPOSE'});
    }
    if(original.id==='expanded-budget-time-03'&&f.value.text==='Getränke extra'){
     f.key='budget.coverage';f.value.text='nur Essen; Getränke separat';changes.push({factId:f.id,reason:'FOOD_ONLY_PRICE_SCOPE_NOT_GENERIC_PURPOSE'});
    }
    if(original.id==='r2-binding-8'&&f.value.text==='Brot'){
     f.modality='NOT_REQUIRED';changes.push({factId:f.id,reason:'OPTIONAL_IS_NOT_POSITIVE_PREFERENCE'});
    }
   }
   if(original.id==='expanded-logical-binding-09'){
    m.facts.find(f=>f.key==='offer.kind').modality='PREFERRED';changes.push({reason:'DRINK_SUFFICES_BAR_IS_ONLY_PREFERRED'});
   }
   if(original.id==='r2-scope-7'){
    m.facts.find(f=>f.key==='food.diet'&&f.value.text==='vegetarian').modality='PREFERRED';changes.push({reason:'LIKES_VEGETARIAN_IS_PREFERENCE_NOT_DUTY'});
   }
   if(original.id==='r2-scope-3'){
    m.facts.find(f=>f.key==='food.meal').modality='NOT_REQUIRED';
    t.moment.goal.statement='Glutenfreiheit nicht voraussetzen; die Erlebnisrichtung ist noch offen.';
    t.moment.missing=[{dimension:'EXPERIENCE_DIRECTION',whyItMatters:'Es wurde nur eine irrelevante Ernährungseigenschaft genannt, keine gewünschte Unternehmung.'}];
    t.moment.clarification={dimension:'EXPERIENCE_DIRECTION',question:'Was möchtest du unternehmen?',options:['Essen gehen','Etwas trinken','Etwas erleben']};
    changes.push({reason:'NO_MEAL_DUTY_FROM_DIET_INDIFFERENCE'});
   }
   if(original.id==='r2-boundaries-3'){
    const f=m.facts.find(f=>f.value.text==='Schach');f.key='experience.purpose';f.modality='CONTEXT';
    changes.push({reason:'PRIVATE_ROOM_FOR_OWN_CHESS_NOT_PROVIDER_CHESS_OFFER'});
   }
   if(original.id==='expanded-family-precision-04'){
    m.facts.find(f=>f.key==='experience.activity'&&f.value.text==='swimming').value.text='bathing';
    changes.push({reason:'BATHING_NOT_NARROWED_TO_SWIMMING'});
   }
   if(original.id==='expanded-special-beyond-price-04'){
    const f=m.facts.find(f=>f.key==='time.duration');f.modality='PREFERRED';f.value.operator='APPROX';
    changes.push({reason:'QUIET_HOUR_IS_APPROXIMATE_WISH_NOT_EXACT_DURATION_GATE'});
   }
   if(['expanded-recipient-context-08','expanded-family-precision-10'].includes(original.id)){
    const spectator=original.id==='expanded-recipient-context-08';
    for(const [id,label]of [['pMember1','Gruppenmitglied 1'],['pMember2','Gruppenmitglied 2'],['pSelf','ich']])
     m.entities.push({id,kind:'PERSON',label,members:[]});
    m.entities.find(e=>e.id==='g1').members=['pMember1','pMember2'];
    m.facts.push({id:'totalParty',key:'people.count',value:{amount:3,operator:'EQ',unit:'PEOPLE'},modality:'CONTEXT',basis:'INFERRED',subjectIds:[]},
     {id:'selfParticipation',key:'people.participation',value:{text:spectator?'zuschauend':'aktiv'},modality:'CONTEXT',basis:'EXPLICIT',subjectIds:['pSelf']},
     {id:'groupParticipation',key:'people.participation',value:{text:'aktiv'},modality:'CONTEXT',basis:'EXPLICIT',subjectIds:['g1']});
    changes.push({reason:'TWO_ACTIVE_GROUP_MEMBERS_PLUS_REQUESTER_TOTAL_THREE'});
   }
   if(original.scenarioGroup==='rain-child-museum'){
    m.facts.filter(f=>f.key==='offer.weather_suitability').forEach(f=>f.modality='PREFERRED');
    changes.push({reason:'STATED_RAIN_CONTEXT_IS_NOT_AN_ADDITIONAL_HARD_MUSEUM_ELIGIBILITY_DUTY'});
   }
   if(original.id==='r2-boundaries-12'||original.id==='expanded-special-beyond-price-04'){
    m.facts.filter(f=>f.key==='atmosphere.noise').forEach(f=>f.modality='PREFERRED');
    changes.push({reason:'ORDINARY_QUIET_ATMOSPHERE_WISH_NOT_EXPLICIT_MUST'});
   }
   // Scope repair is restricted to reviewed snapshot examples. Independent
   // activity/catering must not inherit one common offer/room witness.
   if(splitConsumption(m))changes.push({reason:'DISTINCT_ACTIVITY_AND_CONSUMPTION_SCOPES'});
   // Named dietary participant was otherwise attached to the whole meal.
   if(original.scenarioGroup==='group-vegan-budget'){
    if(!m.entities.some(e=>e.id==='pVegan'))m.entities.push({id:'pVegan',kind:'PERSON',label:'die eine vegan essende Person',members:[]});
    m.facts.filter(f=>f.key==='food.diet').forEach(f=>f.subjectIds=['pVegan']);changes.push({reason:'ONE_VEGAN_PERSON_NOT_ENTIRE_GROUP'});
   }
   if(m.bindings.some(b=>b.kind==='SEQUENCE'))hold.push('SEQUENCE_LANGUAGE_VALID_BUT_CURRENT_MULTI_VISIT_EXECUTION_UNSUPPORTED');
   if(/woanders|anderen (?:Ort|Betrieb|Lokal)|[Vv]erschiedene Orte|zwei Orten/iu.test(row.content.query)&&m.facts.filter(f=>['REQUIRED','PREFERRED'].includes(f.modality)&&/^(?:food\.|experience.activity)/u.test(f.key)).length>1)
    hold.push('DIFFERENT_VENUE_NEED_NOT_FAITHFULLY_ENCODED');
   if(m.facts.some(f=>f.modality==='EXCLUDED'&&/^(?:food\.|experience.activity)/u.test(f.key)))hold.push('PERSONAL_CONSUMPTION_OR_ACTIVITY_EXCLUSION_NEEDS_SCOPE_PROOF');
   if(m.facts.some(f=>f.key==='participation.permission'&&/^Hunde /u.test(f.value.text??'')&&m.facts.some(f=>f.key==='offer.area'&&f.modality==='REQUIRED')))
    hold.push('DOG_ACCESS_MUST_BE_PROVEN_FOR_SELECTED_AREA');
   const validation=validateNuknukUnderstanding(t,row.content);
   // A need for clarification is a correct understanding outcome, not failure.
   if(validation.requestState==='UNSUPPORTED_CAPABILITY')hold.push('UNSUPPORTED_MATCHING_FAMILY');
  }else{
   // Apéro is not proved by a generic meal-only summary; do not certify
   // a more specific beverage/occasion meaning without visible evidence.
   if(/^expanded-world-(22|23|24)-[ab]$/u.test(row.id))hold.push('APERO_NOT_PROVEN_BY_GENERIC_MEAL_EVIDENCE');
  }
  if(perCaseHold[row.id])hold.push(perCaseHold[row.id]);
  const reasons=[...new Set(hold)],verdict=reasons.length?'REJECT':'ACCEPT';
  const semanticVerdict=reasons.every(reason=>reason==='SEQUENCE_LANGUAGE_VALID_BUT_CURRENT_MULTI_VISIT_EXECUTION_UNSUPPORTED')?'ACCEPT':'REJECT';
  row.content.trainingPermission=verdict==='ACCEPT'?'APPROVED':'PENDING';row.contentHash=contentHash(row.content);
  const semanticNote=notes[row.scenarioGroup]+(changes.length?' Corrections: '+changes.map(c=>c.reason).join('; ')+'.':'')
   +(reasons.length?' Held out: '+reasons.join('; ')+'.':' Reviewed against the actual sentence, modality, person/activity scope, logic, time/budget and moment.');
  row.reviews=['SEMANTICS','PRIVACY_AND_SOURCE_USE'].map(kind=>({kind,verdict:kind==='SEMANTICS'?semanticVerdict:'ACCEPT',contentHash:row.contentHash,
   reviewer:'codex-commissioned-semantic-acceptance-20261110',reviewerKind:'DELEGATED_ASSISTANT',delegationHash,reviewedAt,
   ...(kind==='SEMANTICS'?{vocabularyHash:NUKNUK_TRAINING_VOCABULARY_HASH}:{}),
   note:kind==='SEMANTICS'?semanticNote:'Synthetic or explicitly commissioned deidentified examples; fictional venues. No account/session records, private taste vectors or provider secrets. Local review only, no remote training consent added.'}));
  ledger.push({id:row.id,scenarioGroup:row.scenarioGroup,sourceContentHash:original.contentHash,reviewedContentHash:row.contentHash,
   targetChanged:contentHash(original.content.target)!==contentHash(row.content.target),
   verdict,semanticVerdict,trainingDisposition:verdict==='ACCEPT'?'ACCEPT':'QUARANTINE',reasons,changes,note:semanticNote});
  (verdict==='ACCEPT'?accepted:quarantined).push(row);
 }
 const dataset=cases=>({version:source.version,cases,splitPlan:source.splitPlan.filter(g=>cases.some(c=>c.scenarioGroup===g.scenarioGroup))});
 const approved=dataset(accepted),held=dataset(quarantined);
 const audit=auditUnderstandingDataset(approved,understandingSplitHash(approved.splitPlan));
 if(audit.cases.some(r=>r.blockers.length))throw Error('accepted_cases_have_blockers');
 return {approved,quarantined:held,report:{version:'backyrd.nuknuk-semantic-acceptance@1',commission,delegationHash,reviewedAt,
  method:'ASSISTANT_CONTENT_REVIEW_OF_312_INDIVIDUAL_INTERPRETATIONS_50_TEMPLATE_FAMILIES_AND_72_EVIDENCE_EXERCISES_WITH_ALL_EXPANSION_VALIDATION',
  independentHumanGold:false,perfectCorrectnessClaim:false,trainingStarted:false,productionEnabled:false,
  counts:{reviewed:ledger.length,accepted:accepted.length,quarantined:quarantined.length,pending:0,
   interpretation:accepted.filter(c=>c.content.task==='INTERPRET_REQUEST').length,assessment:accepted.filter(c=>c.content.task==='ASSESS_CANDIDATES').length,
   languageAcceptedButExecutionHeld:ledger.filter(r=>r.verdict==='REJECT'&&r.semanticVerdict==='ACCEPT').length,
   corrected:ledger.filter(c=>c.targetChanged).length},
  trainingPartitionApproved:true,launchReady:false,launchLimitations:['FRESH_VALIDATION_AND_TEST_STILL_REQUIRED','NO_MODEL_QUALITY_CLAIM_FROM_TARGET_REVIEW'],
  ledger}};
}
async function main(){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('usage: frozen-review-draft.json new-output-directory');
 const source=JSON.parse(await readFile(resolve(input),'utf8')),result=acceptFrozenSemanticCorpus(source,new Date().toISOString());
 await mkdir(resolve(output));
 for(const [name,value]of [['vocabulary.json',NUKNUK_TRAINING_VOCABULARY],['approved-train.json',result.approved],['quarantined.json',result.quarantined],['semantic-acceptance.json',result.report]])
  await writeFile(resolve(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result.report.counts));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
