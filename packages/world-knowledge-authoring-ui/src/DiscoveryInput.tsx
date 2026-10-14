"use client";
import { useState } from "react";
import { DISCOVERY_PROFILE_VERSION, parseDiscoveryProfile, type DiscoveryProfile } from "@backyrd/world-knowledge-core";
export function DiscoveryInput({value,onChange,onPrepare,onSave,disabled}:{value:unknown;onChange:(value:DiscoveryProfile)=>void;onPrepare?:((sourceText:string)=>Promise<DiscoveryProfile>)|undefined;onSave:(value:DiscoveryProfile)=>Promise<void>;disabled:boolean}){
  let profile:DiscoveryProfile|null=null;try{profile=parseDiscoveryProfile(value,false);}catch{ /* Empty form has no prepared facts. */ }
  const [source,setSource]=useState(profile?.description??""),[consent,setConsent]=useState(false),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const editSource=(text:string)=>{setSource(text);setReviewed(false);onChange({contractVersion:DISCOVERY_PROFILE_VERSION,description:text,offerings:[],assertions:[],reviewed:false});};
  const prepare=async()=>{if(!onPrepare||!consent)return;setBusy(true);setError(null);try{const draft=await onPrepare(source);onChange(parseDiscoveryProfile(draft,false));setReviewed(false);}catch(error){if(error instanceof Error && error.message==="discovery_source_review_required")setError("Der Text benötigt zuerst eine Moderationsprüfung. Er wurde noch nicht zur KI-Vorbereitung übermittelt.");else setError("Der Vorschlag konnte nicht erstellt werden. Dein Text bleibt erhalten. Bitte prüfe die Verbindung und versuche es erneut.");}finally{setBusy(false);}};
  const save=async()=>{if(!profile||!reviewed)return;setBusy(true);setError(null);try{await onSave(parseDiscoveryProfile({...profile,reviewed:true}));setReviewed(false);}catch{setError("Die Angaben konnten nicht gespeichert werden. Bitte prüfe sie und versuche es erneut.");}finally{setBusy(false);}};
  return <div className="wk-stack">
    <p>Beschreibe deinen Ort oder füge einen öffentlichen Website- oder Speisekartentext ein. Daraus entstehen Vorschläge für Erlebnisse und konkrete Angebote.</p>
    <label>Öffentlicher Beschreibungstext<textarea className="wk-input wk-textarea" aria-label="Öffentlicher Beschreibungstext" maxLength={12000} value={source} disabled={disabled||busy} onChange={e=>editSource(e.target.value)}/></label>
    <span>{source.length}/12000 Zeichen</span>
    <label><input type="checkbox" checked={consent} disabled={disabled||busy} onChange={e=>setConsent(e.target.checked)}/>Dieser Text darf öffentlich beim Spot gespeichert und zur Vorbereitung an OpenAI übermittelt werden. Er enthält keine privaten Notizen oder Kundendaten.</label>
    <button type="button" disabled={disabled||busy||!consent||!source.trim()||!onPrepare} onClick={()=>void prepare()}>{busy?"Wird bearbeitet …":"Vorschläge vorbereiten"}</button>
    {!onPrepare&&<p>Die Vorbereitung ist in dieser Umgebung noch nicht eingerichtet.</p>}
    {profile&&profile.assertions.length>0&&<section className="wk-panel"><h3>Vorschläge prüfen</h3><p>Prüfe die Quelltexte. Entferne unzutreffende Angaben. Ohne deine Bestätigung werden die Vorschläge nicht als Wissen verwendet.</p>
      {profile.offerings.map(o=><div key={o.id}><strong>{o.name}</strong><p>{o.description}</p><small>{o.price?`${o.price.min}–${o.price.max} ${o.price.currency} · ${o.price.basis==="PER_PERSON"?"pro Person":"pro Gruppe"}${o.price.mandatoryFeesIncluded===true?" · Pflichtgebühren enthalten":o.price.mandatoryFeesIncluded===false?" · zusätzliche Pflichtkosten erforderlich":" · Pflichtgebühren unbekannt"}`:"Preis unbekannt"}</small></div>)}
      {profile.assertions.map(a=><div key={a.id} className="wk-discovery-assertion"><blockquote>{a.evidence}</blockquote><span>{a.state==="ABSENT"?"Ausdrücklich nicht vorhanden":"Beschriebene Eigenschaft oder Tätigkeit"}{a.conditions?` · Bedingung: ${a.conditions}`:""}</span><p>Bedeutung: {a.concepts.join(", ")}</p><details><summary>Bedeutung korrigieren</summary><label>Suchbegriffe, durch Komma getrennt<input className="wk-input" aria-label={`Suchbegriffe ${a.id}`} value={a.concepts.join(", ")} disabled={disabled||busy} onChange={e=>{setReviewed(false);onChange({...profile!,assertions:profile!.assertions.map(item=>item.id===a.id?{...item,concepts:e.target.value.split(",").map(term=>term.trim())}:item),reviewed:false});}}/></label></details><button type="button" className="wk-secondary" disabled={disabled||busy} onClick={()=>{setReviewed(false);onChange({...profile!,assertions:profile!.assertions.filter(item=>item.id!==a.id),reviewed:false});}}>Unzutreffenden Vorschlag entfernen</button></div>)}
      <label><input type="checkbox" checked={reviewed} disabled={disabled||busy} onChange={e=>setReviewed(e.target.checked)}/>Ich habe die verbleibenden Angaben einschließlich Preise und Bedingungen geprüft und bestätige sie.</label>
      <button type="button" disabled={disabled||busy||!reviewed} onClick={()=>void save()}>Geprüftes Wissen übernehmen</button>
    </section>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
