"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { dateTime, number, rangeFor, type Preset } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";

type UserRow = { user_id:string; email:string|null; display_name:string|null; username:string|null; avatar_url:string|null; city:string|null; registered_at:string; last_active_at:string|null; activated:boolean; sessions:number; screen_views:number; spot_opens:number; decisions:number; reviews:number; platform:string|null; app_version:string|null };
type Response = { summary:{registered:number; active:number; activated:number; sessions:number}; users:UserRow[]; total:number };
export default function UsersPage(){
 const [preset,setPreset]=useState<Preset>("month"); const [data,setData]=useState<Response|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [search,setSearch]=useState("");
 useEffect(()=>{let dead=false;(async()=>{setLoading(true);setError("");const r=rangeFor(preset);const {data,error}=await supabase.rpc("admin_users_intelligence_v1",{p_from:r.from,p_to:r.to,p_limit:500,p_offset:0,p_search:null});if(dead)return;if(error){setError(error.message);setData(null)}else setData(data as Response);setLoading(false)})();return()=>{dead=true}},[preset]);
 const rows=useMemo(()=>{const q=search.trim().toLowerCase();return (data?.users??[]).filter(u=>!q||[u.display_name,u.username,u.email,u.city,u.user_id].filter(Boolean).join(" ").toLowerCase().includes(q))},[data,search]);
 return <div className="bi-page"><header className="bi-header"><div><div className="bi-eyebrow">Audience intelligence</div><h1>Users</h1><p>Aktivierung, Nutzung und Wertbeitrag jedes einzelnen Nutzers.</p></div><DateRangeSelector value={preset} onChange={setPreset}/></header>
 {error&&<div className="bi-error">{error}</div>}{loading&&<div className="bi-state">Nutzer werden analysiert …</div>}{data&&<>
 <section className="bi-kpiGrid"><K label="Registriert" value={data.summary.registered}/><K label="Aktiv im Zeitraum" value={data.summary.active}/><K label="Aktiviert" value={data.summary.activated}/><K label="Sessions" value={data.summary.sessions}/></section>
 <section className="bi-card"><div className="bi-tableToolbar"><input className="bi-input" placeholder="Name, E-Mail, Stadt oder UUID suchen …" value={search} onChange={e=>setSearch(e.target.value)}/><span>{rows.length} Nutzer</span></div><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>User</th><th>Status</th><th>Letzte Aktivität</th><th>Sessions</th><th>Screens</th><th>Spots</th><th>Decisions</th><th>Reviews</th><th></th></tr></thead><tbody>{rows.map(u=><tr key={u.user_id}><td><div className="bi-person">{u.avatar_url?<img src={u.avatar_url} alt=""/>:<i/>}<div><strong>{u.display_name||u.username||u.email||"Backyrd User"}</strong><small>{u.email||u.user_id}</small></div></div></td><td><span className={`bi-badge ${u.activated?"success":"muted"}`}>{u.activated?"Aktiviert":"Nicht aktiviert"}</span></td><td>{dateTime(u.last_active_at)}</td><td>{number(u.sessions)}</td><td>{number(u.screen_views)}</td><td>{number(u.spot_opens)}</td><td>{number(u.decisions)}</td><td>{number(u.reviews)}</td><td><Link className="bi-action" href={`/users/${u.user_id}?from=${encodeURIComponent(rangeFor(preset).from)}&to=${encodeURIComponent(rangeFor(preset).to)}`}>Details →</Link></td></tr>)}</tbody></table></div></section></>}
 </div>;
}
function K({label,value}:{label:string;value:number}){return <div className="bi-kpi"><span>{label}</span><strong>{number(value)}</strong><div/></div>}
