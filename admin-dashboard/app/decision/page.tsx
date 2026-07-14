"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { number, rangeFor, type Preset } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";

type Row={query:string;sessions:number;impressions:number;likes:number;dislikes:number;opens:number;empty_results:number};
type Spot={spot_id:string;name:string|null;impressions:number;likes:number;dislikes:number;opens:number};
type Session={decision_id:string|null;started_at:string;user_id:string|null;query:string|null;input_mode:string|null;model_version:string|null;impressions:number;likes:number;dislikes:number;opens:number;remixes:number;empty_results:number};
type Data={summary:{sessions:number;unique_users:number;impressions:number;likes:number;dislikes:number;opens:number;remixes:number;empty_results:number};queries:Row[];spots:Spot[];models:any[];sessions:Session[]};
const pct=(a:number,b:number)=>b?`${number(a*100/b,1)}%`:"0%";
export default function DecisionPage(){
 const [preset,setPreset]=useState<Preset>("month"),[data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let dead=false;(async()=>{setLoading(true);setError("");const r=rangeFor(preset);const {data,error}=await supabase.rpc("admin_decision_intelligence_v1",{p_from:r.from,p_to:r.to,p_limit:100});if(dead)return;if(error){setError(error.message);setData(null)}else setData(data as Data);setLoading(false)})();return()=>{dead=true}},[preset]);
 const s=data?.summary; const quality=useMemo(()=>s?pct(s.likes,s.likes+s.dislikes):"0%",[s]);
 return <div className="bi-page"><header className="bi-header"><div><div className="bi-eyebrow">Decision intelligence</div><h1>Decision</h1><p>Qualität, Conversion und Lernsignale deiner Recommendation Engine.</p></div><DateRangeSelector value={preset} onChange={setPreset}/></header>
 {error&&<div className="bi-error">{error}</div>}{loading&&<div className="bi-state">Decision-Daten werden analysiert …</div>}{data&&<>
 <section className="bi-kpiGrid"><K l="Sessions" v={s!.sessions}/><K l="Impressions" v={s!.impressions}/><K l="CTR" v={pct(s!.opens,s!.impressions)}/><K l="Positive Rate" v={quality}/><K l="Remixes" v={s!.remixes}/><K l="Empty Results" v={s!.empty_results}/><K l="Likes" v={s!.likes}/><K l="Dislikes" v={s!.dislikes}/></section>
 <div className="bi-grid2"><section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Search intent</div><h2>Query Performance</h2></div></div><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Query</th><th>Sessions</th><th>Impr.</th><th>CTR</th><th>Positive</th><th>Empty</th></tr></thead><tbody>{data.queries.map((q,i)=><tr key={`${q.query}-${i}`}><td><strong>{q.query}</strong></td><td>{number(q.sessions)}</td><td>{number(q.impressions)}</td><td>{pct(q.opens,q.impressions)}</td><td>{pct(q.likes,q.likes+q.dislikes)}</td><td>{number(q.empty_results)}</td></tr>)}</tbody></table></div></section>
 <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Recommendation</div><h2>Top Spots</h2></div></div><div className="bi-list">{data.spots.map((x,i)=><div className="bi-listRow" key={x.spot_id}><div><strong>{i+1}. {x.name||"Unbekannter Spot"}</strong><small>{number(x.impressions)} Impressions · {number(x.likes)} Likes</small></div><b>{pct(x.opens,x.impressions)} CTR</b></div>)}</div></section></div>
 <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Drilldown</div><h2>Letzte Decision Sessions</h2></div></div><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Zeit</th><th>Query</th><th>Modell</th><th>Impressions</th><th>Likes</th><th>Opens</th><th></th></tr></thead><tbody>{data.sessions.map((x,i)=><tr key={`${x.decision_id}-${i}`}><td>{new Date(x.started_at).toLocaleString("de-CH")}</td><td>{x.query||"—"}</td><td>{x.model_version||"—"}</td><td>{number(x.impressions)}</td><td>{number(x.likes)}</td><td>{number(x.opens)}</td><td>{x.decision_id?<Link className="bi-action" href={`/decision/${x.decision_id}`}>Details →</Link>:"—"}</td></tr>)}</tbody></table></div></section>
 </>}</div>;
}
function K({l,v}:{l:string;v:string|number}){return <div className="bi-kpi"><span>{l}</span><strong>{typeof v==="number"?number(v):v}</strong><div/></div>}
