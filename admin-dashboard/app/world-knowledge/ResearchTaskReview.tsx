"use client";
import { useMemo, useState } from "react";
import { validateAuthoringSubmission } from "@backyrd/world-knowledge-core/browser";
import type { InboxTask } from "@/lib/researchInbox";
import { supplementResearchValue } from "@/lib/nuknukDraftImport";
import { researchFailureFeedback } from "@/lib/researchSaveFeedback";
import { ResearchFieldEditor } from "./ResearchFieldEditor";
import { ResearchValue, researchGapReason, researchFieldLabel } from "./ResearchValue";
import styles from "./ResearchInbox.module.css";

type Props={spotId:string;task:InboxTask;request(body?:unknown):Promise<unknown>;post(body:unknown):Promise<unknown>;onDecision(message:string):void;onEditingChange(value:boolean):void};
function sourceName(url:string):string {try{return new URL(url).hostname.replace(/^www\./,"");}catch{return "Quelle";}}
export function researchCheckInstructions(key:string):string|null {
  if(["hours.special","hours.kitchen_special"].includes(key))return "Prüfe Anfang, Ende und Jahr des Zeitraums. Ist der Ort ganz geschlossen oder gelten nur andere Uhrzeiten? Nicht aufgeführte Tage werden durch diesen Vorschlag nicht geändert.";
  if(key==="hours.kitchen")return "Gemeint ist die Zeit, in der Speisen bestellt werden können. Prüfe, ob die Quelle Küchenzeiten oder die allgemeinen Öffnungszeiten nennt.";
  if(key==="hours.regular")return "Prüfe die Wochentage sowie Öffnung und Schliessung. Eine Pause zwischen Mittag und Abend muss erhalten bleiben.";
  if(key==="experience.profile")return "Prüfe jedes neue Angebot und den zugehörigen Bereich. Preise, Zeiten und Bedingungen müssen zum jeweiligen Angebot gehören – nicht automatisch zum ganzen Ort.";
  if(key==="operation.price_options")return "Prüfe, wofür der Preis gilt und ob er pro Person, Gruppe oder Übernachtung berechnet wird. Bestätige enthaltene Zusatzkosten nur, wenn sie ausdrücklich genannt sind.";
  if(key==="rule.reservation")return "Unterscheide zwischen empfohlen und zwingend erforderlich. Prüfe auch Ausnahmen, etwa für grössere Gruppen oder bestimmte Bereiche.";
  if(key.startsWith("accessibility."))return "Bestätige genau die genannte Eigenschaft, etwa einen stufenlosen Eingang oder ein Rollstuhl-WC. Eine allgemeine Aussage zur Barrierefreiheit reicht nicht für jede einzelne Eigenschaft.";
  if(key.startsWith("capacity."))return "Prüfe, für welchen Raum oder Bereich die Zahl gilt. Unterschiedliche Bestuhlungen oder alternative Raumaufteilungen dürfen nicht zusammengezählt werden.";
  if(key==="contact.public_email")return "Nutze die veröffentlichte Kontaktadresse dieses Ortes. Ergänze keine aus Namen oder anderen Angaben vermutete E-Mail-Adresse.";
  if(key==="contact.phone")return "Vergleiche die Nummer mit der Kontaktseite und achte auf die Landesvorwahl, zum Beispiel +41 für die Schweiz.";
  if(["contact.instagram","contact.facebook","contact.linkedin","contact.tiktok"].includes(key))return "Öffne den Link und prüfe, ob das Profil tatsächlich zu diesem Ort gehört. Ein ähnlich benannter Account allein reicht nicht.";
  if(key.startsWith("location."))return "Die Angaben müssen zum richtigen Standort gehören. Für eine andere Adresse oder Position öffne das Ortprofil und nutze dort die Adresssuche.";
  if(key.startsWith("classification."))return "Ordne den Ort nach seinem Hauptangebot ein. Ein Restaurant in einem Hotel macht das gesamte Hotel beispielsweise nicht zu einem Restaurant.";
  return null;
}
export function ResearchTaskReview({spotId,task,request,post,onDecision,onEditingChange}:Props) {
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [saveKey]=useState(()=>`research-edit:${crypto.randomUUID()}`);
  const label=researchFieldLabel(task.attributeKey);
  const checkHint=researchCheckInstructions(task.attributeKey);
  const sourceHints=[...new Set(task.reason?.match(/https:\/\/[^\s)<>,]+/g) ?? [])].map(url=>url.replace(/\.$/,""));
  const citations=(task.citations ?? []).filter((citation,index,items)=>items.findIndex(other=>other.url===citation.url && other.evidence===citation.evidence && other.observedAt===citation.observedAt)===index);
  const reason=task.reason || (task.currentValue===undefined?"Diese Angabe wurde vorgeschlagen, aber noch nicht bestätigt. Prüfe, ob sie zum richtigen Ort gehört und von der Quelle gestützt wird.":"Der Vorschlag weicht von der bisher gespeicherten Angabe ab. Vergleiche beide mit der Quelle und entscheide, welche richtig ist.");
  const explanation=researchGapReason(reason).replace(/https:\/\/[^\s)<>,]+/g,url=>sourceName(url.replace(/\.$/,"")));
  const preview=useMemo(()=>{
    if(task.attributeKey==="state.current")return {allowed:false,explanation:"Ein vorübergehender Zustand braucht ein Enddatum. Bitte ergänze es über „Ändern“, damit der Hinweis nicht veraltet stehen bleibt."};
    try {
      const value=supplementResearchValue(task.attributeKey,task.currentValue===undefined?undefined:{knowledgeState:"KNOWN_VALUE",value:task.currentValue},task.value);
      const state=typeof value==="boolean"?value?"KNOWN_TRUE":"KNOWN_FALSE":"KNOWN_VALUE";
      const valid=validateAuthoringSubmission(task.attributeKey,state,value);
      return valid.ok?{allowed:true,explanation:""}:{allowed:false,explanation:"Der Vorschlag ist noch unvollständig. Bitte korrigiere oder ergänze ihn über „Ändern“."};
    }catch{return {allowed:false,explanation:"Einzelne Angaben im Vorschlag widersprechen dem bisherigen Profil. Prüfe die Unterschiede und trage über „Ändern“ die richtige Angabe ein."};}
  },[task]);
  const act=async(action:"accept"|"keep")=>{
    if(busy || action==="accept" && !preview.allowed)return;
    setBusy(true);setError("");onEditingChange(true);
    try {
      await request({action,spotId,jobIds:task.jobIds,fingerprint:task.fingerprint,claimId:task.claimId,idempotencyKey:saveKey});
      onDecision(action==="accept"?`${label}: im Ortprofil gespeichert.`:`${label}: Vorschlag abgelehnt.`);
    }catch(cause){setError(researchFailureFeedback(cause).message);}finally{setBusy(false);onEditingChange(false);}
  };
  const edit=()=>{setError("");setEditing(true);onEditingChange(true);};
  return <article className={styles.taskReview}>
    <span className={styles.eyebrow}>VORSCHLAG PRÜFEN</span>
    <h3>{label}</h3>
    <div className={styles.comparison}>
      <section className={styles.proposed}><h4>Vorschlag</h4><ResearchValue attributeKey={task.attributeKey} value={task.value}/></section>
      <section className={styles.current}><h4>Aktuell im Profil</h4>{task.currentValue===undefined || task.currentValue===null?<p>Keine bestätigte Angabe.</p>:task.attributeKey==="experience.profile"?<details><summary>Gespeicherte Angebote und Bereiche ansehen</summary><ResearchValue attributeKey={task.attributeKey} value={task.currentValue}/></details>:<ResearchValue attributeKey={task.attributeKey} value={task.currentValue}/>}</section>
    </div>
    {editing?<ResearchFieldEditor spotId={spotId} result={task} post={post} onClose={()=>{setEditing(false);onEditingChange(false);}} onSaved={(value,state,claimId)=>{
      void (async()=>{
        setEditing(false);setBusy(true);
        try {
          if(claimId)await request({action:"keep",spotId,jobIds:task.jobIds,fingerprint:task.fingerprint,claimId});
          onDecision(state==="UNKNOWN"?`${label}: bewusst offen gelassen und die Frage abgeschlossen.`:`${label}: deine Änderung ist im Ortprofil gespeichert.`);
        }catch{setError("Deine Angabe ist gespeichert. Die Aufgabe konnte aber noch nicht abgeschlossen werden. Bitte aktualisiere die Übersicht und prüfe sie erneut.");}
        finally{setBusy(false);onEditingChange(false);}
      })();
    }}/>:<section className={styles.decision}>
      {!preview.allowed && <p className={styles.error}>{preview.explanation}</p>}
      <div className={styles.actions}>
        {preview.allowed && <button className={styles.primary} disabled={busy} onClick={()=>void act("accept")}>Geprüft übernehmen</button>}
        <button disabled={busy} className={!preview.allowed?styles.primary:undefined} onClick={edit}>Ändern</button>
        <button disabled={busy} onClick={()=>void act("keep")}>Ablehnen</button>
      </div>
      {busy && <p role="status">Wird gespeichert …</p>}
    </section>}
    {(checkHint || explanation || citations.length>0 || sourceHints.length>0) &&
      <details className={styles.sources}>
        <summary>Recherche & Belege</summary>
        {checkHint && <p>{checkHint}</p>}
        {explanation && <p>{explanation}</p>}
        {citations.map((citation,index)=><div key={`${citation.url}-${index}`}>
          <a href={citation.url} rel="noreferrer" target="_blank">{sourceName(citation.url)} öffnen ↗</a>
          <blockquote>{citation.evidence}</blockquote>
          {citation.observedAt && <small>Abgerufen am {new Date(citation.observedAt).toLocaleDateString("de-CH")}</small>}
        </div>)}
        {!citations.length && sourceHints.map(url=><p key={url}><a href={url} rel="noreferrer" target="_blank">{sourceName(url)} öffnen ↗</a></p>)}
      </details>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </article>;
}
