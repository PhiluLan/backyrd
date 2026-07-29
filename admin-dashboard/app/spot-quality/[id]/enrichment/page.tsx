"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Preview={website:{current:string|null;suggested:string|null;canApply:boolean};phone:{current:string|null;suggested:string|null;canApply:boolean};openingHours:{currentCount:number;suggestedCount:number;canApply:boolean;weekdayDescriptions:string[]};businessStatus:string|null;primaryTypeLabel:string|null;googleMapsUri:string|null;googleName:string|null;googleAddress:string|null};

export default function GoogleEnrichmentPage(){
  const {id}=useParams<{id:string}>();
  const [preview,setPreview]=useState<Preview|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  useEffect(()=>{void load()},[id]);
  async function invoke(body:Record<string,unknown>){
    const {data,error}=await supabase.functions.invoke("spot-google-enrichment",{body});
    if(error) throw new Error(error.message);
    if(!data?.ok) throw new Error(data?.error||"Google Enrichment fehlgeschlagen.");
    return data;
  }
  async function load(){
    if(!id)return; setLoading(true);setError("");
    try {
  const data = await invoke({ action: "preview", spotId: id });

  setPreview(data.preview);

  setSelected(
    [
      data.preview.website.canApply ? "website" : null,
      data.preview.phone.canApply ? "phone" : null,
      data.preview.openingHours.canApply ? "openingHours" : null,
    ].filter((field): field is string => field !== null),
  );
}
    catch(e:any){setError(e.message)}finally{setLoading(false)}
  }
  function toggle(field:string){setSelected(v=>v.includes(field)?v.filter(x=>x!==field):[...v,field])}
  async function apply(){if(!id||!selected.length)return;setSaving(true);setError("");setSuccess("");try{const data=await invoke({action:"apply",spotId:id,fields:selected});setSuccess(`${data.applied.length} Felder übernommen.`);await load()}catch(e:any){setError(e.message)}finally{setSaving(false)}}

  return <div className="bi-page"><div className="bi-back"><Link href="/spot-quality">← Spot Quality</Link></div><header className="bi-header"><div><div className="bi-eyebrow">Google Enrichment</div><h1>{preview?.googleName||"Google-Daten"}</h1><p>{preview?.googleAddress||"Website, Telefon und Öffnungszeiten sicher ergänzen."}</p></div>{preview?.googleMapsUri?<a className="bi-actionButton" href={preview.googleMapsUri} target="_blank" rel="noreferrer">Google Maps ↗</a>:null}</header>{error?<div className="bi-error">{error}</div>:null}{success?<div className="bi-alert bi-alertOk">{success}</div>:null}{loading?<div className="bi-state">Google-Daten werden geladen …</div>:preview?<><section className="bi-card" style={{padding:20}}><div className="bi-kicker">Google Status</div><h3>{preview.primaryTypeLabel||"Kategorie unbekannt"}</h3><p>{preview.businessStatus||"Kein Geschäftsstatus verfügbar"}</p></section><section className="bi-card" style={{padding:20,display:"grid",gap:14}}><Option title="Website" current={preview.website.current} suggested={preview.website.suggested} enabled={preview.website.canApply} selected={selected.includes("website")} onToggle={()=>toggle("website")}/><Option title="Telefonnummer" current={preview.phone.current} suggested={preview.phone.suggested} enabled={preview.phone.canApply} selected={selected.includes("phone")} onToggle={()=>toggle("phone")}/><Option title="Öffnungszeiten" current={preview.openingHours.currentCount?`${preview.openingHours.currentCount} Backyrd-Zeitfenster vorhanden`:null} suggested={preview.openingHours.suggestedCount?preview.openingHours.weekdayDescriptions.join(" · "):null} enabled={preview.openingHours.canApply} selected={selected.includes("openingHours")} onToggle={()=>toggle("openingHours")}/><div><button className="bi-primaryButton" disabled={saving||!selected.length} onClick={()=>void apply()}>{saving?"Wird übernommen …":`${selected.length} Felder übernehmen`}</button></div></section></>:null}</div>
}

function Option({title,current,suggested,enabled,selected,onToggle}:{title:string;current:string|null;suggested:string|null;enabled:boolean;selected:boolean;onToggle:()=>void}){return <article style={{padding:18,borderRadius:18,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.035)",opacity:enabled?1:.55}}><div style={{display:"flex",justifyContent:"space-between",gap:16}}><div><div className="bi-kicker">{title}</div><h3>{enabled?"Kann ergänzt werden":"Keine Übernahme nötig"}</h3></div><label><input type="checkbox" checked={selected} disabled={!enabled} onChange={onToggle}/> {selected?"Ausgewählt":"Nicht ausgewählt"}</label></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:14}}><div><small>Backyrd aktuell</small><p>{current||"Nicht vorhanden"}</p></div><div><small>Google-Vorschlag</small><p>{suggested||"Nicht vorhanden"}</p></div></div></article>}
