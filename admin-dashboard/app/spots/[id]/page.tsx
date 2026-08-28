"use client";

import Link from "next/link";
import {useParams,useSearchParams} from "next/navigation";
import {useEffect,useState} from "react";
import {number} from "@/lib/intelligence";
import {supabase} from "@/lib/supabaseClient";

type Detail={spot:{id:string;name:string;city:string|null;status:string|null;owner_id:string|null;header_photo_path:string|null};metrics:{views:number;users:number;decision_impressions:number;decision_opens:number;ctr:number;reviews:number;favorites:number;route_clicks:number;website_clicks:number;phone_clicks:number};sources:Array<{source:string;views:number}>;daily:Array<{day:string;views:number;users:number}>};

export default function SpotDetail(){
  const params=useParams<{id:string}>();
  const id=params?.id;
  const query=useSearchParams();
  const returnParam=query?.get("returnTo");
  const returnTo=returnParam?.startsWith("/")&&!returnParam.startsWith("//")?returnParam:"/spots";
  const[data,setData]=useState<Detail|null>(null);
  const[error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    void (async()=>{
      if(!id)return;
      const to=query?.get("to")||new Date().toISOString();
      const from=query?.get("from")||new Date(Date.now()-30*86400000).toISOString();
      const result=await supabase.rpc("admin_spot_detail_operations_v2",{p_spot_id:id,p_from:from,p_to:to});
      if(cancelled)return;
      if(result.error)setError("Spot-Daten konnten nicht geladen werden.");
      else if(!(result.data as Detail)?.spot)setError("Dieser Spot gehört nicht zur aktiven Produkt-Arbeitsliste.");
      else{setData(result.data as Detail);setError("");}
    })();
    return()=>{cancelled=true};
  },[id,query]);

  const max=Math.max(1,...(data?.daily.map(item=>item.views)??[1]));
  return <div className="bi-page">
    <div className="bi-back"><Link href={returnTo}>← {returnTo.startsWith("/spot-quality")?"Zur Qualitätsliste":"Spots"}</Link></div>
    {error?<div className="bi-error">{error}</div>:null}
    {data?<>
      <header className="bi-detailHero"><div><div className="bi-eyebrow">Spot-Übersicht</div><h1>{data.spot.name}</h1><p>{data.spot.city||"Ort unbekannt"} · {data.spot.status||"—"} · {data.spot.owner_id?"Betreiber verwaltet":"Kein Betreiber"}</p></div><div className="bi-detailActions"><Link className="bi-primaryButton" href={`/spots/${id}/edit?returnTo=${encodeURIComponent(returnTo)}`}>Spot bearbeiten</Link><Link className="bi-actionButton" href={`/spots/${id}/edit?returnTo=${encodeURIComponent(returnTo)}#spot-understanding`}>Spot Intelligence</Link><Link className="bi-actionButton" href={`/spots/${id}/owner`}>Betreiber</Link></div></header>
      <section className="bi-kpiGrid"><K label="Aufrufe" value={data.metrics.views}/><K label="Nutzer" value={data.metrics.users}/><K label="Empfehlungs-CTR" value={`${number(data.metrics.ctr,1)}%`}/><K label="Reviews" value={data.metrics.reviews}/><K label="Favoriten" value={data.metrics.favorites}/><K label="Routen-Klicks" value={data.metrics.route_clicks}/><K label="Website-Klicks" value={data.metrics.website_clicks}/><K label="Telefon-Klicks" value={data.metrics.phone_clicks}/></section>
      <section className="bi-gridTwo"><article className="bi-card bi-chartCard"><div className="bi-cardHead"><div><span className="bi-kicker">Nutzung</span><h3>Aufrufe im Zeitverlauf</h3></div></div><div className="bi-bars">{data.daily.map(item=><div className="bi-barCol" key={item.day}><div className="bi-bar" style={{height:`${Math.max(4,item.views/max*100)}%`}}/><span>{new Date(item.day).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"})}</span></div>)}</div></article><article className="bi-card"><div className="bi-cardHead"><div><span className="bi-kicker">Herkunft</span><h3>Quellen</h3></div></div>{data.sources.length===0?<div className="bi-empty">Noch keine Quellen messbar.</div>:data.sources.map(source=><div className="bi-rowItem" key={source.source}><strong>{source.source}</strong><b>{number(source.views)}</b></div>)}</article></section>
    </>:null}
  </div>;
}

function K({label,value}:{label:string;value:number|string}){return <div className="bi-kpi"><span>{label}</span><strong>{typeof value==="number"?number(value):value}</strong><div/></div>}
