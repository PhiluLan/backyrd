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

  async function load() {
    setLoading(true); setError("");
    const {data,error}=await supabase.rpc("safety_admin_case_detail_v1",{p_case_id:caseId});
    if(error){setError(error.message);setDetail(null);} else {const d=data as Detail;setDetail(d);setPriority(n(d.case.priority));}
    setLoading(false);
  }
  useEffect(()=>{if(caseId) void load();},[caseId]);

  async function savePriority(){
    setSavingPriority(true);setError("");
    const {error}=await supabase.rpc("safety_admin_set_case_priority_v1",{p_case_id:caseId,p_priority:priority,p_internal_note:priorityNote.trim()||null});
    setSavingPriority(false); if(error){setError(error.message);return;} setPriorityNote(""); await load();
  }
  async function saveDecision(){
    if(!detail||!decision||!decisionNote.trim()) return;
    setSavingDecision(true);setError("");
    const rpc=t(detail.content.entity_type,"")==="spot_owner_change"?"safety_admin_decide_v1":"safety_admin_decide_user_content_v1";
    const {error}=await supabase.rpc(rpc,{p_case_id:caseId,p_action:decision,p_category:detail.case.final_category??null,p_severity:detail.case.final_severity??null,p_confidence:detail.case.final_confidence===null?null:Number(detail.case.final_confidence),p_public_explanation:decisionNote.trim(),p_internal_explanation:"Menschliche Entscheidung in der Backyrd Safety-Konsole.",p_reason_codes:["HUMAN_REVIEW",`HUMAN_ACTION_${decision.toUpperCase()}`]});
    setSavingDecision(false); if(error){setError(error.message);return;} setDecision(null);setDecisionNote("");await load();
  }

  if(loading) return <div className="by-page"><div className="by-card by-section">Moderationsfall wird geladen …</div></div>;
  if(!detail) return <div className="by-page"><Link href="/safety-integrity">← Zurück</Link><div className="by-card by-section" style={{marginTop:18,color:"#ff8585"}}>{error||"Fall nicht gefunden"}</div></div>;

  const c=detail.case, content=detail.content, actor=detail.actor;
  const body=t(content.text_content,"Kein Textinhalt vorhanden.");
  const sev=severity(c.final_severity);
  const cat=dict(CATEGORY,c.final_category,"Kein eindeutiger Verstoß");
  const images=Array.isArray(content.image_urls)?content.image_urls as unknown[]:[];
  const why=n(c.final_severity)>=3?`Die automatische Prüfung vermutet ${cat.toLowerCase()}, konnte den Zusammenhang aber nicht sicher beurteilen.`:"Die automatische Prüfung hat keinen eindeutigen schweren Regelverstoß erkannt.";

  return <div className="by-page" style={{padding:"32px 34px 60px",maxWidth:1500,margin:"0 auto"}}>
    <Link href="/safety-integrity" style={{color:"#aeb4bf",textDecoration:"none",fontWeight:750}}>← Zurück zur Moderationskonsole</Link>
    <header style={{margin:"24px 0"}}><div style={{color:"#ff4f8b",fontSize:13,fontWeight:850,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Moderationsfall</div><h1 className="by-title" style={{margin:0,fontSize:"clamp(36px,4vw,54px)"}}>{body.split("\n")[0]||"Inhalt prüfen"}</h1><p className="by-muted" style={{margin:"12px 0 0",maxWidth:800}}>Prüfe den Inhalt im Zusammenhang und entscheide, ob er sichtbar bleiben darf.</p></header>
    {error?<div className="by-card" style={{padding:16,marginBottom:18,color:"#ff8585"}}>{error}</div>:null}

    <section className="by-card" style={{padding:22,marginBottom:18,display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,background:"linear-gradient(135deg,rgba(255,79,139,.08),rgba(255,255,255,.02))"}}>
      {[["Status",dict(STATUS,c.case_status)],["Dringlichkeit",sev.label],["Vermutetes Thema",cat],["System-Empfehlung",dict(ACTION,c.final_action)]].map(([a,b])=><div key={a} style={{padding:15,borderRadius:15,background:"rgba(0,0,0,.2)",border:"1px solid rgba(255,255,255,.07)"}}><div className="by-muted by-small">{a}</div><strong style={{display:"block",marginTop:7,fontSize:17,lineHeight:1.35}}>{b}</strong></div>)}
    </section>

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.45fr) minmax(340px,.72fr)",gap:18,alignItems:"start"}}>
      <main style={{display:"grid",gap:18}}>
        <Card title="Was wurde veröffentlicht?" subtitle="Das ist der Inhalt, den Nutzer in Backyrd sehen.">
          <div style={{padding:20,borderRadius:17,background:"rgba(0,0,0,.24)",border:"1px solid rgba(255,255,255,.07)",fontSize:18,lineHeight:1.65,whiteSpace:"pre-wrap"}}>{body}</div>
          {images.length?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>{images.map((img,i)=>{const ref=t(img);return ref.startsWith("https://")?<a key={ref+i} href={ref} target="_blank" rel="noreferrer"><img src={ref} alt={`Zu prüfendes Bild ${i+1}`} style={{display:"block",width:"100%",height:320,objectFit:"contain",background:"#070708",borderRadius:16}}/></a>:<div key={ref+i} className="by-muted" style={{padding:18,border:"1px dashed rgba(255,255,255,.1)",borderRadius:14}}>Geschütztes Bild – kann hier noch nicht direkt angezeigt werden.</div>})}</div>:<div className="by-muted">Dieser Inhalt enthält keine Bilder.</div>}
        </Card>

        <Card title="Warum wurde der Fall markiert?" subtitle="Eine verständliche Zusammenfassung der automatischen Prüfung.">
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(220px,.4fr)",gap:14}}>
            <div style={{padding:18,borderRadius:16,border:`1px solid ${sev.color}33`,background:`${sev.color}0d`}}><strong style={{display:"block",fontSize:19,color:sev.color,marginBottom:8}}>{sev.label}e Auffälligkeit</strong><div style={{lineHeight:1.6}}>{why}</div><div className="by-muted" style={{marginTop:10}}>{sev.text}</div></div>
            <div style={{padding:18,borderRadius:16,background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.07)"}}><div className="by-muted by-small">Sicherheit der Einschätzung</div><strong style={{display:"block",marginTop:7,fontSize:27}}>{Math.round(n(c.final_confidence)*100)}%</strong><div className="by-muted by-small" style={{marginTop:5}}>Das ist die Sicherheit der automatischen Einordnung, keine Schuldzuweisung.</div></div>
          </div>
          {detail.signals.map((s,i)=><div key={t(s.id,`signal-${i}`)} style={{padding:15,borderRadius:14,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.018)"}}><strong>{s.flagged===true?`Die Prüfung hat mögliche Hinweise auf ${dict(CATEGORY,s.category??s.policy_category,"einen Regelverstoß")} erkannt.`:"Die automatische Prüfung hat kein eindeutiges Verbot erkannt."}</strong><div className="by-muted by-small" style={{marginTop:6}}>Quelle: {dict(SOURCE,s.provider??s.signal_type,"Automatische Prüfung")}</div></div>)}
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
        <Card title="Deine Entscheidung" subtitle="Die automatische Empfehlung ist nur eine Hilfe. Entscheidend ist der sichtbare Zusammenhang.">
          {([["allow","Freigeben","Der Inhalt ist im Kontext zulässig."],["limit","Begrenzen","Der Inhalt bleibt sichtbar, wird aber weniger stark verbreitet."],["temporary_hide","Vorübergehend ausblenden","Der Inhalt wird versteckt, bis der Fall geklärt ist."],["remove","Entfernen","Der Inhalt verstößt gegen die Richtlinien."]] as const).map(([value,title,desc])=><button key={value} type="button" onClick={()=>setDecision(value)} style={{textAlign:"left",padding:15,borderRadius:14,border:decision===value?"1px solid rgba(255,79,139,.45)":"1px solid rgba(255,255,255,.08)",background:decision===value?"rgba(255,79,139,.1)":"rgba(255,255,255,.02)",color:"inherit",cursor:"pointer"}}><strong>{title}</strong><div className="by-muted by-small" style={{marginTop:5,lineHeight:1.45}}>{desc}</div></button>)}
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
