import { emptyExperienceProfile, emptyExperienceConditions, REGISTRY_VERSION, REGISTRY_HASH, ACCEPTED_SOURCE_POLICY } from '@backyrd/world-knowledge-core';
import { prepareLibrarianRequest,LUNA_LIBRARIAN_CONTRACT_VERSION } from '../dist/product-luna-librarian.js';
import { searchLibrarianCatalog } from '../dist/product-librarian-matching.js';
import { contentHash } from '../dist/canonical.js';
import { LIBRARIAN_FAMILY_STRATEGIES } from '../dist/product-librarian-language.js';
import { LUNA_LIBRARIAN_FACT_KEYS } from '../dist/product-luna-librarian-assets.js';
const reference={now:'2026-10-14T10:00:00+02:00',timezone:'Europe/Zurich'};
const authority={city:'Basel',now:'2026-10-14T08:00:00Z'};
const entities=[{id:'a1',kind:'ACTIVITY',label:'Erlebnis',members:[]},{id:'a2',kind:'ACTIVITY',label:'zweites Erlebnis',members:[]},{id:'p1',kind:'PERSON',label:'Person 1',members:[]},{id:'p2',kind:'PERSON',label:'Person 2',members:[]},{id:'g1',kind:'GROUP',label:'Gruppe',members:['p1','p2']}];
const fact=(id,key,value,modality='REQUIRED',subjectIds=['a1'])=>({id,key,value:typeof value==='string'?{text:value}:value,modality,basis:'EXPLICIT',subjectIds});
const request=(facts,extra={})=>prepareLibrarianRequest({contractVersion:LUNA_LIBRARIAN_CONTRACT_VERSION,sourceText:'Synthetischer Wunsch, wird nicht als Suchtext interpretiert.',reference,output:{entities,facts,logic:null,bindings:[],extensions:[],uncertainties:[],weatherConditions:[],...extra}});
const conditions=emptyExperienceConditions();
const prop=(key,value,extra={})=>({key,value,label:null,state:'KNOWN',conditions,...extra});
const area=(id='inside',properties=[])=>({id,kind:id==='terrace'?'TERRACE':'INDOOR',name:id,properties});
const schedule=[{weekday:3,start:'11:00',end:'23:00'},{weekday:4,start:'11:00',end:'23:00'}];
const price=(amount=35,extra={})=>({label:'Essen',currency:'CHF',min:amount,max:amount,basis:'PER_PERSON',minimumAge:null,maximumAge:null,mandatoryFeesIncluded:true,includes:'Essen',conditions,...extra});
const offer=(id='dinner',kind='DINNER',areaIds=['inside'],properties=[],prices=[price()])=>({id,kind,name:id,areaIds,properties,prices,schedule,validFrom:null,validUntil:null});
const profile=(offers=[offer()],areas=[area()],category='RESTAURANT')=>({...emptyExperienceProfile(category),reviewed:true,areas:areas.map(a=>category==='MUSEUM'?{...a,kind:a.kind==='TERRACE'?'OUTDOOR':a.kind==='INDOOR'?'EXHIBITION':a.kind}:a),offers:category==="ZOO"?offers.map(o=>({...o,prices:o.prices.map(p=>({...p,includes:"Eintritt"}))})):offers});
const worldFact=(key,value,extra={})=>({key,value,scope:'SPOT',resolution:'KNOWN_VALUE',freshness:'CURRENT',trust:'VERIFIED',basisClaimHashes:[contentHash({key,value})],...extra});
const binding=(index,p,extras=[])=>({contractVersion:'backyrd.world-knowledge.product-resolver-binding@1.0',manifestHash:contentHash({index,p}),registryHash:REGISTRY_HASH,resolvedAt:'2026-10-14T08:00:00Z',decisionProjection:{contractVersion:'backyrd.world-knowledge.product-decision-projection@1.0',registryVersion:REGISTRY_VERSION,policyVersion:ACCEPTED_SOURCE_POLICY.policyVersion,spotId:`10000000-0000-4000-8000-${String(index).padStart(12,'0')}`,facts:[worldFact('identity.name','Spot '+index),worldFact('location.locality','Basel'),worldFact('location.timezone','Europe/Zurich'),worldFact('classification.place_types',[p.category]),worldFact('hours.regular',[{day:'WEDNESDAY',intervals:[{start:'11:00',end:'23:00'}]},{day:'THURSDAY',intervals:[{start:'11:00',end:'23:00'}]}]),worldFact('experience.profile',p,{hardConstraintAuthorized:true,validityVerified:true,validFrom:null,validUntil:null}),...extras],explicitUnknowns:[],conflicts:[]}});
const search=(r,catalog,extra={})=>searchLibrarianCatalog({request:r,catalog,authority,...extra});
const meal=()=>fact('meal','experience.activity','essen gehen');
const date=()=>fact('date','time.date',{date:'2026-10-15',operator:'EQ',timezone:'Europe/Zurich'},'REQUIRED',[]);
const evening=()=>fact('evening','time.day_phase',{phase:'EVENING',timezone:'Europe/Zurich'},'REQUIRED',[]);
const budget=(amount=40)=>[fact('money','budget.maximum',{amount,operator:'LTE',currency:'CHF'}),fact('scope','budget.scope',{scope:'PER_PERSON'},'CONTEXT',[])];
const summary=r=>({ranked:r.ranked.map(c=>[c.spotId,c.status,c.unknownFactIds,c.failedFactIds]),excluded:r.excluded.map(c=>[c.spotId,c.status,c.unknownFactIds,c.failedFactIds])});


export { reference, authority, entities, fact, request, conditions, prop, area, schedule, price, offer, profile, worldFact, binding, search, meal, date, evening, budget, summary };
