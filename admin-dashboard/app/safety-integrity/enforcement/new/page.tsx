"use client";
import Link from "next/link";
import { useMemo,useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const options=[
["information","Hinweis",false],["warning","Verwarnung",false],["strike","Strike",false],
["posting_restriction","Posting-Sperre",true],["commenting_restriction","Kommentar-Sperre",true],
["messaging_restriction","Nachrichten-Sperre",true],["owner_edit_restriction","Owner-Sperre",true],
["temporary_suspension","Temporäre Kontosperre",true],["permanent_suspension","Dauerhafte Kontosperre",false]
] as const;
type EnforcementType=(typeof options)[number][0];
type EnforcementResult=Record<string,unknown>;

export default function Page(){
 const [userId,setUserId]=useState(""),[caseId,setCaseId]=useState("");
 const [type,setType]=useState<(typeof options)[number][0]>("warning");
 const [reason,setReason]=useState("HUMAN_ADMIN_ENFORCEMENT");
 const [publicText,setPublicText]=useState(""),[internal,setInternal]=useState("");
 const [endsAt,setEndsAt]=useState(""),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[result,setResult]=useState<EnforcementResult|null>(null);
 const selected=useMemo(()=>options.find(x=>x[0]===type)??options[1],[type]);

 async function submit(){
  setError("");setResult(null);
  if(!userId.trim())return setError("User-ID fehlt.");
  if(!publicText.trim())return setError("Begründung fehlt.");
  const end=endsAt?new Date(endsAt):null;
  if(selected[2]&&(!end||Number.isNaN(end.getTime())))return setError("Gültiges Enddatum erforderlich.");
  setSaving(true);
  const r=await supabase.rpc("safety_admin_issue_enforcement_v1",{
   p_user_id:userId.trim(),p_case_id:caseId.trim()||null,p_enforcement_type:type,
   p_reason_code:reason.trim()||"HUMAN_ADMIN_ENFORCEMENT",
   p_public_explanation:publicText.trim(),p_internal_note:internal.trim()||null,
   p_ends_at:selected[2]?end!.toISOString():null,
   p_metadata:{source_surface:"admin_safety_enforcement_new",issued_manually:true}
  });
  setSaving(false);
  if(r.error)return setError("Die Kontomaßnahme konnte nicht gespeichert werden.");
  setResult(r.data);
 }

 const input={width:"100%",borderRadius:12,border:"1px solid rgba(255,255,255,.1)",
 background:"rgba(255,255,255,.035)",color:"inherit",padding:"11px 13px",font:"inherit"} as React.CSSProperties;

 return <div className="by-page" style={{maxWidth:900,margin:"0 auto",padding:"32px 34px 70px"}}>
  <Link href="/safety-integrity/enforcement" style={{color:"#aeb4bf",textDecoration:"none"}}>← Zurück</Link>
  <header style={{margin:"25px 0"}}><div style={{color:"#ff4f8b",fontWeight:850}}>HUMAN ENFORCEMENT ONLY</div>
  <h1 className="by-title">Maßnahme aussprechen</h1></header>
  <section className="by-card" style={{padding:22,display:"grid",gap:18}}>
   <label>User-ID<input style={input} value={userId} onChange={e=>setUserId(e.target.value)}/></label>
   <label>Fall-ID optional<input style={input} value={caseId} onChange={e=>setCaseId(e.target.value)}/></label>
   <label>Maßnahme<select className="by-select" value={type} onChange={e=>setType(e.target.value as EnforcementType)}>
    {options.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}
   </select></label>
   {selected[2]?<label>Ende<input type="datetime-local" style={input} value={endsAt} onChange={e=>setEndsAt(e.target.value)}/></label>:null}
   <label>Reason Code<input style={input} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <label>Begründung für Nutzer<textarea rows={5} style={input} value={publicText} onChange={e=>setPublicText(e.target.value)}/></label>
   <label>Interne Notiz<textarea rows={4} style={input} value={internal} onChange={e=>setInternal(e.target.value)}/></label>
   {error?<div style={{color:"#ff9b9b"}}>{error}</div>:null}
   {result?<div><strong>Gespeichert</strong><pre>{JSON.stringify(result,null,2)}</pre></div>:null}
   <button className="by-btn by-btn-primary" disabled={saving} onClick={()=>void submit()}>
    {saving?"Speichert …":"Maßnahme verbindlich aussprechen"}
   </button>
  </section>
 </div>;
}
