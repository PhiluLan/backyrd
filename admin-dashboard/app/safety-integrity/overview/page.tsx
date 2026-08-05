"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Metrics = {
  cases?: { created?: number; decided?: number; needs_review?: number; average_resolution_hours?: number|null };
  decisions_by_action?: Record<string,number>;
  appeals?: { submitted?: number; open?: number; overturned?: number; modified?: number; upheld?: number };
  enforcements?: { active?: number; issued_in_period?: number };
};

function Card({label,value}:{label:string;value:string|number}) {
  return <section className="by-card" style={{padding:20}}>
    <div className="by-muted by-small">{label}</div>
    <strong style={{display:"block",fontSize:34,marginTop:8}}>{value}</strong>
  </section>;
}

export default function Page(){
  const [days,setDays]=useState(30);
  const [data,setData]=useState<Metrics|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    const from=new Date();from.setDate(from.getDate()-days);
    const r=await supabase.rpc("safety_admin_metrics_v1",{
      p_from:from.toISOString(),p_to:new Date().toISOString()
    });
    if(r.error){setError(r.error.message);setData(null);}
    else setData((r.data??{}) as Metrics);
    setLoading(false);
  },[days]);

  useEffect(()=>{void load();},[load]);

  const a=data?.appeals;
  const total=Number(a?.overturned??0)+Number(a?.modified??0)+Number(a?.upheld??0);
  const changed=Number(a?.overturned??0)+Number(a?.modified??0);
  const rate=total?Math.round(changed/total*100):0;

  return <div className="by-page" style={{maxWidth:1500,margin:"0 auto",padding:"32px 34px 70px"}}>
    <Link href="/safety-integrity" style={{color:"#aeb4bf",textDecoration:"none"}}>← Zur Moderationskonsole</Link>
    <header style={{margin:"25px 0",display:"flex",justifyContent:"space-between",gap:20,alignItems:"end",flexWrap:"wrap"}}>
      <div><div style={{color:"#ff4f8b",fontWeight:850}}>SAFETY & INTEGRITY</div>
      <h1 className="by-title">Qualität & Monitoring</h1>
      <p className="by-muted">Moderationsvolumen, Einsprüche, Bearbeitungsdauer und Kontomaßnahmen.</p></div>
      <select className="by-select" value={days} onChange={e=>setDays(Number(e.target.value))}>
        <option value={7}>7 Tage</option><option value={30}>30 Tage</option>
        <option value={90}>90 Tage</option><option value={365}>12 Monate</option>
      </select>
    </header>
    {error?<div className="by-card" style={{padding:18,color:"#ff8585"}}>{error}</div>:
    loading?<div className="by-card" style={{padding:22}}>Wird geladen …</div>:<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:14}}>
        <Card label="Neue Fälle" value={data?.cases?.created??0}/>
        <Card label="Entschieden" value={data?.cases?.decided??0}/>
        <Card label="Aktuell offen" value={data?.cases?.needs_review??0}/>
        <Card label="Ø Bearbeitungszeit" value={data?.cases?.average_resolution_hours==null?"—":`${data.cases.average_resolution_hours} h`}/>
        <Card label="Neue Einsprüche" value={a?.submitted??0}/>
        <Card label="Offene Einsprüche" value={a?.open??0}/>
        <Card label="Geänderte Einsprüche" value={`${rate}%`}/>
        <Card label="Aktive Kontomaßnahmen" value={data?.enforcements?.active??0}/>
      </div>
      <section className="by-card" style={{padding:22,marginTop:18}}>
        <h2>Entscheidungen nach Aktion</h2>
        {Object.entries(data?.decisions_by_action??{}).map(([k,v])=>
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:10,borderBottom:"1px solid rgba(255,255,255,.06)"}}>
            <span>{k.replaceAll("_"," ")}</span><strong>{v}</strong>
          </div>)}
      </section>
      <Link href="/safety-integrity/enforcement" className="by-btn by-btn-primary"
        style={{display:"inline-flex",marginTop:18,textDecoration:"none"}}>
        Verwarnungen & Kontomaßnahmen
      </Link>
    </>}
  </div>;
}
