"use client";
import { useMemo, useState } from "react";
import { validateAuthoringSubmission } from "@backyrd/world-knowledge-core/browser";
import type { InboxTask } from "@/lib/researchInbox";
import { supplementResearchValue } from "@/lib/nuknukDraftImport";
import { researchFailureFeedback } from "@/lib/researchSaveFeedback";
import { ResearchFieldEditor } from "./ResearchFieldEditor";
import { ResearchValue, researchGapReason, researchFieldLabel } from "./ResearchValue";
import styles from "./ResearchInbox.module.css";

type Props={spotId:string;task:InboxTask;request(body?:unknown):Promise<unknown>;post(body:unknown):Promise<unknown>;onDecision(message:string):Promise<void>;onEditingChange(value:boolean):void};
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
  const [editing,setEditing]=useState(false),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [saveKey]=useState(()=>`research-edit:${crypto.randomUUID()}`);
  const label=researchFieldLabel(task.attributeKey),hasProposal=task.value!==undefined;
  const checkHint=researchCheckInstructions(task.attributeKey);
  const sourceHints=[...new Set(task.reason?.match(/https:\/\/[^\s)<>,]+/g) ?? [])].map(url=>url.replace(/\.$/,""));
  const explanation=researchGapReason(task.reason).replace(/https:\/\/[^\s)<>,]+/g,url=>sourceName(url.replace(/\.$/,"")));
  const preview=useMemo(()=>{
    if(!hasProposal)return {allowed:false,explanation:"Hier gibt es noch keinen fertigen Vorschlag. Trage die richtige Angabe ein, wenn du sie verlässlich klären kannst."};
    if(task.attributeKey==="state.current")return {allowed:false,explanation:"Ein vorübergehender Zustand braucht ein Enddatum. Bitte ergänze es über „Ändern“, damit der Hinweis nicht veraltet stehen bleibt."};
    try {
      const value=supplementResearchValue(task.attributeKey,task.currentValue===undefined?undefined:{knowledgeState:"KNOWN_VALUE",value:task.currentValue},task.value);
      const state=typeof value==="boolean"?value?"KNOWN_TRUE":"KNOWN_FALSE":"KNOWN_VALUE";
      const valid=validateAuthoringSubmission(task.attributeKey,state,value);
      return valid.ok?{allowed:true,explanation:""}:{allowed:false,explanation:"Der Vorschlag ist noch unvollständig. Bitte korrigiere oder ergänze ihn über „Ändern“."};
    }catch{return {allowed:false,explanation:"Einzelne Angaben im Vorschlag widersprechen dem bisherigen Profil. Prüfe die Unterschiede und trage über „Ändern“ die richtige Angabe ein."};}
  },[hasProposal,task]);
  const act=async(action:"accept"|"keep")=>{
    if(busy || action==="accept" && (!checked || !preview.allowed))return;
    setBusy(true);setError("");onEditingChange(true);
    try {
      await request({action,spotId,jobIds:task.jobIds,fingerprint:task.fingerprint,claimId:task.claimId,idempotencyKey:saveKey});
      await onDecision(action==="accept"?`${label}: im Ortprofil gespeichert.`:hasProposal?`${label}: Vorschlag abgelehnt. Die bisherige Angabe bleibt erhalten.`:`${label}: Frage abgeschlossen. Es wurde keine neue Angabe ins Profil geschrieben.`);
    }catch(cause){setError(researchFailureFeedback(cause).message);}finally{setBusy(false);onEditingChange(false);}
  };
  const edit=()=>{setError("");setEditing(true);onEditingChange(true);};
  return <article className={styles.taskReview}>
    <span className={styles.eyebrow}>{hasProposal?"VORSCHLAG PRÜFEN":task.kind==="REVIEW"?"ANGABE KLÄREN":"ANGABE ERGÄNZEN"}</span>
    <h3>{label}</h3>
    <div className={styles.instructions}><strong>Das ist deine Aufgabe</strong><p>{hasProposal?"Lies den Vorschlag und prüfe ihn in der Quelle. Stimmt er, kannst du ihn direkt übernehmen. Ist er nur teilweise richtig, ändere ihn. Ist er falsch, lehne ihn ab.":task.kind==="REVIEW"?"Hier gibt es unterschiedliche oder unklare Angaben. Prüfe die Quellen und trage ein, was richtig ist. Wenn du es nicht klären kannst, lass die Frage für später offen.":"Die Recherche hat dazu keine eindeutige Angabe gefunden. Ergänze sie nur, wenn du sie verlässlich kennst. Du musst nichts erraten."}</p>{checkHint && <><strong>Darauf kommt es hier an</strong><p>{checkHint}</p></>}</div>
    <section className={styles.why}><h4>{hasProposal?"Warum sollst du das prüfen?":"Was ist noch unklar?"}</h4><p>{explanation}</p></section>
    <div className={styles.comparison}>
      {hasProposal && <section className={styles.proposed}><h4>Das wird vorgeschlagen</h4><ResearchValue attributeKey={task.attributeKey} value={task.value}/></section>}
      <section className={styles.current}><h4>So steht es bisher im Profil</h4>{task.currentValue===undefined || task.currentValue===null?<p>Noch keine bestätigte Angabe hinterlegt.</p>:task.attributeKey==="experience.profile"?<details><summary>Gespeicherte Angebote und Bereiche ansehen</summary><ResearchValue attributeKey={task.attributeKey} value={task.currentValue}/></details>:<ResearchValue attributeKey={task.attributeKey} value={task.currentValue}/>}</section>
    </div>
    <section className={styles.sources}><h4>{task.citations?.length?"Hier kannst du es nachprüfen":"Quellen und Hinweise"}</h4>{task.citations?.length?task.citations.map((citation,index)=><div key={`${citation.url}-${index}`}><a href={citation.url} rel="noreferrer" target="_blank">{sourceName(citation.url)} öffnen ↗</a>{citation.evidence.length>450?<><blockquote>{citation.evidence.slice(0,450)}…</blockquote><details><summary>Vollständigen Beleg lesen</summary><blockquote>{citation.evidence}</blockquote></details></>:<blockquote>{citation.evidence}</blockquote>}{citation.observedAt && <small>Abgerufen am {new Date(citation.observedAt).toLocaleDateString("de-CH")}</small>}</div>):<><p>Für diese Frage liegt hier kein vollständiger Quellenbeleg vor. {sourceHints.length?"Öffne die genannten Webseiten, vergleiche die Angaben und trage das richtige Ergebnis ein.":"Ergänze die Angabe nur, wenn du sie verlässlich klären kannst."}</p>{sourceHints.map(url=><p key={url}><a href={url} rel="noreferrer" target="_blank">{sourceName(url)} öffnen ↗</a></p>)}</>}</section>
    {editing?<ResearchFieldEditor spotId={spotId} result={task} post={post} onClose={()=>{setEditing(false);onEditingChange(false);}} onSaved={(value,state,claimId)=>{
      void (async()=>{
        setEditing(false);setBusy(true);
        try {
          if(state==="UNKNOWN" && claimId)await request({action:"keep",spotId,jobIds:task.jobIds,fingerprint:task.fingerprint,claimId});
          await onDecision(state==="UNKNOWN"?`${label}: bewusst offen gelassen und die Frage abgeschlossen.`:`${label}: deine Änderung ist im Ortprofil gespeichert.`);
        }catch{setError("Deine Angabe ist gespeichert. Die Aufgabe konnte aber noch nicht abgeschlossen werden. Bitte aktualisiere die Übersicht und prüfe sie erneut.");}
        finally{setBusy(false);onEditingChange(false);}
      })();
    }}/>:<section className={styles.decision}><h4>Deine Entscheidung</h4>
      {hasProposal && preview.allowed && <><p>{["experience.profile","hours.regular","hours.special","hours.kitchen_special"].includes(task.attributeKey)?"Beim Übernehmen werden die vorgeschlagenen Angaben ergänzt. Andere Angebote, Bereiche und nicht betroffene Tage bleiben erhalten.":task.currentValue!==undefined?"Beim Übernehmen ersetzt diese Angabe den bisherigen Inhalt dieses Feldes. Andere Felder bleiben unverändert.":"Beim Übernehmen wird diese Angabe im Ortprofil ergänzt."}</p><label className={styles.check}><input type="checkbox" checked={checked} disabled={busy} onChange={event=>setChecked(event.target.checked)}/><span>Ich habe den Vorschlag geprüft. Die Angaben stimmen.</span></label></>}
      {hasProposal && !preview.allowed && <p className={styles.error}>{preview.explanation}</p>}
      {!hasProposal && <p>{task.currentValue!==undefined?"Bestätige die bisherige Angabe nur, wenn du sie geprüft hast. Kannst du die Frage noch nicht klären, wähle „Später prüfen“. Damit bleibt sie offen.":"„Später prüfen“ hält die Frage offen. „Ohne Angabe abschliessen“ erledigt nur die Frage – das bedeutet weder Ja noch Nein."}</p>}
      <div className={styles.actions}>{hasProposal && preview.allowed && <button className={styles.primary} disabled={busy || !checked} onClick={()=>void act("accept")}>{busy?"Wird gespeichert …":"So übernehmen & speichern"}</button>}<button disabled={busy} className={!hasProposal || !preview.allowed?styles.primary:undefined} onClick={edit}>{hasProposal?"Ändern":task.kind==="REVIEW"?"Richtige Angabe eintragen":"Angabe hinzufügen"}</button><button disabled={busy} onClick={()=>void act("keep")}>{hasProposal?"Vorschlag ablehnen":task.currentValue!==undefined?"Bisherige Angabe ist richtig":"Ohne Angabe abschliessen"}</button></div>
    </section>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </article>;
}
