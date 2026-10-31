/** Explicit product vocabulary for permission to soften a wish. This is not
 * intent extraction: no activity, price, date, scope or requirement is inferred.
 * Without evidence, the provider may not silently relax a concrete user wish.
 * Unknown wording must remain uncertain, never fabricated as optional. */
export const LUNA_PREFERENCE_EVIDENCE_POLICY = Object.freeze({
  version:'backyrd.explicit-preference-evidence@1',
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
/** Structured output enforces the same permission as the runtime validator.
 * Only preference modality/alternative strength is removed, not domain fields. */
export function withoutUngroundedPreference(value:unknown):unknown {
  if(Array.isArray(value))return value.map(withoutUngroundedPreference);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,key==='enum'&&Array.isArray(entry)&&entry.includes('PREFERRED')?entry.filter(item=>item!=='PREFERRED'):withoutUngroundedPreference(entry)]));
}
