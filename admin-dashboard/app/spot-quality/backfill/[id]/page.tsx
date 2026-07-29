"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Candidate={googlePlaceId:string;name:string;address:string|null;distanceMeters:number|null;confidence:number;scoreDetails:{name:number;address:number;distance:number};businessStatus:string|null;primaryTypeLabel:string|null;website:string|null;phone:string|null;googleMapsUri:string|null;imageUrl:string|null;photoAttribution:string|null};
type Spot={id:string;name:string;address:string|null;city:string|null;country:string|null};

function distance(v:number|null){if(v===null)return"Distanz unbekannt";return v<1000?`${v} m entfernt`:`${(v/1000).toFixed(1).replace(".",",")} km entfernt`;}
function tone(v:number){return v>=90?"excellent":v>=75?"good":v>=55?"warning":"critical";}

export default function GoogleBackfillPage(){
  const params=useParams<{id:string}>(); const id=params?.id; const router=useRouter();
  const[spot,setSpot]=useState<Spot|null>(null); const[query,setQuery]=useState(""); const[candidates,setCandidates]=useState<Candidate[]>([]);
  const[loading,setLoading]=useState(true); const[error,setError]=useState(""); const[busy,setBusy]=useState<string|null>(null);

  useEffect(()=>{(async()=>{if(!id)return;const{data,error}=await supabase.from("spots").select("id,name,address,city,country").eq("id",id).single();if(error){setError(error.message);setLoading(false);return;}setSpot(data);const q=[data.name,data.address||data.city,data.country].filter(Boolean).join(", ");setQuery(q);await runSearch(q);})()},[id]);

  async function call(body:Record<string,unknown>){const{data,error}=await supabase.functions.invoke("spot-google-backfill",{body});if(error)throw new Error(error.message);if(!data?.ok)throw new Error(data?.error||"Backfill fehlgeschlagen");return data;}
  async function runSearch(q=query){if(!id)return;setLoading(true);setError("");try{const data=await call({action:"search",spotId:id,query:q});setCandidates(data.candidates??[]);}catch(e:any){setCandidates([]);setError(e?.message??"Suche fehlgeschlagen");}finally{setLoading(false);}}
  async function accept(c:Candidate){if(!id)return;setBusy(c.googlePlaceId);setError("");try{await call({action:"accept",spotId:id,googlePlaceId:c.googlePlaceId});router.push("/spot-quality");router.refresh();}catch(e:any){setError(e?.message??"Übernahme fehlgeschlagen");setBusy(null);}}
  async function reject(c:Candidate){if(!id)return;setBusy(c.googlePlaceId);setError("");try{await call({action:"reject",spotId:id,googlePlaceId:c.googlePlaceId,reason:"Rejected in Spot Quality dashboard"});setCandidates(x=>x.filter(v=>v.googlePlaceId!==c.googlePlaceId));}catch(e:any){setError(e?.message??"Ablehnung fehlgeschlagen");}finally{setBusy(null);}}

  return <div className="bi-page sqb-page"><div className="bi-back"><Link href="/spot-quality">← Spot Quality</Link></div>
    <header className="bi-header"><div><div className="bi-eyebrow">Google Backfill</div><h1>{spot?.name||"Spot wird geladen"}</h1><p>{spot?.address||spot?.city||"Google-Treffer mit Name, Adresse und Distanz prüfen."}</p></div></header>
    <section className="bi-card sqb-search"><input className="bi-input" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void runSearch();}}}/><button className="bi-primaryButton" onClick={()=>void runSearch()} disabled={loading}>{loading?"Suche läuft …":"Google durchsuchen"}</button></section>
    {error&&<div className="bi-error">{error}</div>}
    {loading?<div className="bi-state">Google-Treffer werden geprüft …</div>:candidates.length===0?<div className="bi-empty">Keine offenen Treffer. Suchbegriff anpassen und erneut suchen.</div>:<div className="sqb-list">{candidates.map((c,i)=><article className="sqb-card" key={c.googlePlaceId}>
      <div className="sqb-media">{c.imageUrl?<img src={c.imageUrl} alt=""/>:<div className="sqb-placeholder">{c.name[0]}</div>}<span className="sqb-rank">Treffer {i+1}</span>{c.photoAttribution&&<span className="sqb-attribution">Foto: {c.photoAttribution} · Google</span>}</div>
      <div className="sqb-body"><div className="sqb-top"><div><h2>{c.name}</h2><p>{c.address||"Adresse unbekannt"}</p></div><div className={`sqb-confidence ${tone(c.confidence)}`}><strong>{c.confidence}%</strong><span>Match</span></div></div>
      <div className="sqb-meta"><span>{distance(c.distanceMeters)}</span>{c.primaryTypeLabel&&<span>{c.primaryTypeLabel}</span>}{c.businessStatus&&<span>{c.businessStatus}</span>}</div>
      <div className="sqb-bars">{Object.entries(c.scoreDetails).map(([k,v])=><div key={k}><div><span>{k==="name"?"Name":k==="address"?"Adresse":"Distanz"}</span><strong>{v}%</strong></div><i><b style={{width:`${v}%`}}/></i></div>)}</div>
      <div className="sqb-facts">{c.website&&<span>Website vorhanden</span>}{c.phone&&<span>Telefon vorhanden</span>}{c.imageUrl&&<span>Google-Foto vorhanden</span>}</div>
      <div className="sqb-actions"><button className="bi-primaryButton" disabled={busy===c.googlePlaceId} onClick={()=>void accept(c)}>{busy===c.googlePlaceId?"Wird übernommen …":"Treffer übernehmen"}</button><button className="bi-actionButton" disabled={busy===c.googlePlaceId} onClick={()=>void reject(c)}>Ablehnen</button>{c.googleMapsUri&&<a className="bi-action" href={c.googleMapsUri} target="_blank" rel="noreferrer">Google Maps ↗</a>}</div>
      </div></article>)}</div>}
  </div>;
}
