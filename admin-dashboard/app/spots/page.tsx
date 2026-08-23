"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminPageHeader, EmptyState, ErrorState, FilterBar, LoadingState, StatusBadge } from "@/components/admin/AdminUi";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { number, rangeFor, type Preset } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";

type Spot = { spot_id:string; name:string; city:string|null; status:string|null; partner:boolean; views:number; users:number; decision_impressions:number; decision_opens:number; ctr:number; reviews:number; favorites:number; route_clicks:number; website_clicks:number; phone_clicks:number };
type Response = { summary:{ spots:number; viewed:number; partner_spots:number; views:number }; spots:Spot[] };
type Readiness = { spot_id:string; readiness_status:string; coverage:number; gap_count:number; conflict_count:number; attention_state:"READY"|"REVIEW"|"INCOMPLETE" };

const statusLabels: Record<string, string> = { approved: "Freigegeben", pending: "In Prüfung", hidden: "Ausgeblendet", rejected: "Abgelehnt" };
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
  const [readiness, setReadiness] = useState<Record<string, Readiness>>({});

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
        const readinessResult = await supabase.rpc("admin_spot_readiness_worklist_v1", { p_spot_ids:response.spots.map((spot) => spot.spot_id) });
        if (!cancelled && !readinessResult.error) setReadiness(Object.fromEntries(((readinessResult.data ?? []) as Readiness[]).map((row) => [row.spot_id,row])));
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

  const detailsHref = (spot: Spot) => `/spots/${spot.spot_id}?from=${encodeURIComponent(rangeFor(preset).from)}&to=${encodeURIComponent(rangeFor(preset).to)}`;

  return (
    <div className="bi-page admin-page">
      <AdminPageHeader eyebrow="Spots" title="Orte verwalten" description="Finde schnell die Spots, die Aufmerksamkeit brauchen, und öffne ihr vollständiges Profil." actions={<><DateRangeSelector value={preset} onChange={setPreset}/><Link href="/spots/new" className="bi-primaryButton">Neuen Spot anlegen</Link></>} />
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Spots werden geladen …" /> : null}
      {data ? <>
        <section className="admin-summaryGrid" aria-label="Spot-Übersicht">
          <Summary label="Alle Spots" value={data.summary.spots} /><Summary label="Mit Aufrufen" value={data.summary.viewed} /><Summary label="Owner-Spots" value={data.summary.partner_spots} /><Summary label="Aufrufe" value={data.summary.views} />
        </section>
        <section className="admin-listPanel">
          <FilterBar resultLabel={`${rows.length} ${rows.length === 1 ? "Spot" : "Spots"}`}>
            <label className="admin-searchField"><span className="sr-only">Spot suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Spot oder Stadt suchen" /></label>
            <label><span className="sr-only">Status filtern</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle Status</option><option value="approved">Freigegeben</option><option value="pending">In Prüfung</option><option value="hidden">Ausgeblendet</option><option value="rejected">Abgelehnt</option></select></label>
            {(search || status !== "all") ? <button type="button" className="admin-clearButton" onClick={() => { setSearch(""); setStatus("all"); }}>Filter löschen</button> : null}
          </FilterBar>
          {rows.length === 0 ? <EmptyState title="Keine Spots gefunden" description="Passe Suche oder Filter an." /> : <>
            <div className="admin-desktopTable"><table><thead><tr><th>Spot</th><th>Status</th><th>Gold Readiness</th><th>Aufrufe</th><th>Decision CTR</th><th>Reviews</th><th>Aktionen</th></tr></thead><tbody>{rows.map((spot) => { const gold=readiness[spot.spot_id]; return <tr key={spot.spot_id}><td><strong>{spot.name}</strong><small>{spot.city || "Ort unbekannt"}{spot.partner ? " · Owner verwaltet" : ""}</small></td><td><StatusBadge tone={spot.status === "approved" ? "success" : spot.status === "pending" ? "warning" : spot.status === "rejected" ? "danger" : "neutral"}>{statusLabels[spot.status ?? ""] ?? "Unbekannt"}</StatusBadge></td><td>{gold ? <div className="admin-readinessCell"><span><i style={{width:`${gold.coverage}%`}} /></span><b>{gold.coverage}%</b><small>{gold.attention_state === "READY" ? "Gut beschrieben" : gold.attention_state === "REVIEW" ? "Prüfung nötig" : `${gold.gap_count} offene Punkte`}</small></div> : <span className="admin-mutedValue">Wird geladen …</span>}</td><td>{number(spot.views)}</td><td>{number(spot.ctr, 1)}%</td><td>{number(spot.reviews)}</td><td><div className="admin-rowActions"><Link href={detailsHref(spot)}>Öffnen</Link><Link href={`/spots/${spot.spot_id}/edit`}>Bearbeiten</Link><Link href={`/spot-quality/${spot.spot_id}/enrichment`}>Prüfen</Link></div></td></tr>})}</tbody></table></div>
            <div className="admin-mobileList">{rows.map((spot) => { const gold=readiness[spot.spot_id]; return <article className="admin-spotCard" key={spot.spot_id}><div className="admin-cardTop"><div className="admin-spotThumb" aria-hidden="true">{spot.name.slice(0, 1).toUpperCase()}</div><div><h2>{spot.name}</h2><p>{spot.city || "Ort unbekannt"}{spot.partner ? " · Owner verwaltet" : ""}</p></div><StatusBadge tone={spot.status === "approved" ? "success" : spot.status === "pending" ? "warning" : "neutral"}>{statusLabels[spot.status ?? ""] ?? "Unbekannt"}</StatusBadge></div>{gold ? <div className="admin-mobileReadiness"><span><i style={{width:`${gold.coverage}%`}} /></span><b>{gold.coverage}% · {gold.attention_state === "READY" ? "gut beschrieben" : gold.attention_state === "REVIEW" ? "Prüfung nötig" : `${gold.gap_count} offene Punkte`}</b></div> : null}<dl><div><dt>Aufrufe</dt><dd>{number(spot.views)}</dd></div><div><dt>Decision CTR</dt><dd>{number(spot.ctr,1)}%</dd></div><div><dt>Reviews</dt><dd>{number(spot.reviews)}</dd></div></dl><div className="admin-cardActions"><Link href={detailsHref(spot)}>Öffnen</Link><Link href={`/spots/${spot.spot_id}/edit`}>Bearbeiten</Link><Link href={`/spot-quality/${spot.spot_id}/enrichment`}>Prüfen</Link></div></article>})}</div>
          </>}
        </section>
      </> : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) { return <article><span>{label}</span><strong>{number(value)}</strong></article>; }
