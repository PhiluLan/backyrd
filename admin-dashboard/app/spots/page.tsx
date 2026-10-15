"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminPageHeader, EmptyState, ErrorState, FilterBar, LoadingState, StatusBadge } from "@/components/admin/AdminUi";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { number, rangeFor, type Preset } from "@/lib/intelligence";
import { spotProfileStatus, type SpotProfileStatus } from "@/lib/spotProfileStatus";
import { supabase } from "@/lib/supabaseClient";

type Spot = { spot_id:string; name:string; city:string|null; status:string|null; partner:boolean; views:number; users:number; decision_impressions:number; decision_opens:number; ctr:number; reviews:number; favorites:number; route_clicks:number; website_clicks:number; phone_clicks:number };
type Response = { summary:{ spots:number; viewed:number; partner_spots:number; views:number }; spots:Spot[] };

const statusLabels: Record<string, string> = { approved: "Freigegeben", pending: "In Prüfung", archived: "Archiviert", rejected: "Abgelehnt" };
const presetValues: Preset[] = ["today", "yesterday", "week", "last_week", "month", "last_month", "year", "last_year"];

export default function SpotsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requestedPreset = params.get("zeitraum") as Preset | null;
  const [preset, setPreset] = useState<Preset>(requestedPreset && presetValues.includes(requestedPreset) ? requestedPreset : "month");
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(params.get("suche") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [profiles, setProfiles] = useState<Record<string, {key:string; status:SpotProfileStatus}>>({});
  const [page, setPage] = useState(0);
  const [profileRevision, setProfileRevision] = useState(0);
  useEffect(() => {
    const refresh=()=>setProfileRevision(value=>value+1);
    const visible=()=>{if(document.visibilityState==="visible")refresh();};
    window.addEventListener("focus",refresh);
    window.addEventListener("backyrd:spot-profile-updated",refresh);
    document.addEventListener("visibilitychange",visible);
    return ()=>{window.removeEventListener("focus",refresh);window.removeEventListener("backyrd:spot-profile-updated",refresh);document.removeEventListener("visibilitychange",visible);};
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const range = rangeFor(preset);
      const result = await supabase.rpc("admin_spots_intelligence_v1", { p_from:range.from, p_to:range.to, p_limit:1000, p_offset:0, p_search:null });
      if (cancelled) return;
      if (result.error) { setError(result.error.message); setData(null); }
      else {
        const response = result.data as Response;
        setError(""); setData(response);
      }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [preset]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("suche", search);
    if (status !== "all") next.set("status", status);
    if (preset !== "month") next.set("zeitraum", preset);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll:false });
  }, [pathname, preset, router, search, status]);

  const rows = useMemo(() => {
    const query = search.toLowerCase().trim();
    return (data?.spots ?? []).filter((spot) => (status === "all" || spot.status === status) && (!query || `${spot.name} ${spot.city ?? ""}`.toLowerCase().includes(query)));
  }, [data, search, status]);

  const pageSize=25;
  const totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
  const activePage=Math.min(page,totalPages-1);
  const visibleRows=useMemo(()=>rows.slice(activePage*pageSize,(activePage+1)*pageSize),[rows,activePage]);
  const profileKey=`${visibleRows.map(spot=>spot.spot_id).join(",")}:${profileRevision}`;
  useEffect(() => {
    let cancelled=false, cursor=0;
    // Only the visible page is read, with four requests in flight at most.
    const worker=async()=>{
      while(!cancelled && cursor<visibleRows.length){
        const spot=visibleRows[cursor++];
        let profile:SpotProfileStatus;
        try {
          const {data,error}=await supabase.rpc("world_product_authoring_detail_v1",{p_spot_id:spot.spot_id});
          if(error)throw error;
          profile=spotProfileStatus(data,spot.spot_id);
        } catch {profile={label:"Status nicht verfügbar",detail:"Profil öffnen und erneut prüfen",state:"unavailable"};}
        if(!cancelled)setProfiles(current=>({...current,[spot.spot_id]:{key:profileKey,status:profile}}));
      }
    };
    void Promise.all(Array.from({length:Math.min(4,visibleRows.length)},()=>worker()));
    return ()=>{cancelled=true;};
  },[visibleRows,profileKey]);
  const profileCell=(spot:Spot)=>{const entry=profiles[spot.spot_id];const profile=entry?.key===profileKey?entry.status:undefined;return <Link className="admin-profileStatus" href={`/spots/${spot.spot_id}/edit`}><strong>{profile?.label??"Profilstatus wird geladen …"}</strong><small>{profile?.detail??"Aktuelle Angaben werden geprüft"}</small></Link>;};

  const detailsHref = (spot: Spot) => `/spots/${spot.spot_id}?from=${encodeURIComponent(rangeFor(preset).from)}&to=${encodeURIComponent(rangeFor(preset).to)}`;

  return (
    <div className="bi-page admin-page">
      <AdminPageHeader eyebrow="Spots · gemeinsame Wahrheit" title="Orte verwalten" description="Spots finden, Profile bearbeiten und veröffentlichte Angaben verwalten." actions={<><DateRangeSelector value={preset} onChange={setPreset}/><Link href="/spots/presentation" className="bi-actionButton">Detail-Darstellung</Link><Link href="/spots/new" className="bi-primaryButton">Neuen Spot anlegen</Link></>} />
      {error ? <ErrorState message={error} /> : null}
      {params.get("archiviert") === "1" ? <div className="by-alert by-alertOk" role="status">Spot archiviert. Reviews und historische Daten bleiben erhalten.</div> : null}
      {loading ? <LoadingState label="Spots werden geladen …" /> : null}
      {data ? <>
        <section className="admin-summaryGrid" aria-label="Spot-Übersicht">
          <Summary label="Alle Spots" value={data.summary.spots} /><Summary label="Mit Aufrufen" value={data.summary.viewed} /><Summary label="Owner-Spots" value={data.summary.partner_spots} /><Summary label="Aufrufe" value={data.summary.views} />
        </section>
        <section className="admin-listPanel">
          <FilterBar resultLabel={`${rows.length} ${rows.length === 1 ? "Spot" : "Spots"}`}>
            <label className="admin-searchField"><span className="sr-only">Spot suchen</span><input value={search} onChange={(event) => {setSearch(event.target.value);setPage(0);}} placeholder="Spot oder Stadt suchen" /></label>
            <label><span className="sr-only">Status filtern</span><select value={status} onChange={(event) => {setStatus(event.target.value);setPage(0);}}><option value="all">Alle Status</option><option value="approved">Freigegeben</option><option value="pending">In Prüfung</option><option value="archived">Archiviert</option><option value="rejected">Abgelehnt</option></select></label>
            {(search || status !== "all") ? <button type="button" className="admin-clearButton" onClick={() => { setSearch(""); setStatus("all"); }}>Filter löschen</button> : null}
          </FilterBar>
          {rows.length === 0 ? <EmptyState title="Keine Spots gefunden" description="Passe Suche oder Filter an." /> : <>
            <div className="admin-desktopTable"><table><thead><tr><th>Spot</th><th>Status</th><th>Profilstand</th><th>Aufrufe</th><th>Decision CTR</th><th>Reviews</th><th>Aktionen</th></tr></thead><tbody>{visibleRows.map((spot) => { return <tr key={spot.spot_id}><td><strong>{spot.name}</strong><small>{spot.city || "Ort unbekannt"}{spot.partner ? " · Owner verwaltet" : ""}</small></td><td><StatusBadge tone={spot.status === "approved" ? "success" : spot.status === "pending" ? "warning" : spot.status === "rejected" ? "danger" : "neutral"}>{statusLabels[spot.status ?? ""] ?? "Unbekannt"}</StatusBadge></td><td>{profileCell(spot)}</td><td>{number(spot.views)}</td><td>{number(spot.ctr, 1)}%</td><td>{number(spot.reviews)}</td><td><div className="admin-rowActions"><Link href={detailsHref(spot)}>Öffnen</Link><Link href={`/spots/${spot.spot_id}/edit`}>Pflegen</Link></div></td></tr>})}</tbody></table></div>
            <div className="admin-mobileList">{visibleRows.map((spot) => { return <article className="admin-spotCard" key={spot.spot_id}><div className="admin-cardTop"><div className="admin-spotThumb" aria-hidden="true">{spot.name.slice(0, 1).toUpperCase()}</div><div><h2>{spot.name}</h2><p>{spot.city || "Ort unbekannt"}{spot.partner ? " · Owner verwaltet" : ""}</p></div><StatusBadge tone={spot.status === "approved" ? "success" : spot.status === "pending" ? "warning" : "neutral"}>{statusLabels[spot.status ?? ""] ?? "Unbekannt"}</StatusBadge></div>{profileCell(spot)}<dl><div><dt>Aufrufe</dt><dd>{number(spot.views)}</dd></div><div><dt>Decision CTR</dt><dd>{number(spot.ctr,1)}%</dd></div><div><dt>Reviews</dt><dd>{number(spot.reviews)}</dd></div></dl><div className="admin-cardActions"><Link href={detailsHref(spot)}>Öffnen</Link><Link href={`/spots/${spot.spot_id}/edit`}>Bearbeiten</Link><Link href={`/spot-quality/${spot.spot_id}/enrichment`}>Prüfen</Link></div></article>})}</div>
            <div className="admin-profilePagination"><button type="button" onClick={()=>setProfileRevision(value=>value+1)}>Profilstatus aktualisieren</button><span>Seite {activePage+1} von {totalPages}</span><button type="button" disabled={activePage===0} onClick={()=>setPage(activePage-1)}>Zurück</button><button type="button" disabled={activePage+1>=totalPages} onClick={()=>setPage(activePage+1)}>Weiter</button></div>
          </>}
        </section>
      </> : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) { return <article><span>{label}</span><strong>{number(value)}</strong></article>; }
