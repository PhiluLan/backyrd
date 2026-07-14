"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { number, rangeFor, dateTime, type Preset } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";

type Summary = {
  partner_spots:number; active_owners:number; views:number; unique_users:number; reviews:number;
  intent_actions:number; route_clicks:number; website_clicks:number; phone_clicks:number;
  pending_claims:number; approved_claims_period:number;
};
type Partner = {
  spot_id:string; name:string; city:string|null; status:string|null; owner_id:string; owner_name:string;
  owner_username:string|null; owner_avatar:string|null; header_photo_path:string|null; views:number;
  unique_users:number; decision_impressions:number; decision_opens:number; decision_ctr:number; reviews:number;
  route_clicks:number; website_clicks:number; phone_clicks:number; intent_actions:number; last_activity:string|null;
};
type Owner = { owner_id:string; owner_name:string; spots:number; views:number; unique_users:number; intent_actions:number; reviews:number };
type Claim = { status:string; claims:number };
type Data = { summary:Summary; partners:Partner[]; owners:Owner[]; claims:Claim[] };

export default function PartnersPage(){
  const [preset,setPreset]=useState<Preset>("month");
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{const t=setTimeout(()=>setQuery(search.trim()),250);return()=>clearTimeout(t)},[search]);
  useEffect(()=>{let cancelled=false;(async()=>{setLoading(true);setError("");const r=rangeFor(preset);const {data:res,error:rpcError}=await supabase.rpc("admin_partners_intelligence_v1",{p_from:r.from,p_to:r.to,p_limit:200,p_search:query||null});if(cancelled)return;if(rpcError){setError(rpcError.message);setData(null)}else setData(res as Data);setLoading(false)})();return()=>{cancelled=true}},[preset,query]);

  const claimTotal=useMemo(()=>Object.fromEntries((data?.claims??[]).map(x=>[x.status,x.claims])),[data]);

  return <div className="bi-page">
    <header className="bi-header"><div><div className="bi-eyebrow">Partner intelligence</div><h1>Partners</h1><p>Owner, Claims und messbarer Business-Intent deiner Partner-Spots.</p></div><DateRangeSelector value={preset} onChange={setPreset}/></header>
    {error&&<div className="bi-error">{error}</div>}
    <div className="bi-toolbar"><input className="bi-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Spot, Owner, Stadt oder UUID suchen …"/><div className="bi-toolbarActions"><Link className="bi-actionButton" href="/claims">Claims verwalten</Link></div></div>
    {loading&&<div className="bi-state">Partner-Daten werden berechnet …</div>}
    {data&&<>
      <section className="bi-kpiGrid bi-partnerKpis"><Metric label="Partner-Spots" value={data.summary.partner_spots}/><Metric label="Owner" value={data.summary.active_owners}/><Metric label="Views" value={data.summary.views}/><Metric label="Unique Users" value={data.summary.unique_users}/><Metric label="Business Intent" value={data.summary.intent_actions}/><Metric label="Reviews" value={data.summary.reviews}/><Metric label="Offene Claims" value={data.summary.pending_claims}/><Metric label="Genehmigt" value={data.summary.approved_claims_period}/></section>

      <div className="bi-grid2">
        <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Intent</div><h2>Business-Aktionen</h2></div></div><div className="bi-intentGrid"><Intent label="Route" value={data.summary.route_clicks}/><Intent label="Website" value={data.summary.website_clicks}/><Intent label="Telefon" value={data.summary.phone_clicks}/></div></section>
        <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Claim pipeline</div><h2>Betreiberzugänge</h2></div><Link href="/claims">Zur Queue →</Link></div><div className="bi-list"><ClaimRow label="In Prüfung" value={claimTotal.pending??0} tone="warn"/><ClaimRow label="Genehmigt" value={claimTotal.approved??0} tone="good"/><ClaimRow label="Abgelehnt" value={claimTotal.rejected??0} tone="bad"/><ClaimRow label="Entzogen" value={claimTotal.revoked??0} tone="muted"/></div></section>
      </div>

      <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Portfolio</div><h2>Partner-Spots</h2></div><span>{data.partners.length} Treffer</span></div><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Spot</th><th>Owner</th><th>Views</th><th>Users</th><th>CTR</th><th>Intent</th><th>Reviews</th><th>Letzte Aktivität</th><th/></tr></thead><tbody>{data.partners.map(p=><tr key={p.spot_id}><td><strong>{p.name}</strong><small>{p.city||"Ort unbekannt"} · {p.status||"—"}</small></td><td><strong>{p.owner_name}</strong><small>{p.owner_username?`@${p.owner_username}`:p.owner_id.slice(0,8)}</small></td><td>{number(p.views)}</td><td>{number(p.unique_users)}</td><td><span className="bi-scoreBadge">{number(p.decision_ctr,1)}%</span></td><td><strong>{number(p.intent_actions)}</strong><small>{p.route_clicks} Route · {p.website_clicks} Web · {p.phone_clicks} Tel.</small></td><td>{number(p.reviews)}</td><td>{dateTime(p.last_activity)}</td><td><div className="bi-rowActions"><Link href={`/spots/${p.spot_id}`}>Analyse</Link><Link href={`/spots/${p.spot_id}/owner`}>Owner</Link></div></td></tr>)}</tbody></table></div>{!data.partners.length&&<div className="bi-emptyInline">Keine Partner-Spots für diese Suche gefunden.</div>}</section>

      <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Owner performance</div><h2>Top Owner</h2></div></div><div className="bi-ownerGrid">{data.owners.map((o,i)=><article className="bi-ownerCard" key={o.owner_id}><div className="bi-ownerRank">#{i+1}</div><div><strong>{o.owner_name}</strong><small>{o.spots} Spot{o.spots===1?"":"s"}</small></div><dl><div><dt>Views</dt><dd>{number(o.views)}</dd></div><div><dt>Intent</dt><dd>{number(o.intent_actions)}</dd></div><div><dt>Reviews</dt><dd>{number(o.reviews)}</dd></div></dl></article>)}</div>{!data.owners.length&&<div className="bi-emptyInline">Noch keine Owner-Daten verfügbar.</div>}</section>
    </>}
  </div>
}

function Metric({label,value}:{label:string;value:number}){return <div className="bi-kpi"><span>{label}</span><strong>{number(value)}</strong><div/></div>}
function Intent({label,value}:{label:string;value:number}){return <div className="bi-intentTile"><span>{label}</span><strong>{number(value)}</strong></div>}
function ClaimRow({label,value,tone}:{label:string;value:number;tone:string}){return <div className="bi-listRow"><div><strong>{label}</strong></div><span className={`bi-claimBadge ${tone}`}>{number(value)}</span></div>}
