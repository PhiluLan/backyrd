"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {DateRangeSelector} from "@/components/intelligence/DateRangeSelector";
import {dateTime,number,rangeFor,type Preset} from "@/lib/intelligence";
import {supabase} from "@/lib/supabaseClient";

type ErrorGroup={fingerprint:string;message:string;error_type:string|null;status:string;severity:string;occurrences:number;users:number;screen_name:string|null;app_version:string|null;last_seen_at:string};
type ErrorsData={summary:{occurrences:number;groups:number;affected_users:number;fatal:number};groups:ErrorGroup[]};

export default function ErrorsPage(){
  const[preset,setPreset]=useState<Preset>("month"),[data,setData]=useState<ErrorsData|null>(null),[status,setStatus]=useState("all"),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{let cancelled=false;void(async()=>{setLoading(true);const range=rangeFor(preset);const result=await supabase.rpc("admin_errors_intelligence_v1",{p_from:range.from,p_to:range.to,p_limit:300});if(cancelled)return;if(result.error){setError("Fehlerdaten konnten nicht geladen werden.");setData(null)}else{setError("");setData(result.data as ErrorsData)}setLoading(false)})();return()=>{cancelled=true}},[preset]);
  const rows=useMemo(()=>status==="all"?(data?.groups||[]):(data?.groups||[]).filter((group)=>group.status===status),[data,status]);
  return <div className="bi-page"><header className="bi-header"><div><div className="bi-eyebrow">Produktstabilität</div><h1>Fehler</h1><p>Fehlergruppen, betroffene Nutzer und Release-Qualität.</p></div><DateRangeSelector value={preset} onChange={setPreset}/></header>{error&&<div className="bi-error">{error}</div>}{loading&&<div className="bi-state">Fehler werden gruppiert …</div>}{data&&<><section className="bi-kpiGrid"><K l="Vorkommnisse" v={data.summary.occurrences}/><K l="Fehlergruppen" v={data.summary.groups}/><K l="Betroffene Nutzer" v={data.summary.affected_users}/><K l="Kritisch" v={data.summary.fatal}/></section><section className="bi-card"><div className="bi-tableToolbar"><select className="bi-select" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">Alle Status</option><option value="open">Offen</option><option value="watching">Beobachten</option><option value="resolved">Gelöst</option></select><span>{rows.length} Gruppen</span></div><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Fehler</th><th>Status</th><th>Schwere</th><th>Vorkommnisse</th><th>Nutzer</th><th>Bereich</th><th>Version</th><th>Zuletzt</th><th></th></tr></thead><tbody>{rows.map((group)=><tr key={group.fingerprint}><td><strong>{group.message}</strong><small>{group.error_type}</small></td><td><span className={`bi-badge ${group.status==="resolved"?"success":group.status==="watching"?"warning":"danger"}`}>{group.status}</span></td><td>{group.severity}</td><td>{number(group.occurrences)}</td><td>{number(group.users)}</td><td>{group.screen_name||"—"}</td><td>{group.app_version||"—"}</td><td>{dateTime(group.last_seen_at)}</td><td><Link className="bi-action" href={`/errors/${encodeURIComponent(group.fingerprint)}`}>Details →</Link></td></tr>)}</tbody></table></div></section></>}</div>;
}
function K({l,v}:{l:string;v:number}){return <div className="bi-kpi"><span>{l}</span><strong>{number(v)}</strong><div/></div>}
