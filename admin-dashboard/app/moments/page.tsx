"use client";

import { useEffect, useMemo, useState } from "react";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { number, rangeFor, type Preset } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";

type Summary = { posts:number; creators:number; likes:number; comments:number; saves:number; shares:number; feed_users:number; feed_events:number; engagement_rate:number };
type Daily = { metric_day:string; posts:number; likes:number; comments:number; saves:number; shares:number; active_users:number };
type TopPost = { post_id:string; creator_name:string; caption:string|null; created_at:string; like_count:number; comment_count:number; save_count:number; shares:number; engagement_score:number; spot_name:string|null; status:string; visibility:string; source_type:string };
type Creator = { user_id:string; creator_name:string; posts:number; likes:number; comments:number; saves:number; engagement_score:number };
type FeedMode = { feed_mode:string; events:number; users:number };
type EventType = { event_type:string; events:number; users:number };
type MomentsData = { summary:Summary; daily:Daily[]; top_posts:TopPost[]; creators:Creator[]; feed_modes:FeedMode[]; event_types:EventType[] };

export default function MomentsPage(){
  const [preset,setPreset]=useState<Preset>("month");
  const [data,setData]=useState<MomentsData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{ let cancelled=false; (async()=>{ setLoading(true); setError(""); const range=rangeFor(preset); const {data:result,error:rpcError}=await supabase.rpc("admin_moments_intelligence_v1",{p_from:range.from,p_to:range.to}); if(cancelled)return; if(rpcError){setError(rpcError.message);setData(null)}else setData(result as MomentsData); setLoading(false) })(); return()=>{cancelled=true}},[preset]);

  const maxDaily=useMemo(()=>Math.max(1,...(data?.daily??[]).map(d=>Math.max(d.posts,d.likes,d.comments,d.saves,d.shares))),[data]);

  return <div className="bi-page">
    <header className="bi-header"><div><div className="bi-eyebrow">Community intelligence</div><h1>Moments</h1><p>Content, Creator und Community-Gesundheit in einem Blick.</p></div><DateRangeSelector value={preset} onChange={setPreset}/></header>
    {error&&<div className="bi-error">{error}</div>}
    {loading&&<div className="bi-state">Community-Daten werden berechnet …</div>}
    {data&&<>
      <section className="bi-kpiGrid bi-momentsKpis">
        <Metric label="Moments" value={data.summary.posts}/><Metric label="Creator" value={data.summary.creators}/><Metric label="Feed Nutzer" value={data.summary.feed_users}/><Metric label="Likes" value={data.summary.likes}/><Metric label="Kommentare" value={data.summary.comments}/><Metric label="Saves" value={data.summary.saves}/><Metric label="Shares" value={data.summary.shares}/><Metric label="Engagement / Post" value={number(data.summary.engagement_rate,2)}/>
      </section>

      <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Momentum</div><h2>Community im Zeitverlauf</h2></div><div className="bi-chartLegend"><span className="is-pink"/>Likes<span className="is-cream"/>Posts<span className="is-green"/>Kommentare</div></div>
        <div className="bi-communityChart">{data.daily.map(d=><div className="bi-communityDay" key={d.metric_day}><div className="bi-communityBars"><i className="likes" style={{height:`${Math.max(3,d.likes/maxDaily*100)}%`}}/><i className="posts" style={{height:`${Math.max(3,d.posts/maxDaily*100)}%`}}/><i className="comments" style={{height:`${Math.max(3,d.comments/maxDaily*100)}%`}}/></div><small>{new Date(`${d.metric_day}T12:00:00`).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"})}</small></div>)}</div>
      </section>

      <div className="bi-grid2">
        <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Creators</div><h2>Top Creator</h2></div></div><div className="bi-list">{data.creators.map((c,i)=><div className="bi-listRow" key={c.user_id}><div><strong>{i+1}. {c.creator_name}</strong><small>{c.posts} Posts · {c.likes} Likes · {c.comments} Kommentare</small></div><b>{number(c.engagement_score)}</b></div>)}</div>{!data.creators.length&&<div className="bi-emptyInline">Noch keine Creator-Aktivität im Zeitraum.</div>}</section>
        <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Feed</div><h2>Nutzungsmodi</h2></div></div><div className="bi-list">{data.feed_modes.map((m,i)=><div className="bi-listRow" key={`${m.feed_mode}-${i}`}><div><strong>{labelMode(m.feed_mode)}</strong><small>{m.users} Nutzer</small></div><b>{number(m.events)}</b></div>)}</div>{!data.feed_modes.length&&<div className="bi-emptyInline">Noch keine Feed-Modi gemessen.</div>}</section>
      </div>

      <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Content performance</div><h2>Top Moments</h2></div></div><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Moment</th><th>Creator</th><th>Spot</th><th>Likes</th><th>Kommentare</th><th>Saves</th><th>Shares</th><th>Score</th></tr></thead><tbody>{data.top_posts.map(p=><tr key={p.post_id}><td><strong>{p.caption?.trim()||"Moment ohne Caption"}</strong><small>{new Date(p.created_at).toLocaleString("de-CH")}</small></td><td>{p.creator_name}</td><td>{p.spot_name||"—"}</td><td>{p.like_count}</td><td>{p.comment_count}</td><td>{p.save_count}</td><td>{p.shares}</td><td><span className="bi-scoreBadge">{p.engagement_score}</span></td></tr>)}</tbody></table></div>{!data.top_posts.length&&<div className="bi-emptyInline">Noch keine Moments im Zeitraum.</div>}</section>

      <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Signals</div><h2>Feed Events</h2></div></div><div className="bi-eventGrid">{data.event_types.map(e=><div className="bi-eventTile" key={e.event_type}><span>{prettyEvent(e.event_type)}</span><strong>{number(e.events)}</strong><small>{e.users} Nutzer</small></div>)}</div>{!data.event_types.length&&<div className="bi-emptyInline">Noch keine Feed-Events im Zeitraum.</div>}</section>
    </>}
  </div>
}

function Metric({label,value}:{label:string;value:string|number}){return <div className="bi-kpi"><span>{label}</span><strong>{typeof value==="number"?number(value):value}</strong><div/></div>}
function labelMode(v:string){return v==="for_you"?"Für dich":v==="following"?"Following":v==="unknown"?"Unbekannt":v}
function prettyEvent(v:string){return v.replace(/^feed_/,"").replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase())}
