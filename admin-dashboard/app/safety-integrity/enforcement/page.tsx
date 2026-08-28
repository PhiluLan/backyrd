"use client";
import Link from "next/link";
import { useCallback,useEffect,useMemo,useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Row={enforcement_id:string;user_id:string;user_name:string;case_id:string|null;
enforcement_type:string;status:string;reason_code:string;public_explanation:string;
internal_note:string|null;starts_at:string;ends_at:string|null;created_at:string};

const labels:Record<string,string>={
 information:"Hinweis",warning:"Verwarnung",strike:"Strike",
 posting_restriction:"Posting-Sperre",commenting_restriction:"Kommentar-Sperre",
 messaging_restriction:"Nachrichten-Sperre",owner_edit_restriction:"Owner-Sperre",
 temporary_suspension:"Temporäre Kontosperre",permanent_suspension:"Dauerhafte Kontosperre"
};
const date=(v:string|null)=>v?new Date(v).toLocaleString("de-CH"):"Unbefristet";

export default function Page(){
 const [rows,setRows]=useState<Row[]>([]),[status,setStatus]=useState("active");
 const [search,setSearch]=useState(""),[error,setError]=useState("");
 const [loading,setLoading]=useState(true),[working,setWorking]=useState<string|null>(null);

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const r=await supabase.rpc("safety_admin_enforcements_v1",{
   p_status:status,p_limit:1000
  });
  if(r.error){setError("Kontomaßnahmen konnten nicht geladen werden.");setRows([]);} else setRows((r.data??[]) as Row[]);
  setLoading(false);
 },[status]);
 useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);

 const shown=useMemo(()=>{const q=search.trim().toLowerCase();
  return q?rows.filter(r=>[r.user_name,r.user_id,r.case_id,r.enforcement_type,
   r.reason_code,r.public_explanation].filter(Boolean).join(" ").toLowerCase().includes(q)):rows;
 },[rows,search]);

 async function revoke(row:Row){
  const reason=window.prompt("Warum wird die Maßnahme aufgehoben?");
  if(!reason?.trim())return;
  setWorking(row.enforcement_id);setError("");
  const r=await supabase.rpc("safety_admin_revoke_enforcement_v1",{
   p_enforcement_id:row.enforcement_id,p_reason:reason.trim()
  });
  setWorking(null);if(r.error){setError("Die Maßnahme konnte nicht aufgehoben werden.");return;}await load();
 }

 return <div className="by-page" style={{maxWidth:1500,margin:"0 auto",padding:"32px 34px 70px"}}>
  <Link href="/safety-integrity" style={{color:"#aeb4bf",textDecoration:"none"}}>← Zur Moderationskonsole</Link>
  <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 18,
          marginBottom: 8,
        }}
      >
        <Link
          href="/safety-integrity/enforcement/new"
          className="by-btn by-btn-primary"
          style={{ textDecoration: "none" }}
        >
          Neue Maßnahme aussprechen
        </Link>
      </div>

      <header style={{margin:"25px 0"}}><div style={{color:"#ff4f8b",fontWeight:850}}>HUMAN ENFORCEMENT ONLY</div>
  <h1 className="by-title">Verwarnungen & Kontomaßnahmen</h1>
  <p className="by-muted">Automatische Signale erstellen niemals selbstständig Strikes oder Kontosperren.</p></header>
  <section className="by-card" style={{padding:14,display:"grid",gridTemplateColumns:"1fr auto",gap:10,marginBottom:18}}>
   <input value={search} onChange={e=>setSearch(e.target.value)}
    placeholder="Nutzer, Fall-ID oder Maßnahme suchen …"
    style={{borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.035)",color:"inherit",padding:"11px 13px"}}/>
   <select className="by-select" value={status} onChange={e=>setStatus(e.target.value)}>
    <option value="active">Aktiv</option><option value="expired">Abgelaufen</option>
    <option value="revoked">Aufgehoben</option><option value="all">Alle</option>
   </select>
  </section>
  {error?<div className="by-card" style={{padding:16,color:"#ff8585"}}>{error}</div>:null}
  {loading?<div className="by-card" style={{padding:22}}>Wird geladen …</div>:
   <div style={{display:"grid",gap:13}}>{shown.map(r=>
    <article key={r.enforcement_id} className="by-card" style={{padding:20}}>
     <div style={{display:"flex",justifyContent:"space-between",gap:16}}>
      <div><div className="by-muted by-small">{r.user_name}</div>
      <h2 style={{margin:"6px 0"}}>{labels[r.enforcement_type]??r.enforcement_type}</h2></div>
      <strong>{r.status}</strong>
     </div>
     <p>{r.public_explanation}</p>
     <div className="by-muted by-small">Beginn: {date(r.starts_at)} · Ende: {date(r.ends_at)} · {r.reason_code}</div>
     {r.case_id?<Link href={`/safety-integrity/${r.case_id}`} style={{color:"#ff7da7"}}>Fall öffnen</Link>:null}
     {r.status==="active"?<button className="by-btn by-btn-soft" style={{marginTop:14}}
      disabled={working===r.enforcement_id} onClick={()=>void revoke(r)}>
      {working===r.enforcement_id?"Wird aufgehoben …":"Maßnahme aufheben"}</button>:null}
    </article>)}</div>}
 </div>;
}
