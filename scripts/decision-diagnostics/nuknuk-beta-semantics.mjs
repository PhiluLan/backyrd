import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {librarianConcept} from '@backyrd/world-knowledge-core';
export const roleAliases={Onkel:'uncle',oncle:'uncle',Tante:'aunt',tante:'aunt',Vater:'father','père':'father',Mutter:'mother',Mueter:'mother','mère':'mother',Schwester:'sister','Schwöster':'sister','sœur':'sister',Bruder:'brother','Brüeder':'brother','frère':'brother',Tochter:'daughter',fille:'daughter',Sohn:'son',fils:'son',Freund:'male friend','Fründ':'male friend',ami:'male friend',Freundin:'female friend','Fründin':'female friend',amie:'female friend'};
const sorted=items=>[...items].sort((a,b)=>contentHash(a).localeCompare(contentHash(b)));
const textValue=value=>roleAliases[value]??librarianConcept(value)??value;
function canonicalMeaning(meaning,entityMap,maskNumbers=false){
 let facts=new Map(),weather=new Map();
 const rewrite=value=>{
  if(Array.isArray(value))return value.map(rewrite);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['id','label'].includes(key)).map(([key,item])=>[key,maskNumbers&&['amount','date','time'].includes(key)?'<'+key.toUpperCase()+'>':key==='text'?textValue(item):key==='includes'&&Array.isArray(item)?sorted(item):key==='subjectIds'?sorted(item.map(id=>entityMap[id]??id)):key==='relatedIds'?sorted(item.map(id=>entityMap[id]??facts.get(id)??weather.get(id)??'INVALID_REFERENCE')):key==='referenceEntityId'?(entityMap[item]??item):rewrite(item)]));
 };
 facts=new Map([...meaning.facts,...meaning.extensions].map(f=>[f.id,contentHash(rewrite(f))]));
 weather=new Map(meaning.weatherConditions.map(w=>[w.id,contentHash(rewrite(w))]));
 const logic=node=>{
  if(!node)return null;
  if(node.kind==='FACT')return {kind:'FACT',fact:facts.get(node.factId)??'INVALID_REFERENCE'};
  if(node.kind==='IF')return {kind:'IF',condition:weather.get(node.conditionFactId)??'INVALID_REFERENCE',then:logic(node.then),else:logic(node.else)};
  if(node.kind==='FALLBACK')return {kind:'FALLBACK',options:node.options.map(logic)};
  return {...node,children:sorted(node.children.map(logic))};
 };
 return {entities:sorted(meaning.entities.map(e=>({id:entityMap[e.id]??e.id,kind:e.kind,members:sorted(e.members.map(id=>entityMap[id]??id))}))),facts:sorted(meaning.facts.map(rewrite)),extensions:sorted(meaning.extensions.map(rewrite)),weatherConditions:sorted(meaning.weatherConditions.map(rewrite)),logic:logic(meaning.logic),bindings:sorted(meaning.bindings.map(b=>({kind:b.kind,facts:b.kind==='SEQUENCE'?b.factIds.map(id=>facts.get(id)):sorted(b.factIds.map(id=>facts.get(id)))}))),uncertainties:sorted(meaning.uncertainties.map(rewrite))};
}
/** Exact semantic graph comparison, allowing ID/fact order changes and catalogued aliases.
 * Enumerates entity bijections by kind; refuses excessive complexity, never guesses. */
export function compareBetaMeaning(actual,expected){
 if(actual.entities.length!==expected.entities.length||actual.facts.length!==expected.facts.length)return false;
 const expectedHash=contentHash(canonicalMeaning(expected,Object.fromEntries(expected.entities.map(e=>[e.id,e.id]))));
 let attempts=0;
 function match(index,map,used){
  if(index===actual.entities.length){if(++attempts>4096)throw Error('beta_oracle_mapping_limit');return contentHash(canonicalMeaning(actual,map))===expectedHash;}
  const entity=actual.entities[index];
  return expected.entities.filter(e=>e.kind===entity.kind&&!used.has(e.id)).some(e=>match(index+1,{...map,[entity.id]:e.id},new Set([...used,e.id])));
 }
 return match(0,{},new Set());
}

export function betaGraphHash(meaning,{maskNumbers=false}={}){
 let attempts=0,best=null;
 const slots=meaning.entities.map(e=>e.kind).reduce((result,kind)=>{result[kind]=(result[kind]??0)+1;return result;},{});
 function assign(index,map,used){
  if(index===meaning.entities.length){if(++attempts>4096)throw Error('beta_graph_mapping_limit');const hash=contentHash(canonicalMeaning(meaning,map,maskNumbers));if(best===null||hash<best)best=hash;return;}
  const entity=meaning.entities[index];for(let n=0;n<slots[entity.kind];n++){const id=entity.kind+':'+n;if(!used.has(id))assign(index+1,{...map,[entity.id]:id},new Set([...used,id]));}
 }
 assign(0,{},new Set());return best;
}
