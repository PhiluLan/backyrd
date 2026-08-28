"use client";
import Link from "next/link";
import React,{useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {dateTime} from "@/lib/intelligence";

type DecisionEvent={id:string;event_name:string;spot_name:string|null;occurred_at:string;screen_name:string|null};
type DecisionDetailData={session?:{mood_a_text?:string|null;mood_b_text?:string|null;city?:string|null;created_at?:string|null;display_name?:string|null;username?:string|null};events?:DecisionEvent[]};

export default function DecisionDetail({params}:{params:Promise<{id:string}>}){
  const{id}=React.use(params);const[data,setData]=useState<DecisionDetailData|null>(null),[error,setError]=useState("");
  useEffect(()=>{let cancelled=false;void supabase.rpc("admin_decision_session_v2",{p_decision_id:id}).then(({data,error})=>{if(cancelled)return;if(error)setError("Die Empfehlungssitzung konnte nicht geladen werden.");else setData(data as DecisionDetailData)});return()=>{cancelled=true}},[id]);
  return <div className="bi-page"><Link className="bi-back" href="/decision">← Zurück zu Empfehlungen</Link>{error&&<div className="bi-error">{error}</div>}{!data&&!error&&<div className="bi-state">Sitzung wird geladen …</div>}{data&&<><div className="bi-detailHero"><div><div className="bi-eyebrow">Empfehlungssitzung</div><h1>{data.session?.mood_a_text||"Empfehlung"}{data.session?.mood_b_text?` + ${data.session.mood_b_text}`:""}</h1><p>{data.session?.city||"—"} · {dateTime(data.session?.created_at)}</p></div><div className="bi-meta"><code>{id}</code><span>{data.session?.display_name||data.session?.username||"Unbekannter Nutzer"}</span></div></div><section className="bi-card bi-pad"><div className="bi-kicker">Ablauf</div><h2>Ereignisse</h2><div className="bi-timeline">{(data.events||[]).map((event)=><div className="bi-timelineItem" key={event.id}><span/><div><strong>{event.event_name}{event.spot_name?` · ${event.spot_name}`:""}</strong><small>{dateTime(event.occurred_at)} · {event.screen_name||"—"}</small></div></div>)}</div></section></>}</div>;
}
