import { librarianConcept } from '@backyrd/world-knowledge-core';
/** Explicit product vocabulary for permission to soften a wish. This is not
 * intent extraction: no activity, price, date, scope or requirement is inferred.
 * Without evidence, the provider may not silently relax a concrete user wish.
 * Unknown wording must remain uncertain, never fabricated as optional. */
export const LUNA_PREFERENCE_EVIDENCE_POLICY = Object.freeze({
  version:'backyrd.explicit-preference-evidence@2',
  markers:Object.freeze(['möglichst','moeglichst','bevorzugt','vorzugsweise','am liebsten','wenn möglich','wenn moeglich','falls möglich','falls moeglich','wenn es geht','wenn machbar','optional','idealerweise','wäre schön','waere schoen','kein muss','nicht zwingend','nicht unbedingt','kein ausschlusskriterium','preferably','ideally','if possible','would prefer','nice to have','not essential','not mandatory','de préférence','de preference','si possible','idéalement','idealement','pas indispensable','preferibilmente','se possibile','idealmente','non indispensabile']),
});
export function explicitPreferenceEvidence(sourceText:string):readonly string[] {
  const source=sourceText.normalize('NFKC').toLocaleLowerCase('de-CH');
  return LUNA_PREFERENCE_EVIDENCE_POLICY.markers.filter(marker=>{
    let offset=source.indexOf(marker);
    while(offset>=0){
      const before=source.slice(0,offset).at(-1),after=source.slice(offset+marker.length)[0];
      if((!before||!/[\p{L}\p{N}_]/u.test(before))&&(!after||!/[\p{L}\p{N}_]/u.test(after)))return true;
      offset=source.indexOf(marker,offset+1);
    }
    return false;
  });
}
/** General mood adjectives describe desired fit. Concrete noise, music,
 * access and activity requirements are never included. An emphatic requirement
 * anywhere in the request conservatively disables this default. */
export function implicitAtmospherePreferenceAllowed(sourceText:string, fact:{readonly key:string; readonly value:unknown}):boolean {
  const value=fact.value;
  return fact.key === 'atmosphere.character' && !!value && typeof value === 'object' && 'text' in value
    && typeof value.text === 'string' && ['cozy','relaxed','romantic'].includes(librarianConcept(value.text) ?? '')
    && !/\b(?:unbedingt|zwingend|muss|müssen|nur|ausschliesslich|ausschließlich|must|mandatory|only|absolutely|impérativement|obligatoire|deve|obbligatorio)\b/iu.test(sourceText);
}
/** No general permission to soften the request: the schema retains preference
 * only for atmosphere.character. The provider checks its bounded values and
 * emphatic source requirements independently. */
export function withoutUngroundedPreference(value:unknown):unknown {
  if(Array.isArray(value))return value.flatMap(entry=>{const result=withoutUngroundedPreference(entry);return result && typeof result==='object' && Object.keys(result).length===1 && 'anyOf' in result && Array.isArray(result.anyOf) ? result.anyOf : [result];});
  if(!value||typeof value!=='object')return value;
  const obj=value as Record<string,unknown>;
  const props=obj.properties as Record<string,unknown>|undefined;
  const key=props?.key as {enum?:unknown[]}|undefined;
  const modality=props?.modality as {enum?:unknown[]}|undefined;
  if(key?.enum?.includes('atmosphere.character') && (modality?.enum?.includes('PREFERRED') || (modality as Record<string,unknown>|undefined)?.$ref === '#/$defs/modality')) {
    const others=key.enum.filter(k=>k!=='atmosphere.character');
    const ordinary={...obj,properties:{...props,key:{type:'string',enum:others}}};
    const atmosphere={...obj,properties:{...props,key:{type:'string',enum:['atmosphere.character']},modality:{type:'string',enum:['REQUIRED','PREFERRED','EXCLUDED','NOT_REQUIRED','CONTEXT']}}};
    return {anyOf:[...(others.length?[withoutUngroundedPreference(ordinary)]:[]),atmosphere]};
  }
  return Object.fromEntries(Object.entries(obj).map(([key,entry])=>[key,key==='enum'&&Array.isArray(entry)&&entry.includes('PREFERRED')?entry.filter(item=>item!=='PREFERRED'):withoutUngroundedPreference(entry)]));
}
