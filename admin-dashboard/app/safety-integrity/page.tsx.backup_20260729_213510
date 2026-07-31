"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SafetyIntegrityPage() {
  const [rows,setRows]=useState<any[]>([]);
  const [status,setStatus]=useState("needs_review");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);

  async function load(){
    setLoading(true); setError("");
    const {data,error}=await supabase.rpc("safety_admin_queue_v1",{p_status:status==="all"?null:status,p_limit:250});
    if(error)setError(error.message); else setRows(data??[]);
    setLoading(false);
  }
  useEffect(()=>{void load()},[status]);

  async function decide(caseId:string,action:string){
    const publicExplanation=window.prompt("Öffentliche Begründung (optional)")||null;
    const {error}=await supabase.rpc("safety_admin_decide_v1",{
      p_case_id:caseId,p_action:action,p_category:null,p_severity:null,p_confidence:null,
      p_public_explanation:publicExplanation,p_internal_explanation:null,p_reason_codes:[]
    });
    if(error)setError(error.message); else await load();
  }

  return <div className="by-page">
    <div className="by-header"><div><h1 className="by-title">Safety & Integrity</h1><div className="by-subtitle">Policy-versionierte Moderation, Human Review und Appeals.</div></div></div>
    <div className="by-card by-section"><div className="by-toolbar">
      <select className="by-select" value={status} onChange={e=>setStatus(e.target.value)}>
        <option value="needs_review">Needs Review</option><option value="queued">Queued</option>
        <option value="evaluating">Evaluating</option><option value="decided">Decided</option><option value="all">Alle</option>
      </select>
      <button className="by-btn by-btn-soft" onClick={()=>void load()}>Neu laden</button>
    </div></div>
    {error?<div className="by-card by-section" style={{color:"#ef4444"}}>{error}</div>:null}
    {loading?<div className="by-card by-section">Lädt…</div>:null}
    {!loading&&rows.map(row=><article className="by-card by-section" key={row.case_id}>
      <div className="by-row"><div><strong>{row.content_type}</strong><div className="by-muted by-small">{row.actor_name} · {row.locale||"Sprache offen"}</div></div>
      <span className="by-badge by-badge-yellow">{row.case_status}</span></div>
      {row.text_content?<div className="by-panel" style={{marginTop:14,whiteSpace:"pre-wrap"}}>{row.text_content}</div>:null}
      <div className="by-muted by-small" style={{marginTop:12}}>Kategorie: {row.final_category||"—"} · Severity: {row.final_severity??"—"} · Confidence: {row.final_confidence??"—"}</div>
      <div className="by-actions" style={{marginTop:14}}>
        <button className="by-btn by-btn-blue" onClick={()=>void decide(row.case_id,"allow")}>Erlauben</button>
        <button className="by-btn by-btn-soft" onClick={()=>void decide(row.case_id,"limit")}>Begrenzen</button>
        <button className="by-btn" style={{background:"#7f1d1d",color:"white"}} onClick={()=>void decide(row.case_id,"temporary_hide")}>Temporär ausblenden</button>
        <button className="by-btn" style={{background:"#450a0a",color:"white"}} onClick={()=>void decide(row.case_id,"remove")}>Entfernen</button>
      </div>
    </article>)}
  </div>
}
