"use client";
import { getExperienceAuthoringQuestions } from "./experience-authoring";
import { experienceAnswerGuidance } from "./experience-answer-guidance";
import { emptyExperienceConditions, EXPERIENCE_QUESTIONS, sameLibrarianText, type ExperienceCategory, type ExperienceConditions, type ExperienceProperty, type ExperienceQuestion, type ExperienceScope } from "@backyrd/world-knowledge-core/browser";
const weekdays=["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const dayparts=[["MORNING","Vormittag"],["MIDDAY","Mittag"],["AFTERNOON","Nachmittag"],["EVENING","Abend"],["NIGHT","Nacht"]];
export function Conditions({value,onChange,inline=false}:{value:ExperienceConditions;onChange:(value:ExperienceConditions)=>void;inline?:boolean}){
  const Wrapper=inline?"section":"details";
  return <Wrapper className="wk-experience-conditions">{!inline&&<summary>Zeiten oder Ausnahmen (optional)</summary>}<p>Keine Auswahl bedeutet: keine zeitliche Einschränkung dieser Angabe. Unbekannte Verfügbarkeit wird daraus nicht bestätigt.</p>
    <fieldset className="wk-condition-options"><legend>Gilt an diesen Wochentagen</legend>{weekdays.map((label,i)=><label key={label}><input type="checkbox" checked={value.weekdays.includes(i+1)} onChange={e=>onChange({...value,weekdays:e.target.checked?[...value.weekdays,i+1]:value.weekdays.filter(d=>d!==i+1)})}/>{label}</label>)}</fieldset>
    <fieldset className="wk-condition-options"><legend>Gilt zu diesen Tageszeiten</legend>{dayparts.map(([key,label])=><label key={key}><input type="checkbox" checked={value.dayparts.includes(key!)} onChange={e=>onChange({...value,dayparts:e.target.checked?[...value.dayparts,key!]:value.dayparts.filter(d=>d!==key)})}/>{label}</label>)}</fieldset>
    <label>Nur bei dieser Veranstaltung<input placeholder="Name der Veranstaltung" className="wk-input" maxLength={160} value={value.event??""} onChange={e=>onChange({...value,event:e.target.value||null})}/></label>
    <label>Gültig ab<input className="wk-input" type="date" value={value.validFrom??""} onChange={e=>onChange({...value,validFrom:e.target.value||null})}/></label>
    <label>Gültig bis einschließlich<input className="wk-input" type="date" value={value.validUntil??""} onChange={e=>onChange({...value,validUntil:e.target.value||null})}/></label>
  </Wrapper>;
}

function KnowledgeButtons({label,state,onChange}:{label:string;state:ExperienceProperty["state"]|undefined;onChange:(state:"UNKNOWN"|"NOT_APPLICABLE")=>void}){
 return <div className="wk-knowledge-buttons" role="group" aria-label={`${label} Wissensstand`}>{(["UNKNOWN","NOT_APPLICABLE"] as const).map(value=><button type="button" className={state===value?"selected":"wk-secondary"} aria-pressed={state===value} key={value} onClick={()=>onChange(value)}>{value==="UNKNOWN"?"Noch unbekannt":"Nicht relevant"}</button>)}</div>;
}
const unconditional=(p:ExperienceProperty)=>!p.conditions.weekdays.length&&!p.conditions.dayparts.length&&!p.conditions.event&&!p.conditions.validFrom&&!p.conditions.validUntil;
export function Properties({category,scope,offerKind,areaKind,group,values,onChange,existingAnswers={}}:{existingAnswers?:Readonly<Record<string,unknown>>;category:ExperienceCategory;scope:ExperienceScope;offerKind?:string;areaKind?:string;group:string;values:readonly ExperienceProperty[];onChange:(value:readonly ExperienceProperty[])=>void}){
 const questions=getExperienceAuthoringQuestions(category,scope,offerKind,areaKind,existingAnswers);
 const update=(index:number,patch:Partial<ExperienceProperty>,key:string)=>onChange(index<0?[...values,{key,label:null,state:"UNKNOWN",value:null,conditions:emptyExperienceConditions(),...patch}]:values.map((v,i)=>i===index?{...v,...patch}:v));
 const row=(p:ExperienceProperty,index:number,q?:ExperienceQuestion)=>{
  const spec=q?experienceAnswerGuidance(p.key,category,offerKind,areaKind,existingAnswers):null;
  // A blank answer and its first draft must keep the same identity. Global
  // array positions change when another question gains or loses an answer.
  const occurrence=values.slice(0,Math.max(index,0)).filter(value=>value.key===p.key).length;
  return <section className="wk-experience-property" key={`${p.key}:${occurrence}`} aria-label={q?.label??p.label??"Bisherige Angabe"}>
   <h4>{q?.label??p.label??"Bisherige Angabe"}</h4>
   {spec&&<p>{spec.help}</p>}
   {q?.control==="YES_NO"&&<div className="wk-choices" aria-label={`${q.label} Antworten`}>{[true,false].map(v=><button type="button" key={String(v)} aria-pressed={p.state==="KNOWN"&&p.value===v} className={p.state==="KNOWN"&&p.value===v?"selected":"wk-secondary"} onClick={()=>update(index,{state:"KNOWN",value:v},p.key)}>{v?"Ja":"Nein"}</button>)}</div>}
   {q?.control==="NUMBER"&&<label>{q.unit}<input aria-label={`${q.label} Wert`} className="wk-input" type="number" min={0} max={q.unit==="Jahre"?130:100000} placeholder={q.unit==="Minuten"?"Zum Beispiel 60":q.unit==="Jahre"?"Zum Beispiel 6":"Zum Beispiel 20"} value={typeof p.value==="number"?p.value:""} onChange={e=>update(index,{state:e.target.value?"KNOWN":"UNKNOWN",value:e.target.value===""?null:Number(e.target.value)},p.key)}/></label>}
   {spec?.kind==="NAME"&&<input aria-label={`${q?.label} Wert`} className="wk-input" maxLength={1000} placeholder={spec.placeholder} value={typeof p.value==="string"?p.value:""} onChange={e=>update(index,{state:e.target.value?"KNOWN":"UNKNOWN",value:e.target.value||null},p.key)}/>}
   {typeof p.value==="string"&&<blockquote>{p.value}</blockquote>}
   <KnowledgeButtons label={q?.label??p.label??"Bisherige Angabe"} state={index>=0?p.state:undefined} onChange={state=>update(index,{state,value:null},p.key)}/>
   {index>=0&&<><Conditions value={p.conditions} onChange={conditions=>update(index,{conditions},p.key)}/><button type="button" className="wk-secondary" onClick={()=>onChange(values.filter((_,i)=>i!==index))}>Angabe entfernen</button></>}
  </section>;
 };
 if(group==="Bisherige Angaben")return <div className="wk-stack"><p>Diese Angaben gehören nicht zur aktuellen Fragenauswahl. Sie bleiben erhalten, bis du sie bewusst entfernst.</p>{values.map((v,i)=>({v,i})).filter(({v})=>!questions.some(q=>q.key===v.key)).map(({v,i})=>row(v,i,EXPERIENCE_QUESTIONS.find(q=>q.key===v.key)))}</div>;
 return <div className="wk-stack">{questions.filter(q=>q.label===group).map(q=>{
  const spec=experienceAnswerGuidance(q.key,category,offerKind,areaKind,existingAnswers);
  const entries=values.map((v,i)=>({v,i})).filter(({v})=>v.key===q.key);
  const blank:ExperienceProperty={key:q.key,label:null,state:"UNKNOWN",value:null,conditions:emptyExperienceConditions()};
  if(spec?.kind!=="CHOICES")return <div key={q.key}>{(entries.length?entries:[{v:blank,i:-1}]).map(({v,i})=>row(v,i,q))}{spec?.kind==="NAME"&&entries.length>0&&<button type="button" className="wk-secondary" disabled={values.length>=100} onClick={()=>onChange([...values,blank])}>+ Weitere Antwort: {q.label}</button>}</div>;
  const direct=entries.filter(({v})=>unconditional(v));
  const selected=(choice:string)=>direct.some(({v})=>v.state==="KNOWN"&&typeof v.value==="string"&&sameLibrarianText(v.value,choice));
  const toggle=(choice:string)=>{
   const matching=direct.filter(({v})=>v.state==="KNOWN"&&typeof v.value==="string"&&sameLibrarianText(v.value,choice)).map(({i})=>i);
   if(matching.length){onChange(values.filter((_,i)=>!matching.includes(i)));return;}
   const remove=direct.filter(({v})=>v.state!=="KNOWN"||(!spec.multiple||spec.exclusiveGroups?.some(g=>g.includes(choice)&&g.some(c=>typeof v.value==="string"&&sameLibrarianText(v.value,c))))&&typeof v.value==="string"&&spec.choices.some(c=>sameLibrarianText(v.value as string,c))).map(({i})=>i);
   const next=values.filter((_,i)=>!remove.includes(i));if(next.length<100)onChange([...next,{...blank,state:"KNOWN",value:choice}]);
  };
  const historical=direct.filter(({v})=>v.state==="KNOWN"&&typeof v.value==="string"&&!spec.choices.some(c=>sameLibrarianText(v.value as string,c)));
  return <section className="wk-experience-property" key={q.key} aria-label={q.label}>
   <h4>{q.label}</h4>{q.key==="participation.prerequisite"&&selected("Keine Vorkenntnisse")&&selected("Vorkenntnisse erforderlich")&&<p role="alert">Widerspruch: Wähle entweder keine Vorkenntnisse oder Vorkenntnisse erforderlich. Begleitung kannst du zusätzlich auswählen.</p>}<p className="wk-answer-help">{q.key==="experience.activity"?spec.help:spec.multiple?"Mehrfachauswahl möglich. Wähle alle zutreffenden Antworten.":"Wähle eine passende Antwort."}</p>
   <div className="wk-choices" aria-label={`${q.label} Antworten`}>{spec.choices.map(c=><button type="button" key={c} aria-pressed={selected(c)} className={selected(c)?"selected":"wk-secondary"} disabled={!selected(c)&&values.length>=100} onClick={()=>toggle(c)}>{c==="lebhaft"?"lebendig":c}</button>)}</div>
   <KnowledgeButtons label={q.label} state={direct.some(({v})=>v.state==="KNOWN")?"KNOWN":direct[0]?.v.state} onChange={state=>onChange([...values.filter((_,i)=>!direct.some(entry=>entry.i===i)),{...blank,state}])}/>
   {historical.map(({v,i})=><aside className="wk-answer-history" key={i}><strong>Bisherige gespeicherte Angabe</strong><blockquote>{String(v.value)}</blockquote><p>Bleibt zusätzlich erhalten. Neue Antworten überschreiben diesen Text nicht.</p><button type="button" className="wk-secondary" onClick={()=>onChange(values.filter((_,j)=>j!==i))}>Bisherige Angabe entfernen</button></aside>)}
   {entries.some(({v})=>v.state==="KNOWN")&&<details className="wk-answer-conditions"><summary>Zeiten oder Ausnahmen ({entries.filter(({v})=>!unconditional(v)).length})</summary>{entries.filter(({v})=>v.state==="KNOWN").map(({v,i})=><section key={i}><h5>{v.value===true?"Ja":v.value===false?"Nein":String(v.value)}{!unconditional(v)?" · eingeschränkt gültig":""}</h5><Conditions inline value={v.conditions} onChange={conditions=>update(i,{conditions},q.key)}/>{!unconditional(v)&&<button type="button" className="wk-secondary" onClick={()=>onChange(values.filter((_,j)=>j!==i))}>Bedingte Antwort entfernen</button>}</section>)}</details>}
  </section>;
 })}</div>;
}
