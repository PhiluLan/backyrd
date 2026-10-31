/** Compare meaning, not model IDs, object order or redundant conjunctions.
 * This is diagnostic only and never changes a request given to the engine. */
export function translationLogicSignature(meaning,{conceptFor,rules}) {
 const atom=id=>{
  const f=meaning.facts.find(f=>f.id===id);
  if(!f)return {extension:meaning.extensions.find(e=>e.id===id)??id};
  if(['CONTEXT','NOT_REQUIRED'].includes(f.modality))return 'NO_DUTY';
  const c=f.value.kind==='TEXT'?conceptFor(f.value.text):null;
  return [c?rules[c]?.[0]??f.key:f.key,f.modality,c??f.value];
 };
 const orderedUnique=values=>[...new Map(values.map(value=>[JSON.stringify(value),value])).entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);
 const walk=n=>{
  if(n.kind==='FACT')return atom(n.factId);
  if(n.kind==='IF'){
   const c=meaning.weatherConditions.find(c=>c.id===n.conditionFactId);
   return ['IF',c?{state:c.state,role:c.role,detail:c.detail}:atom(n.conditionFactId),walk(n.then),n.else?walk(n.else):null];
  }
  if(n.kind==='FALLBACK')return ['FALLBACK',n.options.map(walk)];
  const strength=n.strength??null;
  const evaluated=n.children.map(walk);
  if(n.kind==='ANY'&&evaluated.includes('NO_DUTY'))return 'NO_DUTY';
  const children=orderedUnique(evaluated.filter(child=>child!=='NO_DUTY').flatMap(child=>Array.isArray(child)&&child[0]===n.kind&&child[1]===strength?[...child[2]]:[child]));
  return children.length===0?'NO_DUTY':children.length===1?children[0]:[n.kind,strength,children];
 };
 const bindings=orderedUnique(meaning.bindings.map(b=>[b.kind,b.kind==='SEQUENCE'?b.factIds.map(atom):orderedUnique(b.factIds.map(atom))]));
 return {logic:walk(meaning.logic),bindings};
}
