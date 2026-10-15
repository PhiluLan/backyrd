"use client";
import { useRef, useState } from "react";
import { ExperienceReferences } from "./ExperienceReferences";
import { getExperienceAuthoringQuestions, type ExperienceWorkspace } from "./experience-authoring";
import { Conditions, Properties } from "./ExperienceProperties";
import { experiencePriceIncludes } from "./experience-answer-guidance";
import { SPOT_TYPE_CATALOG, SPOT_GROUPS, OFFER_CATALOG, AREA_CATALOG, EXPERIENCE_QUESTIONS, experienceCategoryFromAnswers, EXPERIENCE_TEMPLATES, emptyExperienceProfile, emptyExperienceConditions, experienceReuseSuggestions, reuseExperienceProperty, parseExperienceProfile, type ExperienceCategory, type ExperienceProfile, type ExperienceProperty, type ExperienceScope, type ExperienceOffer, type ExperiencePrice } from "@backyrd/world-knowledge-core";
const weekdays=["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const nullableNumber=(v:string)=>v===""?null:Number(v);
const displayValue=(v:unknown)=>v===true?"Ja":v===false?"Nein":String(v);
function Prices({category,offerKind,values,onChange}:{category:ExperienceCategory;offerKind:string;values:readonly ExperiencePrice[];onChange:(value:readonly ExperiencePrice[])=>void}){
  const update=(i:number,patch:Partial<ExperiencePrice>)=>onChange(values.map((v,j)=>i===j?{...v,...patch}:v));
  const purposes=experiencePriceIncludes(category,offerKind);
  return <section className="wk-stack"><h3>Preise ({values.length})</h3><p>Ein „ab“-Preis hat keine bestätigte Obergrenze. Altersgrenzen hier gelten nur für den Preis. Sie sind keine Zutrittsregeln.</p>{values.map((p,i)=><section key={i} className="wk-experience-card">
    <label>Preisbezeichnung<input className="wk-input" maxLength={160} placeholder={category==="SPORT"?"Zum Beispiel Einzeleintritt Erwachsene":category==="ZOO"||category==="MUSEUM"?"Zum Beispiel Eintritt Erwachsene":"Zum Beispiel Apéro pro Person"} value={p.label} onChange={e=>update(i,{label:e.target.value})}/></label>
    <div className="wk-grid"><label>Von<input aria-label={`Preis ${i+1} Von`} className="wk-input" type="number" min={0} max={100000} step="0.01" value={Number.isFinite(p.min)?p.min:""} onChange={e=>update(i,{min:e.target.value===""?Number.NaN:Number(e.target.value)})}/></label><label>Bis (leer = ab-Preis)<input aria-label={`Preis ${i+1} Bis`} className="wk-input" type="number" min={0} max={100000} step="0.01" value={p.max??""} onChange={e=>update(i,{max:nullableNumber(e.target.value)})}/></label>
    <label>Währung<select className="wk-input" value={p.currency} onChange={e=>update(i,{currency:e.target.value})}>{["CHF","EUR","USD","GBP"].map(c=><option key={c}>{c}</option>)}</select></label><label>Berechnung<select className="wk-input" value={p.basis} onChange={e=>update(i,{basis:e.target.value as ExperiencePrice["basis"]})}><option value="PER_PERSON">Pro Person</option><option value="PER_GROUP">Gesamte Gruppe</option><option value="PER_ITEM">Pro Artikel</option><option value="PER_ROOM_NIGHT">Pro Zimmer und Nacht</option><option value="PER_PERSON_NIGHT">Pro Person und Nacht</option><option value="PER_SITE_NIGHT">Pro Stellplatz und Nacht</option></select></label>
    <label>Ab Alter<input className="wk-input" type="number" min={0} max={130} value={p.minimumAge??""} onChange={e=>update(i,{minimumAge:nullableNumber(e.target.value)})}/></label><label>Bis Alter<input className="wk-input" type="number" min={0} max={130} value={p.maximumAge??""} onChange={e=>update(i,{maximumAge:nullableNumber(e.target.value)})}/></label></div>
    <label>Alle Pflichtkosten im Höchstbetrag enthalten?<select className="wk-input" value={p.mandatoryFeesIncluded===null?"unknown":String(p.mandatoryFeesIncluded)} onChange={e=>update(i,{mandatoryFeesIncluded:e.target.value==="unknown"?null:e.target.value==="true"})}><option value="unknown">Noch unbekannt</option><option value="true">Ja</option><option value="false">Nein, zusätzliche Pflichtkosten</option></select></label>
    <label>Preis gilt für<select className="wk-input" value={p.includes} onChange={e=>update(i,{includes:e.target.value})}><option value="">Noch nicht zugeordnet</option>{purposes.map(v=><option key={v}>{v}</option>)}{p.includes&&!((purposes as readonly string[]).includes(p.includes))&&<option value={p.includes}>{p.includes} (bisherige Angabe)</option>}</select></label><p>Wähle den Zweck dieses Preises, für ein Paket zum Beispiel Apéro. In der Preisbezeichnung kannst du das Paket benennen. Ein Gesamtpreis bleibt ein Gesamtpreis.</p><Conditions value={p.conditions} onChange={conditions=>update(i,{conditions})}/><button type="button" className="wk-secondary" onClick={()=>onChange(values.filter((_,j)=>j!==i))}>Preis entfernen</button>
  </section>)}<button type="button" className="wk-secondary" disabled={values.length>=30} onClick={()=>onChange([...values,{label:"",currency:"CHF",min:Number.NaN,max:null,basis:"PER_PERSON",minimumAge:null,maximumAge:null,mandatoryFeesIncluded:null,includes:"",conditions:emptyExperienceConditions()}])}>+ Preis hinzufügen</button></section>;
}

type Editor = {scope:"OFFER"|"AREA";id:string;part:number};
type Props = {
 existingAnswers?:Readonly<Record<string,unknown>>;
 value:unknown;
 onChange:(value:ExperienceProfile)=>void;
 onSave:(value:ExperienceProfile)=>Promise<void>;
 disabled?:boolean;
 onDirtyChange?:(dirty:boolean)=>void;
 onContinue?:()=>void;
 initialWorkspace?:ExperienceWorkspace;
};
export function ExperienceInput({value,onChange,onSave,disabled,existingAnswers={},onDirtyChange,onContinue,initialWorkspace="OFFERS"}:Props){
 const [initial]=useState(()=>{try{return {profile:parseExperienceProfile(value,false),invalid:false};}catch{return {profile:emptyExperienceProfile(experienceCategoryFromAnswers(existingAnswers)??"OTHER"),invalid:value!=null&&value!==""};}});
 const [baseline,setBaseline]=useState(initial.profile),[profile,setProfile]=useState(initial.profile);
 const [workspace,setWorkspace]=useState<ExperienceWorkspace>(initialWorkspace);
 const [editor,setEditor]=useState<Editor|null>(null),[group,setGroup]=useState(0);
 const [adding,setAdding]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false),[dirty,setDirty]=useState(false);
 const [reuseTarget,setReuseTarget]=useState("");
 const top=useRef<HTMLDivElement>(null);
 const focus=()=>requestAnimationFrame(()=>{top.current?.scrollIntoView({block:"start",behavior:"instant"});top.current?.focus({preventScroll:true});});
 const change=(next:ExperienceProfile)=>{setProfile({...next,reviewed:false});onChange({...next,reviewed:false});setConfirmed(false);setSaved(false);setError(null);setDirty(true);onDirtyChange?.(true);};
 const navigate=(next:ExperienceWorkspace)=>{setWorkspace(next);setEditor(null);setAdding(false);setGroup(0);focus();};
 const templates=EXPERIENCE_TEMPLATES[experienceCategoryFromAnswers(existingAnswers)??profile.category];
 const updateOffer=(id:string,patch:Partial<ExperienceOffer>)=>change({...profile,offers:profile.offers.map(offer=>offer.id===id?{...offer,...patch}:offer)});
 const groupsFor=(scope:ExperienceScope,kind?:string,values:readonly ExperienceProperty[]=[])=>{
  const questions=getExperienceAuthoringQuestions(profile.category,scope,scope==="OFFER"?kind:undefined,scope==="AREA"?kind:undefined,existingAnswers);
  return [...questions.map(question=>question.label),...(values.some(value=>!questions.some(question=>question.key===value.key))?["Bisherige Angaben"]:[])];
 };
 const addArea=(kind:string,name:string,offerId?:string)=>{const id=crypto.randomUUID();change({...profile,areas:[...profile.areas,{id,kind,name,properties:[]}],offers:profile.offers.map(offer=>offer.id===offerId?{...offer,areaIds:[...offer.areaIds,id]}:offer)});setAdding(false);if(!offerId){setEditor({scope:"AREA",id,part:0});focus();}};
 const addOffer=(kind:string,name:string)=>{const id=crypto.randomUUID();change({...profile,offers:[...profile.offers,{id,kind,name,areaIds:[],properties:[],prices:[],schedule:[],validFrom:null,validUntil:null}]});setAdding(false);setEditor({scope:"OFFER",id,part:0});focus();};
 const edit=(scope:"OFFER"|"AREA",id:string)=>{setEditor({scope,id,part:0});setAdding(false);focus();};
 const save=async()=>{
  if(!confirmed||!dirty)return;
  let checked:ExperienceProfile;
  try{if(initial.invalid)throw Error("invalid_existing_profile");checked=parseExperienceProfile({...profile,reviewed:true});}
  catch{setError("Bitte prüfe Namen, Werte, Preisgrenzen und Verknüpfungen. Deine Eingaben bleiben erhalten.");return;}
  setBusy(true);setError(null);
  try{await onSave(checked);setProfile(checked);setBaseline(checked);setConfirmed(false);setDirty(false);onDirtyChange?.(false);setSaved(true);}
  catch{setError("Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten; bitte versuche es erneut.");}
  finally{setBusy(false);}
 };
 // A main entrance or a global facility does not prove access to an individual
 // room. Keep those source claims as references, never as copy suggestions.
 const suggestions=experienceReuseSuggestions(existingAnswers,new Date().toISOString()).filter(suggestion=>suggestion.sourceKey.startsWith("offering."));
 const targets=profile.offers.map(offer=>({value:`OFFER:${offer.id}`,label:`Angebot: ${offer.name}`}));
 const selectedOffer=editor?.scope==="OFFER"?profile.offers.find(offer=>offer.id===editor.id):undefined;
 const selectedArea=editor?.scope==="AREA"?profile.areas.find(area=>area.id===editor.id):undefined;
 const topics=editor?groupsFor(editor.scope,selectedOffer?.kind??selectedArea?.kind,selectedOffer?.properties??selectedArea?.properties):[];
 const parts=["Grundangaben",...topics,...(selectedOffer?["Preise","Angebotszeiten"]:[])];
 const part=parts[Math.min(editor?.part??0,parts.length-1)]??"Grundangaben";
 const sharedGroups=groupsFor("SPOT",undefined,profile.properties);
 const headings={OFFERS:"Was können Gäste hier machen?",AREAS:"Räume & Bereiche",SPOT:"Gemeinsame Ausstattung & Anreise"};
 return <div ref={top} tabIndex={-1} className="wk-guided-authoring" data-workspace={workspace}>
  {initial.invalid&&<p role="alert">Das gespeicherte Angebotsprofil konnte nicht sicher geladen werden. Es wird nicht durch ein leeres Profil ersetzt.</p>}
  <fieldset disabled={disabled||busy||initial.invalid} className="wk-experience-editor"><legend>Angebote und Bereiche pflegen</legend>
   <div className="wk-profile-savebar">
    <p className="wk-draft-state" role="status">{dirty?"Ungespeicherte Änderungen":saved?"Angebote und Bereiche gespeichert.":"Gespeicherter Stand"}</p>
    {dirty&&<label className="wk-save-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Ich habe die Änderungen geprüft.</label>}
    <button type="button" disabled={!confirmed||!dirty} onClick={()=>void save()}>{busy?"Wird gespeichert …":"Änderungen speichern"}</button>
    {dirty&&<small>Speichert alle bearbeiteten Angebote, Räume und gemeinsamen Angaben.</small>}
   </div>
   {editor&&(selectedOffer||selectedArea)?<section className="wk-experience-card wk-guided-page">
    <button type="button" className="wk-secondary" onClick={()=>{setEditor(null);focus();}}>← Zur Übersicht</button>
    <h3 aria-label={`${selectedOffer?"Angebot":"Bereich"} ${selectedOffer?.name??selectedArea?.name} bearbeiten`}>{selectedOffer?.name??selectedArea?.name}</h3>
    <p className="wk-editor-context">{selectedOffer?"Angebot":"Raum / Bereich"} bearbeiten · {editor.part+1} von {parts.length}</p>
    <nav className="wk-topic-nav" aria-label={selectedOffer?"Abschnitt des Angebots":"Abschnitt des Bereichs"}>{parts.map((name,index)=><button type="button" key={name} aria-current={editor.part===index?"step":undefined} onClick={()=>{setEditor({...editor,part:index});focus();}}>{name}</button>)}</nav>
    {part==="Grundangaben"&&selectedOffer&&<>
     <label>Name des Angebots<input aria-label="Name des Angebots" className="wk-input" maxLength={160} value={selectedOffer.name} onChange={e=>updateOffer(selectedOffer.id,{name:e.target.value})}/></label>
     <fieldset><legend>In diesen Bereichen verfügbar</legend>{profile.areas.map(a=><label key={a.id}><input type="checkbox" checked={selectedOffer.areaIds.includes(a.id)} onChange={e=>updateOffer(selectedOffer.id,{areaIds:e.target.checked?[...selectedOffer.areaIds,a.id]:selectedOffer.areaIds.filter(id=>id!==a.id)})}/>{a.name}</label>)}{!profile.areas.length&&<p>Noch kein Raum zugeordnet. Lege ihn direkt hier an oder später unter „Räume & Bereiche“.</p>}</fieldset>
     <h4>Bereich direkt anlegen und zuordnen</h4><div className="wk-choices">{[...templates.areas,{kind:"OTHER",label:"Eigener Bereich"}].map(t=><button type="button" className="wk-secondary" key={t.kind} disabled={profile.areas.length>=30} onClick={()=>addArea(t.kind,t.label,selectedOffer.id)}>Bereich anlegen: {t.label}</button>)}</div>
     <label>Anderen Bereich anlegen und zuordnen<select aria-label="Anderen Bereich anlegen und zuordnen" className="wk-input" value="" onChange={e=>{const item=AREA_CATALOG.find(a=>a.kind===e.target.value);if(item)addArea(item.kind,item.label,selectedOffer.id);}}><option value="">Bereich auswählen</option>{AREA_CATALOG.map(a=><option key={a.kind} value={a.kind}>{a.label}</option>)}</select></label>
     <ExperienceReferences profile={profile} areaIds={selectedOffer.areaIds} existingAnswers={existingAnswers}/>
     <button type="button" className="wk-secondary" onClick={()=>{change({...profile,offers:profile.offers.filter(o=>o.id!==selectedOffer.id)});setEditor(null);}}>Angebot entfernen</button>
    </>}
    {part==="Grundangaben"&&selectedArea&&<>
     <label>Name des Bereichs<input aria-label="Name des Bereichs" className="wk-input" maxLength={160} value={selectedArea.name} onChange={e=>change({...profile,areas:profile.areas.map(a=>a.id===selectedArea.id?{...a,name:e.target.value}:a)})}/></label>
     <ExperienceReferences profile={profile} areaIds={[]} existingAnswers={existingAnswers}/>
     <p>Verknüpfte Angebote: {profile.offers.filter(o=>o.areaIds.includes(selectedArea.id)).map(o=>o.name).join(", ")||"Noch keine"}</p>
     <button type="button" className="wk-secondary" disabled={profile.offers.some(o=>o.areaIds.includes(selectedArea.id))} onClick={()=>{change({...profile,areas:profile.areas.filter(a=>a.id!==selectedArea.id)});setEditor(null);}}>Bereich entfernen</button>{profile.offers.some(o=>o.areaIds.includes(selectedArea.id))&&<p>Entferne zuerst die Angebotsverknüpfungen.</p>}
    </>}
    {topics.includes(part)&&selectedOffer&&<Properties existingAnswers={existingAnswers} category={profile.category} scope="OFFER" offerKind={selectedOffer.kind} group={part} values={selectedOffer.properties} onChange={properties=>updateOffer(selectedOffer.id,{properties})}/>}
    {topics.includes(part)&&selectedArea&&<Properties existingAnswers={existingAnswers} category={profile.category} scope="AREA" areaKind={selectedArea.kind} group={part} values={selectedArea.properties} onChange={properties=>change({...profile,areas:profile.areas.map(a=>a.id===selectedArea.id?{...a,properties}:a)})}/>}
    {part==="Preise"&&selectedOffer&&<Prices category={profile.category} offerKind={selectedOffer.kind} values={selectedOffer.prices} onChange={prices=>updateOffer(selectedOffer.id,{prices})}/>}
    {part==="Angebotszeiten"&&selectedOffer&&<section className="wk-stack"><h4>Zeiten dieses Angebots</h4><p>Keine Einträge bedeutet: noch unbekannt. Die Zeiten ersetzen keine Öffnungszeiten und bestätigen keine freien Plätze.</p>{selectedOffer.schedule.map((s,i)=><div className="wk-grid" key={i}><label>Wochentag<select className="wk-input" value={s.weekday} onChange={e=>updateOffer(selectedOffer.id,{schedule:selectedOffer.schedule.map((v,j)=>i===j?{...v,weekday:Number(e.target.value)}:v)})}>{weekdays.map((d,j)=><option key={d} value={j+1}>{d}</option>)}</select></label><label>Beginn<input aria-label={`Angebotszeit ${i+1} Beginn`} className="wk-input" type="time" value={s.start} onChange={e=>updateOffer(selectedOffer.id,{schedule:selectedOffer.schedule.map((v,j)=>i===j?{...v,start:e.target.value}:v)})}/></label><label>Ende<input aria-label={`Angebotszeit ${i+1} Ende`} className="wk-input" type="time" value={s.end} onChange={e=>updateOffer(selectedOffer.id,{schedule:selectedOffer.schedule.map((v,j)=>i===j?{...v,end:e.target.value}:v)})}/></label><button type="button" className="wk-secondary" onClick={()=>updateOffer(selectedOffer.id,{schedule:selectedOffer.schedule.filter((_,j)=>j!==i)})}>Zeit entfernen</button></div>)}<button type="button" disabled={selectedOffer.schedule.length>=56} onClick={()=>updateOffer(selectedOffer.id,{schedule:[...selectedOffer.schedule,{weekday:1,start:"",end:""}]})}>+ Angebotszeit</button><label>Verfügbar ab<input className="wk-input" type="date" value={selectedOffer.validFrom??""} onChange={e=>updateOffer(selectedOffer.id,{validFrom:e.target.value||null})}/></label><label>Verfügbar bis einschließlich<input className="wk-input" type="date" value={selectedOffer.validUntil??""} onChange={e=>updateOffer(selectedOffer.id,{validUntil:e.target.value||null})}/></label></section>}

    <footer className="wk-guided-footer"><button type="button" className="wk-secondary" onClick={()=>{if(editor.part===0)setEditor(null);else setEditor({...editor,part:editor.part-1});focus();}}>Zurück</button><button type="button" onClick={()=>{if(editor.part===parts.length-1)setEditor(null);else setEditor({...editor,part:editor.part+1});focus();}}>{editor.part===parts.length-1?"Zur Übersicht":"Weiter"}</button></footer>
   </section>:<>
    <h3 className="wk-workspace-heading">{headings[workspace]}</h3>
    {workspace==="OFFERS"&&<p className="wk-spot-type-context">Spottyp: <strong>{(()=>{const raw=existingAnswers["classification.place_types"];return raw&&typeof raw==="object"&&"knowledgeState" in raw&&raw.knowledgeState==="KNOWN_VALUE"&&"value" in raw&&Array.isArray(raw.value)?raw.value.map(kind=>SPOT_TYPE_CATALOG.find(type=>type.kind===kind)?.label??String(kind)).join(", "):"Noch nicht festgelegt";})()}</strong></p>}
    <p>{workspace==="OFFERS"?"Eine Karte pro Leistung: zum Beispiel Übernachten, Abendessen oder Apéro. Preise und Bedingungen gehören zur jeweiligen Leistung.":workspace==="AREAS"?"Ein Raum oder Aussenbereich wird einmal beschrieben. Seine Angaben stehen bei allen zugeordneten Angeboten als Referenz bereit.":"Nur Angaben, die du einmal für den gesamten Spot erfasst. Zugang und Atmosphäre einzelner Räume pflegst du bei den Räumen."}</p>
    {workspace==="OFFERS"&&<>
     {!profile.offers.length&&<div className="wk-authoring-empty"><strong>Noch kein Angebot erfasst</strong><p>Beginne mit einer tatsächlich vorhandenen Leistung. Weitere kannst du jederzeit ergänzen.</p></div>}
     {profile.offers.map(offer=><article className="wk-experience-card wk-overview-card" key={offer.id}><strong>{offer.name}</strong><p>Leistung, Preise, Zeiten und Bedingungen</p><small>{offer.areaIds.length} zugeordnete Bereiche · {offer.prices.length} Preise</small><button type="button" aria-label={`Angebot ${offer.name} bearbeiten`} onClick={()=>edit("OFFER",offer.id)}>{offer.name} bearbeiten</button></article>)}
     {!adding&&<button type="button" className="wk-add-offer" disabled={profile.offers.length>=30} onClick={()=>setAdding(true)}>Weiteres Angebot hinzufügen</button>}
     {adding&&<section className="wk-add-panel" aria-label="Angebot hinzufügen"><h4>Welche Leistung möchtest du hinzufügen?</h4><div className="wk-choices">{[...templates.offers,{kind:"OTHER",label:"Eigenes Angebot"}].map(template=><button type="button" className="wk-secondary" key={template.kind} disabled={profile.offers.length>=30} onClick={()=>addOffer(template.kind,template.label)}>+ {template.label}</button>)}</div>
      <label>Weiteres Angebot hinzufügen<select className="wk-input" aria-label="Weiteres Angebot hinzufügen" value="" onChange={event=>{const item=OFFER_CATALOG.find(offer=>offer.kind===event.target.value);if(item)addOffer(item.kind,item.label);}} disabled={profile.offers.length>=30}><option value="">Im gesamten Angebotskatalog auswählen</option>{SPOT_GROUPS.map(group=><optgroup key={group.id} label={group.label}>{OFFER_CATALOG.filter(offer=>offer.group===group.id).map(offer=><option key={offer.kind} value={offer.kind}>{offer.label}</option>)}</optgroup>)}</select></label><button type="button" className="wk-secondary" onClick={()=>setAdding(false)}>Abbrechen</button>
     </section>}
    </>}
    {workspace==="AREAS"&&<>
     {!profile.areas.length&&<div className="wk-authoring-empty"><strong>Noch kein Raum oder Bereich erfasst</strong><p>Zum Beispiel Terrasse, Innenraum oder Gästezimmer. Lege nur tatsächlich vorhandene Bereiche an.</p></div>}
     {profile.areas.map(area=><article className="wk-experience-card wk-overview-card" key={area.id}><strong>{area.name}</strong><p>Zugang, Atmosphäre und Ausstattung dieses Bereichs</p><small>{profile.offers.filter(offer=>offer.areaIds.includes(area.id)).length} verknüpfte Angebote</small><button type="button" aria-label={`Bereich ${area.name} bearbeiten`} onClick={()=>edit("AREA",area.id)}>{area.name} bearbeiten</button></article>)}
     {!adding&&<button type="button" disabled={profile.areas.length>=30} onClick={()=>setAdding(true)}>Raum oder Bereich hinzufügen</button>}
     {adding&&<section className="wk-add-panel" aria-label="Bereich hinzufügen"><h4>Welchen Raum oder Bereich möchtest du hinzufügen?</h4><div className="wk-choices">{[...templates.areas,{kind:"OTHER",label:"Eigener Bereich"}].map(template=><button type="button" className="wk-secondary" key={template.kind} disabled={profile.areas.length>=30} onClick={()=>addArea(template.kind,template.label)}>+ {template.label}</button>)}</div>
      <label>Weiteren Bereich hinzufügen<select className="wk-input" aria-label="Weiteren Bereich hinzufügen" value="" onChange={event=>{const item=AREA_CATALOG.find(area=>area.kind===event.target.value);if(item)addArea(item.kind,item.label);}} disabled={profile.areas.length>=30}><option value="">Im gesamten Bereichskatalog auswählen</option>{SPOT_GROUPS.map(group=><optgroup key={group.id} label={group.label}>{AREA_CATALOG.filter(area=>area.group===group.id).map(area=><option key={area.kind} value={area.kind}>{area.label}</option>)}</optgroup>)}</select></label><button type="button" className="wk-secondary" onClick={()=>setAdding(false)}>Abbrechen</button>
     </section>}
    </>}
    {workspace==="SPOT"&&<><ExperienceReferences profile={profile} areaIds={[]} existingAnswers={existingAnswers}/>
     {sharedGroups.length>0?<><nav className="wk-topic-nav" aria-label="Thema der gemeinsamen Angaben">{sharedGroups.map((name,index)=><button type="button" key={name} aria-current={group===index?"step":undefined} onClick={()=>{setGroup(index);focus();}}>{name}</button>)}</nav><Properties existingAnswers={existingAnswers} category={profile.category} scope="SPOT" group={sharedGroups[Math.min(group,sharedGroups.length-1)]??""} values={profile.properties} onChange={properties=>change({...profile,properties})}/></>:<p>Die gemeinsamen Angaben sind bereits im Spotprofil erfasst.</p>}
    </>}
    <aside className="wk-workspace-links" aria-label="Weitere Pflegebereiche"><strong>Andere Angaben bearbeiten</strong>
     {workspace!=="OFFERS"&&<button type="button" className="wk-secondary" onClick={()=>navigate("OFFERS")}>Angebote öffnen</button>}
     {workspace!=="AREAS"&&<button type="button" className="wk-secondary" onClick={()=>navigate("AREAS")}>Räume & Bereiche öffnen</button>}
     {workspace!=="SPOT"&&<button type="button" className="wk-secondary" onClick={()=>navigate("SPOT")}>Gemeinsame Ausstattung öffnen</button>}
    </aside>
    {suggestions.length>0&&<details className="wk-reuse-details"><summary>Bestehende Küchenangaben gezielt übernehmen</summary><p>Nur übernehmen, wenn die Angabe tatsächlich für dieses Angebot gilt. Die ursprüngliche Angabe bleibt unverändert.</p>
     <label>Zuordnen zu<select aria-label="Zuordnen zu" className="wk-input" value={reuseTarget} onChange={event=>setReuseTarget(event.target.value)}><option value="">Bitte auswählen</option>{targets.map(target=><option key={target.value} value={target.value}>{target.label}</option>)}</select></label>
     {suggestions.map(suggestion=>{const [scope,id]=reuseTarget.split(":");const allowed=getExperienceAuthoringQuestions(profile.category,scope as ExperienceScope,profile.offers.find(offer=>offer.id===id)?.kind).some(question=>question.key===suggestion.property.key);return <div className="wk-reuse-row" key={suggestion.id}><span>{EXPERIENCE_QUESTIONS.find(question=>question.key===suggestion.property.key)?.label??"Vorhandene Angabe"}: {displayValue(suggestion.property.value)}</span><button type="button" disabled={!reuseTarget||!allowed} onClick={()=>{try{change(reuseExperienceProperty(profile,suggestion,{scope:scope as ExperienceScope,id:id||null}));}catch{setError("Diese Angabe passt nicht zur ausgewählten Zuordnung.");}}}>In Entwurf übernehmen</button></div>;})}
    </details>}
    {onContinue&&<button type="button" className="wk-secondary" disabled={dirty} onClick={onContinue}>Zum nächsten Bereich</button>}
   </>}
   {dirty&&<button type="button" className="wk-secondary" onClick={()=>{setProfile(baseline);onChange(baseline);setDirty(false);onDirtyChange?.(false);setEditor(null);setConfirmed(false);setSaved(false);setError(null);}}>Ungespeicherten Entwurf verwerfen</button>}
   {error&&<p role="alert">{error}</p>}{saved&&<p role="status">Angebote und Bereiche gespeichert.</p>}
  </fieldset>
 </div>;
}
