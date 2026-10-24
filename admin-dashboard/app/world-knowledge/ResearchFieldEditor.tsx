"use client";
import { useEffect, useState } from "react";
import { FieldInput } from "@backyrd/world-knowledge-authoring-ui";
import { AUTHORING_FIELDS, validateAuthoringSubmission } from "@backyrd/world-knowledge-core/browser";
import type { ResearchResult } from "@/lib/nuknukResearchDraft";
import { supplementResearchValue } from "@/lib/nuknukDraftImport";
import { ResearchValue } from "./ResearchValue";
import styles from "./WorldResearchBatchPanel.module.css";

type Answer = { claimId?: string; knowledgeState: string; value: unknown; visibility?: string };
type Staged = { knowledgeState:string; value:unknown; validUntil?:string };
export function ResearchFieldEditor({spotId,result,post,onSaved,onClose}:{spotId:string;result:ResearchResult;post(body:unknown):Promise<unknown>;onSaved(value:unknown):void;onClose():void}) {
  const [answers,setAnswers] = useState<Record<string,Answer> | null>(null);
  const [seed,setSeed] = useState<unknown>();
  const [staged,setStaged] = useState<Staged | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [dirty,setDirty] = useState(false);
  const [key] = useState(() => `research-edit:${crypto.randomUUID()}`);
  const [saveKey,setSaveKey] = useState(() => `research-edit:${crypto.randomUUID()}`);
  const field = AUTHORING_FIELDS.find(item => item.attributeKey === result.attributeKey);
  useEffect(() => {
    let active=true;
    void post({action:"edit-field",spotId}).then(value => {
      if (!active) return;
      const current = (value as {answers:Record<string,Answer>}).answers;
      setAnswers(current);
      let initial = current[result.attributeKey]?.value;
      if(result.status === "REQUIRES_REVIEW" && result.value !== undefined) {
        try { initial = supplementResearchValue(result.attributeKey,current[result.attributeKey],result.value); }
        catch { setNotice("Der Vorschlag weicht vom bestehenden Profil ab. Du bearbeitest die gespeicherte Angabe; der Recherchevorschlag bleibt darüber sichtbar."); }
      }
      setSeed(initial);
    }).catch(() => {if(active)setError("Das aktuelle Profil konnte nicht geladen werden. Schliesse den Editor und versuche es erneut.");});
    return () => {active=false;};
  },[post,result,spotId]);
  useEffect(() => {
    if (!dirty && !staged) return;
    const warn = (event:BeforeUnloadEvent) => {event.preventDefault();};
    window.addEventListener("beforeunload",warn);return () => window.removeEventListener("beforeunload",warn);
  },[dirty,staged]);
  if (!field) return <p className={styles.note}>Dieses Feld kann im Ortprofil bearbeitet werden.</p>;
  const close = () => {if ((!dirty && !staged) || window.confirm("Ungespeicherte Änderungen verwerfen?")) onClose();};
  const save = async () => {
    if(!staged || !answers || busy) return;
    setBusy(true);setError("");
    try {
      await post({action:"save-field",spotId,attributeKey:field.attributeKey,...staged,expectedClaimId:answers[field.attributeKey]?.claimId ?? null,idempotencyKey:saveKey});
      window.dispatchEvent(new Event("backyrd:spot-profile-updated"));onSaved(staged.value);
    } catch(cause) {setError(cause instanceof Error ? cause.message : "Die Angabe konnte nicht gespeichert werden.");}
    finally {setBusy(false);}
  };
  return <section className="wk-field" aria-label={`${field.label} bearbeiten`}>
    <p className={styles.note}>Eigene Angabe: Prüfe oder ergänze den Inhalt. „Übernehmen“ merkt ihn hier vor. Erst „Im Profil speichern“ speichert deine Admin-Bestätigung. Die Recherchebelege bleiben unverändert.</p>
    {notice && <p className={styles.partialNote}>{notice}</p>}
    {answers ? <FieldInput field={field} initialDraft={seed !== undefined ? {key,value:seed} : undefined} onDiscardDraft={() => {setStaged(null);setDirty(false);}} existingAnswers={answers}
      referenceValue={field.attributeKey === "hours.kitchen" ? answers["hours.regular"]?.value : undefined}
      disabled={busy} disabledReason="Speicherung läuft …" onDraftChange={setDirty} onError={() => undefined}
      onSave={async(knowledgeState,value,validUntil) => {
        const valid=validateAuthoringSubmission(field.attributeKey,knowledgeState,value);
        if(!valid.ok) throw new Error(valid.message);
        setSaveKey(`research-edit:${crypto.randomUUID()}`);setStaged({knowledgeState,value:valid.value,validUntil});setDirty(false);setError("");
      }}/>: !error && <p role="status">Aktuelle Profilangaben werden geladen …</p>}
    {staged && <div className={styles.partialNote}><strong>Für deine Bestätigung vorgemerkt</strong><ResearchValue attributeKey={field.attributeKey} value={staged.value}/>{dirty && <p>Weitere Änderungen zuerst oben übernehmen.</p>}</div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.footer}><button type="button" className={styles.secondary} disabled={busy} onClick={close}>Editor schliessen</button><button type="button" className={styles.primary} disabled={busy || !staged || dirty} onClick={() => void save()}>{busy ? "Wird gespeichert …" : "Eigene Angabe im Profil speichern"}</button></div>
  </section>;
}
