"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type R = Record<string, unknown>;
type Detail = {
  case: R;
  content: R;
  actor: R | null;
  signals: R[];
  decision_events: R[];
  reports: R[];
  appeals: R[];
  text_jobs: R[];
  image_jobs: R[];
};
type DistributionDetail = {
  state?: R | null;
  policy?: R | null;
  reasons?: R[];
  affected_consumers?: string[];
};
type Action = "allow" | "limit" | "temporary_hide" | "remove";

const STATUS: Record<string,string> = {
  needs_review: "Menschliche Prüfung nötig",
  queued: "Wartet auf Prüfung",
  evaluating: "Wird gerade geprüft",
  decided: "Entscheidung abgeschlossen",
  failed: "Automatische Prüfung fehlgeschlagen",
  pending: "Noch nicht verarbeitet",
  succeeded: "Erfolgreich geprüft",
  skipped: "Nicht automatisch prüfbar",
};
const ACTION: Record<string,string> = {
  allow: "Freigeben",
  allow_log: "Sichtbar lassen und beobachten",
  limit: "Reichweite begrenzen",
  temporary_hide: "Vorübergehend ausblenden",
  remove: "Entfernen",
};
const CATEGORY: Record<string,string> = {
  none: "Kein Regelverstoß",
  hate: "Hass oder Diskriminierung",
  harassment: "Belästigung oder Ausgrenzung",
  harassment_and_bullying: "Belästigung oder Ausgrenzung",
  violence: "Gewalt oder Bedrohung",
  sexual: "Sexuelle Inhalte",
  self_harm: "Selbstgefährdung",
  illicit: "Illegale oder gefährliche Inhalte",
  prohibited_symbols: "Verbotene oder extremistische Symbole",
};
const SOURCE: Record<string,string> = {
  automated_shadow: "Automatische Vorprüfung",
  human_admin: "Menschliche Entscheidung",
  openai: "Automatische Inhaltsanalyse",
  specialized_moderation: "Spezialisierte Inhaltsanalyse",
  backyrd_integrity: "Backyrd Review Integrity",
};

const INTEGRITY_SIGNAL: Record<string,string> = {
  review_integrity_exact_duplicate: "Exakt duplizierte Bewertung",
  review_integrity_near_duplicate: "Sehr ähnliche Bewertung",
  review_integrity_copy_paste: "Gleicher Text bei mehreren Spots",
  review_integrity_high_velocity: "Ungewöhnlich viele Bewertungen in kurzer Zeit",
  review_integrity_repeat_same_spot: "Ungewöhnlich häufige Bewertungen desselben Spots",
  review_integrity_spot_burst_15m: "Auffälliger Bewertungsanstieg · 15 Minuten",
  review_integrity_spot_burst_60m: "Auffälliger Bewertungsanstieg · 60 Minuten",
  review_integrity_coordinated_copy: "Koordinierte identische Bewertungen",
  review_integrity_new_account_brigade: "Auffällige Gruppe neuer Accounts",
  review_integrity_repeated_group_pattern: "Wiederkehrende koordinierte Account-Gruppe",
};

const INTEGRITY_METRIC: Record<string,string> = {
  previous_exact_duplicates: "Frühere exakte Duplikate",
  same_spot_reviews_24h: "Bewertungen desselben Spots · 24 Std.",
  reviews_10m: "Bewertungen dieses Accounts · 10 Min.",
  other_spots_with_exact_text: "Andere Spots mit exakt gleichem Text",
  max_similarity: "Höchste Textähnlichkeit",
  distinct_users_15m: "Unterschiedliche Accounts · 15 Min.",
  reviews_15m: "Bewertungen · 15 Min.",
  distinct_users_60m: "Unterschiedliche Accounts · 60 Min.",
  reviews_60m: "Bewertungen · 60 Min.",
  distinct_users_same_text_30m: "Accounts mit identischem Text · 30 Min.",
  total_users_60m: "Beteiligte Accounts · 60 Min.",
  new_users_60m: "Neue Accounts · 60 Min.",
  very_new_users_60m: "Sehr neue Accounts · 60 Min.",
  new_user_ratio: "Anteil neuer Accounts",
  very_new_user_ratio: "Anteil sehr neuer Accounts",
  new_account_days: "Definition neuer Account · Tage",
  very_new_hours: "Definition sehr neuer Account · Stunden",
  current_group_users: "Accounts in aktueller Gruppe",
  prior_coordinated_spots: "Frühere gemeinsame Spots",
  group_window_minutes: "Gruppen-Zeitfenster · Minuten",
  history_days: "Historischer Zeitraum · Tage",
  minimum_shared_users: "Mindestzahl gemeinsamer Accounts",
  window_minutes: "Analysefenster · Minuten",
};

function t(v: unknown, fallback="—") {
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}
function n(v: unknown) { const x=Number(v); return Number.isFinite(x)?x:0; }
function dict(map:Record<string,string>, v:unknown, fallback="Nicht angegeben") {
  const key=t(v,""); return map[key] ?? (key ? key.replaceAll("_"," ") : fallback);
}
function date(v:unknown) { return typeof v === "string" ? new Date(v).toLocaleString("de-CH") : "—"; }
function pretty(v:unknown) { return JSON.stringify(v ?? {}, null, 2); }
function obj(v:unknown): R {
  return v && typeof v === "object" && !Array.isArray(v) ? v as R : {};
}
function isIntegritySignal(v:R) {
  const provider=t(v.provider,"");
  const signalType=t(v.signal_type,"");
  return provider==="backyrd_integrity" || signalType.startsWith("review_integrity_");
}
function integrityRisk(v:unknown) {
  const value=t(v,"");
  if(value==="high_risk") return {label:"Hohes Risiko",color:"#ff8585"};
  if(value==="suspicious") return {label:"Auffällig",color:"#ffbd63"};
  return {label:value ? value.replaceAll("_"," ") : "Nicht angegeben",color:"#aeb4bf"};
}
function integrityMetricValue(key:string,v:unknown) {
  if(key.endsWith("_ratio") || key==="max_similarity") return `${Math.round(n(v)*100)}%`;
  return t(v);
}
function IntegritySignalCard({signal}:{signal:R}) {
  const categories=obj(signal.categories);
  const scores=obj(signal.scores);
  const type=t(signal.signal_type,"");
  const risk=integrityRisk(categories.risk_level);
  const score=Math.round(n(scores.integrity_score)*100);
  const metrics=Object.entries(categories).filter(([key])=>key!=="risk_level" && INTEGRITY_METRIC[key]);
  return <div style={{padding:17,borderRadius:15,border:"1px solid rgba(255,79,139,.2)",background:"linear-gradient(135deg,rgba(255,79,139,.07),rgba(255,255,255,.018))"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
      <div><div style={{fontSize:12,fontWeight:850,color:"#ff6d9f",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Review Integrity</div><strong style={{fontSize:18}}>{INTEGRITY_SIGNAL[type] ?? type.replaceAll("_"," ")}</strong></div>
      <div style={{display:"flex",gap:8}}><span style={{padding:"7px 10px",borderRadius:999,border:`1px solid ${risk.color}33`,background:`${risk.color}12`,color:risk.color,fontSize:12,fontWeight:850}}>{risk.label}</span><span style={{padding:"7px 10px",borderRadius:999,border:"1px solid rgba(255,255,255,.09)",background:"rgba(255,255,255,.05)",fontSize:12,fontWeight:850}}>{score}%</span></div>
    </div>
    {metrics.length?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:9,marginTop:14}}>{metrics.map(([key,value])=><div key={key} style={{padding:12,borderRadius:12,background:"rgba(0,0,0,.18)",border:"1px solid rgba(255,255,255,.06)"}}><div className="by-muted by-small">{INTEGRITY_METRIC[key]}</div><strong style={{display:"block",marginTop:4}}>{integrityMetricValue(key,value)}</strong></div>)}</div>:null}
    <div className="by-muted by-small" style={{marginTop:12}}>Quelle: Backyrd deterministic integrity rules · {date(signal.created_at)}</div>
  </div>;
}
function severity(v:unknown) {
  const x=n(v);
  if (x>=5) return {label:"Kritisch",color:"#ff6b6b",text:"Der Inhalt kann ein hohes Risiko darstellen und sollte sofort geprüft werden."};
  if (x>=4) return {label:"Hoch",color:"#ff8f70",text:"Der Inhalt enthält deutliche Warnsignale und braucht eine zeitnahe Entscheidung."};
  if (x>=3) return {label:"Mittel",color:"#ffc36b",text:"Der Inhalt ist nicht eindeutig. Der Zusammenhang muss von einem Menschen beurteilt werden."};
  if (x>=1) return {label:"Niedrig",color:"#ffd98a",text:"Es gibt leichte Auffälligkeiten, aber keinen eindeutigen schweren Verstoß."};
  return {label:"Unauffällig",color:"#7ee2a8",text:"Die automatische Prüfung hat keinen relevanten Verstoß erkannt."};
}
function Card({title,subtitle,children}:{title:string;subtitle?:string;children:React.ReactNode}) {
  return <section className="by-card" style={{padding:22,display:"grid",gap:16}}>
    <div><h2 style={{margin:0,fontSize:21}}>{title}</h2>{subtitle?<p className="by-muted" style={{margin:"6px 0 0",lineHeight:1.5}}>{subtitle}</p>:null}</div>
    {children}
  </section>;
}
function Badge({value}:{value:unknown}) {
  const raw=t(value,"unknown");
  const label=STATUS[raw] ?? ACTION[raw] ?? raw.replaceAll("_"," ");
  const color=["succeeded","decided","allow"].includes(raw)?"#7ee2a8":["failed","remove"].includes(raw)?"#ff8585":"#ffc36b";
  return <span style={{padding:"7px 11px",borderRadius:999,border:`1px solid ${color}33`,background:`${color}12`,color,fontSize:12,fontWeight:850}}>{label}</span>;
}

export default function Page() {
  const params=useParams<{caseId:string}>();
  const caseId=params?.caseId ?? "";
  const [detail,setDetail]=useState<Detail|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [priority,setPriority]=useState(0);
  const [priorityNote,setPriorityNote]=useState("");
  const [savingPriority,setSavingPriority]=useState(false);
  const [decision,setDecision]=useState<Action|null>(null);
  const [decisionNote,setDecisionNote]=useState("");
  const [savingDecision,setSavingDecision]=useState(false);
  const [distribution,setDistribution]=useState<DistributionDetail|null>(null);

  async function load() {
    setLoading(true); setError("");
    const {data,error}=await supabase.rpc("safety_admin_case_detail_v1",{p_case_id:caseId});
    if(error){setError("Der Moderationsfall konnte nicht geladen werden.");setDetail(null);setDistribution(null);} else {
      const d=data as Detail;setDetail(d);setPriority(n(d.case.priority));
      const contentItemId=t(d.content.id,"");
      if(contentItemId){
        const distributionResult=await supabase.rpc("distribution_trust_admin_detail_v1",{p_content_item_id:contentItemId});
        setDistribution(distributionResult.error?null:distributionResult.data as DistributionDetail);
      } else setDistribution(null);
    }
    setLoading(false);
  }
  useEffect(()=>{
    if(!caseId) return;
    const timer=window.setTimeout(()=>void load(),0);
    return()=>window.clearTimeout(timer);
  },[caseId]);

  async function savePriority(){
    setSavingPriority(true);setError("");
    const {error}=await supabase.rpc("safety_admin_set_case_priority_v1",{p_case_id:caseId,p_priority:priority,p_internal_note:priorityNote.trim()||null});
    setSavingPriority(false); if(error){setError("Die Priorität konnte nicht gespeichert werden.");return;} setPriorityNote(""); await load();
  }
  async function saveDecision(){
    if(!detail||!decision||!decisionNote.trim()) return;
    setSavingDecision(true);setError("");
    const rpc=t(detail.content.entity_type,"")==="spot_owner_change"?"safety_admin_decide_v1":"safety_admin_decide_user_content_v1";
    const integrityCase=detail.signals.some(isIntegritySignal) || t(detail.case.explanation_code,"")==="REVIEW_INTEGRITY_SIGNAL";
    const {error}=await supabase.rpc(rpc,{p_case_id:caseId,p_action:decision,p_category:detail.case.final_category??null,p_severity:detail.case.final_severity??null,p_confidence:detail.case.final_confidence===null?null:Number(detail.case.final_confidence),p_public_explanation:decisionNote.trim(),p_internal_explanation:integrityCase?"Menschliche Entscheidung in der Backyrd Safety-Konsole. Review-Integrity-Signale wurden geprüft.":"Menschliche Entscheidung in der Backyrd Safety-Konsole.",p_reason_codes:["HUMAN_REVIEW",integrityCase?"REVIEW_INTEGRITY_HUMAN_REVIEW":"CONTENT_SAFETY_HUMAN_REVIEW",`HUMAN_ACTION_${decision.toUpperCase()}`]});
    setSavingDecision(false); if(error){setError("Die Moderationsentscheidung konnte nicht gespeichert werden.");return;} setDecision(null);setDecisionNote("");await load();
  }

  if(loading) return <div className="by-page"><div className="by-card by-section">Moderationsfall wird geladen …</div></div>;
  if(!detail) return <div className="by-page"><Link href="/safety-integrity">← Zurück</Link><div className="by-card by-section" style={{marginTop:18,color:"#ff8585"}}>{error||"Fall nicht gefunden"}</div></div>;

  const c=detail.case, content=detail.content, actor=detail.actor;
  const body=t(content.text_content,"Kein Textinhalt vorhanden.");
  const sev=severity(c.final_severity);
  const cat=dict(CATEGORY,c.final_category,"Kein eindeutiger Verstoß");
  const images=Array.isArray(content.image_urls)?content.image_urls as unknown[]:[];
  const integritySignals=detail.signals.filter(isIntegritySignal);
  const contentSafetySignals=detail.signals.filter(s=>!isIntegritySignal(s));
  const integrityCase=integritySignals.length>0 || t(c.explanation_code,"")==="REVIEW_INTEGRITY_SIGNAL";
  const highestIntegrityScore=integritySignals.reduce((max,s)=>Math.max(max,n(obj(s.scores).integrity_score)),0);
  const highRiskIntegrity=integritySignals.some(s=>t(obj(s.categories).risk_level,"")==="high_risk");
  const why=n(c.final_severity)>=3?`Die automatische Prüfung vermutet ${cat.toLowerCase()}, konnte den Zusammenhang aber nicht sicher beurteilen.`:"Die automatische Prüfung hat keinen eindeutigen schweren Regelverstoß erkannt.";

  return <div className="by-page" style={{padding:"32px 34px 60px",maxWidth:1500,margin:"0 auto"}}>
    <Link href="/safety-integrity" style={{color:"#aeb4bf",textDecoration:"none",fontWeight:750}}>← Zurück zur Moderationskonsole</Link>
    <header style={{margin:"24px 0"}}><div style={{color:"#ff4f8b",fontSize:13,fontWeight:850,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>{integrityCase?"Review Integrity Case":"Moderationsfall"}</div><h1 className="by-title" style={{margin:0,fontSize:"clamp(36px,4vw,54px)"}}>{body.split("\n")[0]||"Inhalt prüfen"}</h1><p className="by-muted" style={{margin:"12px 0 0",maxWidth:800}}>{integrityCase?"Prüfe die Bewertung, die erkannten Verhaltensmuster und den Kontext. Integrity-Signale sind Hinweise – die endgültige Entscheidung trifft ein Mensch.":"Prüfe den Inhalt im Zusammenhang und entscheide, ob er sichtbar bleiben darf."}</p></header>
    {error?<div className="by-card" style={{padding:16,marginBottom:18,color:"#ff8585"}}>{error}</div>:null}

    <section className="by-card" style={{padding:22,marginBottom:18,display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,background:"linear-gradient(135deg,rgba(255,79,139,.08),rgba(255,255,255,.02))"}}>
      {(integrityCase?[["Status",dict(STATUS,c.case_status)],["Falltyp","Review Integrity"],["Integrity-Risiko",highRiskIntegrity?"Hohes Risiko":"Auffällig"],["Automatische Reaktion","Nur menschliche Prüfung"]]:[["Status",dict(STATUS,c.case_status)],["Dringlichkeit",sev.label],["Vermutetes Thema",cat],["System-Empfehlung",dict(ACTION,c.final_action)]]).map(([a,b])=><div key={a} style={{padding:15,borderRadius:15,background:"rgba(0,0,0,.2)",border:"1px solid rgba(255,255,255,.07)"}}><div className="by-muted by-small">{a}</div><strong style={{display:"block",marginTop:7,fontSize:17,lineHeight:1.35}}>{b}</strong></div>)}
    </section>

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.45fr) minmax(340px,.72fr)",gap:18,alignItems:"start"}}>
      <main style={{display:"grid",gap:18}}>
        <Card title="Was wurde veröffentlicht?" subtitle="Das ist der Inhalt, den Nutzer in Backyrd sehen.">
          <div style={{padding:20,borderRadius:17,background:"rgba(0,0,0,.24)",border:"1px solid rgba(255,255,255,.07)",fontSize:18,lineHeight:1.65,whiteSpace:"pre-wrap"}}>{body}</div>
          {images.length?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>{images.map((img,i)=>{const ref=t(img);return ref.startsWith("https://")?<a key={ref+i} href={ref} target="_blank" rel="noreferrer"><img src={ref} alt={`Zu prüfendes Bild ${i+1}`} style={{display:"block",width:"100%",height:320,objectFit:"contain",background:"#070708",borderRadius:16}}/></a>:<div key={ref+i} className="by-muted" style={{padding:18,border:"1px dashed rgba(255,255,255,.1)",borderRadius:14}}>Geschütztes Bild – kann hier noch nicht direkt angezeigt werden.</div>})}</div>:<div className="by-muted">Dieser Inhalt enthält keine Bilder.</div>}
        </Card>

        <Card title={integrityCase?"Warum wurde die Bewertung markiert?":"Warum wurde der Fall markiert?"} subtitle={integrityCase?"Review Integrity analysiert Verhaltensmuster. Ein Signal allein beweist keine Manipulation.":"Eine verständliche Zusammenfassung der automatischen Prüfung."}>
          {integrityCase?<><div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(220px,.4fr)",gap:14}}>
            <div style={{padding:18,borderRadius:16,border:`1px solid ${highRiskIntegrity?"#ff8585":"#ffbd63"}33`,background:"rgba(255,184,84,.055)"}}><strong style={{display:"block",fontSize:19,color:highRiskIntegrity?"#ff8585":"#ffbd63",marginBottom:8}}>{integritySignals.length===1?(INTEGRITY_SIGNAL[t(integritySignals[0].signal_type,"")]??"Review-Integrität auffällig"):`${integritySignals.length} Review-Integrity-Signale`}</strong><div style={{lineHeight:1.6}}>Backyrd hat ungewöhnliche Bewertungsmuster erkannt und den Review zur menschlichen Prüfung weitergeleitet.</div><div className="by-muted" style={{marginTop:10}}>Es wurde keine automatische Kontosanktion ausgesprochen.</div></div>
            <div style={{padding:18,borderRadius:16,background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.07)"}}><div className="by-muted by-small">Höchster Integrity Score</div><strong style={{display:"block",marginTop:7,fontSize:27}}>{Math.round(highestIntegrityScore*100)}%</strong><div className="by-muted by-small" style={{marginTop:5}}>Risikowert der Regel, keine Schuldzuweisung.</div></div>
          </div>
          {integritySignals.map((s,i)=><IntegritySignalCard key={t(s.id,`integrity-${i}`)} signal={s}/>)}
          {contentSafetySignals.length?<details style={{padding:14,borderRadius:14,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.018)"}}><summary className="by-muted by-small" style={{cursor:"pointer",fontWeight:800}}>Zusätzliche Content-Safety-Signale ({contentSafetySignals.length})</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:11,color:"#aeb4bf"}}>{pretty(contentSafetySignals)}</pre></details>:null}</>:<>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(220px,.4fr)",gap:14}}>
            <div style={{padding:18,borderRadius:16,border:`1px solid ${sev.color}33`,background:`${sev.color}0d`}}><strong style={{display:"block",fontSize:19,color:sev.color,marginBottom:8}}>{sev.label}e Auffälligkeit</strong><div style={{lineHeight:1.6}}>{why}</div><div className="by-muted" style={{marginTop:10}}>{sev.text}</div></div>
            <div style={{padding:18,borderRadius:16,background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.07)"}}><div className="by-muted by-small">Sicherheit der Einschätzung</div><strong style={{display:"block",marginTop:7,fontSize:27}}>{Math.round(n(c.final_confidence)*100)}%</strong><div className="by-muted by-small" style={{marginTop:5}}>Das ist die Sicherheit der automatischen Einordnung, keine Schuldzuweisung.</div></div>
          </div>
          {detail.signals.map((s,i)=><div key={t(s.id,`signal-${i}`)} style={{padding:15,borderRadius:14,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.018)"}}><strong>{s.flagged===true?`Die Prüfung hat mögliche Hinweise auf ${dict(CATEGORY,s.category??s.policy_category,"einen Regelverstoß")} erkannt.`:"Die automatische Prüfung hat kein eindeutiges Verbot erkannt."}</strong><div className="by-muted by-small" style={{marginTop:6}}>Quelle: {dict(SOURCE,s.provider??s.signal_type,"Automatische Prüfung")}</div></div>)}</>}
        </Card>

        <Card title="Was wurde bisher entschieden?" subtitle="Frühere automatische und menschliche Entscheidungen.">
          {detail.decision_events.length?detail.decision_events.map((e,i)=><div key={t(e.id,`e-${i}`)} style={{padding:16,borderRadius:14,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.018)"}}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><div><strong style={{fontSize:17}}>{dict(ACTION,e.action,"Entscheidung gespeichert")}</strong><div className="by-muted by-small" style={{marginTop:5}}>{dict(SOURCE,e.source,"System")} · {date(e.created_at)}</div></div><Badge value={e.action}/></div><details style={{marginTop:12}}><summary className="by-muted by-small" style={{cursor:"pointer"}}>Technische Details anzeigen</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:11,color:"#aeb4bf"}}>{pretty({reason_codes:e.reason_codes,metadata:e.metadata})}</pre></details></div>):<div className="by-muted">Noch keine Entscheidung gespeichert.</div>}
        </Card>

        <Card title="Technischer Prüfstatus" subtitle="Nur wichtig, falls etwas nicht automatisch verarbeitet werden konnte.">
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
            <div><h3>Textprüfung</h3>{detail.text_jobs.length?detail.text_jobs.map((j,i)=><div key={t(j.id,`t-${i}`)} style={{padding:13,border:"1px solid rgba(255,255,255,.07)",borderRadius:12,marginTop:8}}><Badge value={j.status}/>{j.last_error?<details style={{marginTop:10}}><summary className="by-muted by-small">Fehlerdetails</summary><div style={{marginTop:8,color:"#ff8585",fontSize:12}}>{t(j.last_error)}</div></details>:<div className="by-muted by-small" style={{marginTop:8}}>Textprüfung abgeschlossen.</div>}</div>):<div className="by-muted">Keine Textprüfung vorhanden.</div>}</div>
            <div><h3>Bildprüfung</h3>{detail.image_jobs.length?detail.image_jobs.map((j,i)=><div key={t(j.id,`i-${i}`)} style={{padding:13,border:"1px solid rgba(255,255,255,.07)",borderRadius:12,marginTop:8}}><Badge value={j.status}/><div className="by-muted by-small" style={{marginTop:8}}>Bild {n(j.image_index)+1}</div>{j.last_error?<details style={{marginTop:10}}><summary className="by-muted by-small">Warum nicht automatisch geprüft?</summary><div style={{marginTop:8,color:"#ffc36b",fontSize:12}}>{t(j.last_error)}</div></details>:null}</div>):<div className="by-muted">Keine Bildprüfung vorhanden.</div>}</div>
          </div>
        </Card>
      </main>

      <aside style={{display:"grid",gap:18}}>
        <Card title="Distribution" subtitle="Aktuelle reversible Sichtbarkeitsentscheidung und betroffene Produktflächen.">
          {distribution?.state?<>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
              <span className="by-muted">Aktueller Zustand</span>
              <Badge value={distribution.state.effective_state}/>
            </div>
            <div className="by-muted by-small">Policy: {t(distribution.policy?.rule_key,"Standardregel")} · {t(distribution.policy?.engine_version)}</div>
            <div className="by-muted by-small">Betroffene Flächen: {(distribution.affected_consumers??[]).join(", ")||"Keine öffentliche Verteilung"}</div>
            {(distribution.reasons??[]).map((reason,index)=><div key={t(reason.reason_code,`reason-${index}`)} style={{padding:12,borderRadius:12,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.018)"}}><strong>{t(reason.reason_code).replaceAll("_"," ")}</strong><div className="by-muted by-small" style={{marginTop:5}}>{t(reason.description)}</div></div>)}
          </>:<div className="by-muted">Noch keine Distribution-Auswertung vorhanden.</div>}
        </Card>
        <Card title="Deine Entscheidung" subtitle={integrityCase?"Entscheide anhand des Reviews, der Muster und des Kontexts. Ein Integrity-Signal ist keine automatische Verurteilung.":"Die automatische Empfehlung ist nur eine Hilfe. Entscheidend ist der sichtbare Zusammenhang."}>
          {(integrityCase?[["allow","Freigeben","Die Integritätshinweise reichen nach Prüfung nicht für eine Maßnahme."],["limit","Begrenzen","Die Bewertung bleibt sichtbar, wird aber wegen bestätigter Integritätsrisiken weniger stark verbreitet."],["temporary_hide","Vorübergehend ausblenden","Die Bewertung wird versteckt, bis der Integritätsfall geklärt ist."],["remove","Entfernen","Die Bewertung wird nach menschlicher Prüfung als manipulativ oder nicht authentisch entfernt."]]:[["allow","Freigeben","Der Inhalt ist im Kontext zulässig."],["limit","Begrenzen","Der Inhalt bleibt sichtbar, wird aber weniger stark verbreitet."],["temporary_hide","Vorübergehend ausblenden","Der Inhalt wird versteckt, bis der Fall geklärt ist."],["remove","Entfernen","Der Inhalt verstößt gegen die Richtlinien."]]).map(([value,title,desc])=><button key={value} type="button" onClick={()=>setDecision(value as Action)} style={{textAlign:"left",padding:15,borderRadius:14,border:decision===value?"1px solid rgba(255,79,139,.45)":"1px solid rgba(255,255,255,.08)",background:decision===value?"rgba(255,79,139,.1)":"rgba(255,255,255,.02)",color:"inherit",cursor:"pointer"}}><strong>{title}</strong><div className="by-muted by-small" style={{marginTop:5,lineHeight:1.45}}>{desc}</div></button>)}
          <textarea rows={5} value={decisionNote} onChange={e=>setDecisionNote(e.target.value)} placeholder="Begründe deine Entscheidung in einem verständlichen Satz …" style={{width:"100%",borderRadius:13,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.035)",color:"inherit",padding:13,font:"inherit"}}/>
          <button className="by-btn by-btn-blue" disabled={savingDecision||!decision||!decisionNote.trim()} onClick={()=>void saveDecision()}>{savingDecision?"Wird gespeichert …":"Entscheidung speichern"}</button>
        </Card>

        <Card title="Priorität" subtitle="Steuert, wie weit oben der Fall in der Warteschlange erscheint.">
          <input type="range" min={0} max={100} value={priority} onChange={e=>setPriority(Number(e.target.value))}/>
          <div style={{display:"flex",justifyContent:"space-between"}}><span className="by-muted">Niedrig</span><strong>{priority} von 100</strong><span className="by-muted">Dringend</span></div>
          <textarea rows={4} value={priorityNote} onChange={e=>setPriorityNote(e.target.value)} placeholder="Warum änderst du die Priorität?" style={{width:"100%",borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.035)",color:"inherit",padding:12,font:"inherit"}}/>
          <button className="by-btn by-btn-soft" disabled={savingPriority} onClick={()=>void savePriority()}>{savingPriority?"Wird gespeichert …":"Priorität aktualisieren"}</button>
        </Card>

        <Card title="Betroffener Nutzer">{actor?<><strong style={{fontSize:19}}>{t(actor.display_name)}</strong><div className="by-muted">@{t(actor.username)}</div><Link href={`/users?user=${t(actor.id)}`} className="by-btn by-btn-soft" style={{textDecoration:"none",textAlign:"center"}}>Nutzerprofil öffnen</Link></>:<div className="by-muted">Kein Nutzer zugeordnet.</div>}</Card>
        <Card title="Weitere Hinweise"><div><strong>{detail.reports.length}</strong> Meldungen</div><div><strong>{detail.appeals.length}</strong> Einsprüche</div><div className="by-muted by-small">Interne Erklärung: {t(c.explanation_internal,"Keine zusätzliche Erklärung gespeichert.")}</div></Card>
        <details className="by-card" style={{padding:18}}><summary style={{cursor:"pointer",fontWeight:800}}>Vollständige technische Falldaten</summary><pre style={{marginTop:14,whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:11,color:"#aeb4bf"}}>{pretty(detail)}</pre></details>
      </aside>
    </div>
  </div>;
}
