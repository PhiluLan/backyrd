"use client";
import { useState } from "react";
import { discoveryPreparationErrorMessage } from "./discovery-errors";
import { DISCOVERY_PROFILE_VERSION, parseDiscoveryProfile, type DiscoveryProfile } from "@backyrd/world-knowledge-core";
export function DiscoveryInput({value,onChange,onPrepare,onSave,disabled,savedSource}:{savedSource?:string;value:unknown;onChange:(value:DiscoveryProfile)=>void;onPrepare?:((sourceText:string)=>Promise<DiscoveryProfile>)|undefined;onSave:(value:DiscoveryProfile)=>Promise<void>;disabled:boolean}){
  let profile:DiscoveryProfile|null=null;try{profile=parseDiscoveryProfile(value,false);}catch{ /* Empty form has no prepared facts. */ }
  const [source,setSource]=useState(profile?.description??savedSource??""),[consent,setConsent]=useState(false),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const editSource=(text:string)=>{setSource(text);setReviewed(false);onChange({contractVersion:DISCOVERY_PROFILE_VERSION,description:text,offerings:[],assertions:[],reviewed:false});};
  const prepare=async()=>{if(!onPrepare||!consent)return;setBusy(true);setError(null);try{const draft=await onPrepare(source);onChange(parseDiscoveryProfile(draft,false));setReviewed(false);}catch(error){setError(discoveryPreparationErrorMessage(error));}finally{setBusy(false);}};
  const save=async()=>{if(!profile||!reviewed)return;setBusy(true);setError(null);try{await onSave(parseDiscoveryProfile({...profile,reviewed:true}));setReviewed(false);}catch{setError("Die Angaben konnten nicht gespeichert werden. Bitte prüfe sie und versuche es erneut.");}finally{setBusy(false);}};
  return <div className="wk-stack">
    <h3>Mit KI aus vorhandenen Texten ausfüllen</h3><span className="wk-helper-optional">Optionale Ausfüllhilfe</span>
    <p>Du hast bereits eine Beschreibung auf deiner Website oder eine Speise- oder Angebotskarte? Kopiere den passenden Text hier hinein. Du musst keinen neuen Beschreibungstext schreiben. Wenn du die Angaben direkt im Formular pflegst, kannst du diese Hilfe überspringen.</p>
    <ol className="wk-helper-steps"><li><strong>Text einfügen.</strong> Den Inhalt kopieren, nicht nur einen Link zur Website.</li><li><strong>Übermittlung freigeben.</strong> Mit deiner Zustimmung erstellt OpenAI Vorschläge aus diesem Text.</li><li><strong>Vorschläge prüfen und speichern.</strong> Unzutreffende Angaben entfernen und die übrigen ausdrücklich bestätigen.</li></ol>
    <label>Öffentlicher Beschreibungstext<textarea className="wk-input wk-textarea" aria-label="Öffentlicher Beschreibungstext" maxLength={12000} placeholder="Hier den Text deiner öffentlichen Website, Speisekarte oder Angebotsbeschreibung einfügen. Zum Beispiel: Mittags bieten wir Bowls und Suppen an. Samstags gibt es Brunch von 10 bis 14 Uhr." value={source} disabled={disabled||busy} onChange={e=>editSource(e.target.value)}/></label>
    <span>{source.length}/12000 Zeichen</span>
    {!profile&&savedSource&&<p>Deine gespeicherte Textquelle wurde geladen. Daraus wurde noch kein geprüftes KI-Wissen übernommen.</p>}
    <label><input type="checkbox" checked={consent} disabled={disabled||busy} onChange={e=>setConsent(e.target.checked)}/>Dieser Text darf öffentlich beim Spot gespeichert und zur Vorbereitung an OpenAI übermittelt werden. Er enthält keine privaten Notizen oder Kundendaten.</label>
    <button type="button" disabled={disabled||busy||!consent||!source.trim()||!onPrepare} onClick={()=>void prepare()}>{busy?"Wird bearbeitet …":"Vorschläge vorbereiten"}</button>
    {!onPrepare&&<p>Die Vorbereitung ist in dieser Umgebung noch nicht eingerichtet.</p>}
    {profile&&profile.assertions.length>0&&<section className="wk-panel"><h3>Vorschläge prüfen</h3><p>Prüfe die Quelltexte. Entferne unzutreffende Angaben. Ohne deine Bestätigung werden die Vorschläge nicht als Wissen verwendet.</p>
      {profile.offerings.map(o=><div key={o.id}><strong>{o.name}</strong><p>{o.description}</p><small>{o.price?`${o.price.min}–${o.price.max} ${o.price.currency} · ${o.price.basis==="PER_PERSON"?"pro Person":"pro Gruppe"}${o.price.mandatoryFeesIncluded===true?" · Pflichtgebühren enthalten":o.price.mandatoryFeesIncluded===false?" · zusätzliche Pflichtkosten erforderlich":" · Pflichtgebühren unbekannt"}`:"Preis unbekannt"}</small></div>)}
      {profile.assertions.map(a=><div key={a.id} className="wk-discovery-assertion"><blockquote>{a.evidence}</blockquote><span>{a.state==="ABSENT"?"Ausdrücklich nicht vorhanden":"Beschriebene Eigenschaft oder Tätigkeit"}{a.conditions?` · Bedingung: ${a.conditions}`:""}</span><p>Bedeutung: {a.concepts.join(", ")}</p><section className="wk-discovery-concepts"><label>Suchbegriffe prüfen (durch Komma getrennt)<input className="wk-input" aria-label={`Suchbegriffe ${a.id}`} value={a.concepts.join(", ")} disabled={disabled||busy} onChange={e=>{setReviewed(false);onChange({...profile!,assertions:profile!.assertions.map(item=>item.id===a.id?{...item,concepts:e.target.value.split(",").map(term=>term.trim())}:item),reviewed:false});}}/></label></section><button type="button" className="wk-secondary" disabled={disabled||busy} onClick={()=>{setReviewed(false);onChange({...profile!,assertions:profile!.assertions.filter(item=>item.id!==a.id),reviewed:false});}}>Unzutreffenden Vorschlag entfernen</button></div>)}
      <label><input type="checkbox" checked={reviewed} disabled={disabled||busy} onChange={e=>setReviewed(e.target.checked)}/>Ich habe die verbleibenden Angaben einschließlich Preise und Bedingungen geprüft und bestätige sie.</label>
      <button type="button" disabled={disabled||busy||!reviewed} onClick={()=>void save()}>Geprüftes Wissen übernehmen</button>
    </section>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
