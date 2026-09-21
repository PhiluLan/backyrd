"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dateTime, number } from "@/lib/intelligence";
import { type CockpitList, profileLabel } from "@/lib/userIntelligenceCockpit";

const REFRESH_MS = 15_000;

export default function UserIntelligenceCockpit() {
  const [data,setData]=useState<CockpitList|null>(null);
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");

  const load=useCallback(async(silent=false)=>{
    if(silent)setRefreshing(true);else setLoading(true);
    setError("");
    const {data,error}=await supabase.rpc("backyrd_admin_user_intelligence_cockpit_list_v1",{p_search:null,p_limit:500,p_offset:0});
    if(error)setError(error.message);else setData(data as CockpitList);
    setLoading(false);setRefreshing(false);
  },[]);

  useEffect(()=>{const kickoff=window.setTimeout(()=>void load(),0);const timer=window.setInterval(()=>void load(true),REFRESH_MS);const visible=()=>{if(document.visibilityState==="visible")void load(true)};document.addEventListener("visibilitychange",visible);return()=>{window.clearTimeout(kickoff);window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)}},[load]);
  const users=useMemo(()=>{const q=search.trim().toLowerCase();return(data?.users??[]).filter(user=>!q||[user.display_name,user.username,user.email,user.city,user.user_id,user.profile_state].filter(Boolean).join(" ").toLowerCase().includes(q))},[data,search]);

  return <div className="bi-page ui-cockpit">
    <header className="ui-hero"><div><div className="bi-eyebrow">Canonical User Intelligence</div><h1>User Intelligence Cockpit</h1><p>Was Backyrd über Geschmack lernt, warum es das lernt – und wo belastbare Evidenz noch fehlt.</p></div><div className="ui-live"><i/><div><strong>{refreshing?"Aktualisiert …":"Live verbunden"}</strong><span>{data?`Stand ${dateTime(data.generatedAt)}`:"Warte auf Daten"}</span></div><button onClick={()=>void load(true)} aria-label="Jetzt aktualisieren">↻</button></div></header>
    {error&&<div className="bi-error">Cockpit nicht verfügbar: {error}</div>}{loading&&<div className="bi-state">Kanonische Profile werden geladen …</div>}
    {data&&<>
      <section className="ui-kpis"><Metric label="Nutzer" value={data.summary.users}/><Metric label="Consent aktiv" value={data.summary.consented}/><Metric label="Profile vorhanden" value={data.summary.withProfile}/><Metric label="Belastbare Profile" value={data.summary.established}/><Metric label="Memory-Ereignisse" value={data.summary.memoryEvents}/><Metric label="Profiländerungen" value={data.summary.profileChanges}/></section>
      <section className="ui-panel"><div className="ui-toolbar"><div><span className="bi-kicker">Population</span><h2>Profil-Landkarte</h2></div><div className="ui-search"><span>⌕</span><input placeholder="Name, E-Mail, Stadt, UUID oder Status …" value={search} onChange={event=>setSearch(event.target.value)}/><b>{users.length}</b></div></div>
        <div className="ui-userGrid">{users.map(user=><Link className="ui-userCard" href={`/user-intelligence/${user.user_id}`} key={user.user_id}><div className="ui-userTop">{user.avatar_url?<Image src={user.avatar_url} alt="" width={42} height={42} unoptimized/>:<div className="ui-avatar">{(user.display_name||user.username||user.email||"B").slice(0,1).toUpperCase()}</div>}<div><strong>{user.display_name||user.username||user.email||"Backyrd User"}</strong><span>{user.city||"Ort unbekannt"}</span></div><em className={`ui-state ${user.profile_state.toLowerCase()}`}>{profileLabel(user.profile_state)}</em></div><div className="ui-score"><div><span style={{width:`${user.coverage_score}%`}}/></div><b>{user.coverage_score}%</b></div><dl><div><dt>Taste-Knoten</dt><dd>{number(user.node_count??0)}</dd></div><div><dt>Decisions</dt><dd>{number(user.decision_count)}</dd></div><div><dt>Learning</dt><dd>{number(user.product_learning_count)}</dd></div><div><dt>Änderungen</dt><dd>{number(user.profile_change_count)}</dd></div></dl><footer><span>{user.consent_status==="granted"?"Consent aktiv":"Keine Verarbeitung"}</span><span>{dateTime(user.last_intelligence_activity)}</span></footer></Link>)}</div>
        {users.length===0&&<div className="bi-empty">Keine Nutzer entsprechen diesem Filter.</div>}
      </section>
    </>}
  </div>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="ui-metric"><span>{label}</span><strong>{number(value)}</strong></div>}
