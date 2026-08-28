"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/admin/AdminUi";
import { supabase } from "@/lib/supabaseClient";

type QualityIssue = { key: string; label: string; severity: "critical" | "high" | "medium" | "low"; points: number };
type QualityRow = {
  spot_id: string; name: string; address: string | null; city: string | null; status: string;
  quality_score: number; photo_count: number; opening_slot_count: number; has_description: boolean;
  description_source: string | null; taxonomy_count: number; verified_taxonomy_count: number;
  google_place_id: string | null; duplicate_google_place_id: boolean; duplicate_name_address: boolean;
  issues: QualityIssue[]; updated_at: string;
};
type QualitySummary = {
  total: number; excellent: number; good: number; needs_work: number; critical: number;
  missing_google_place_id: number; missing_photo: number; missing_description: number;
  missing_opening_hours: number; missing_taxonomies: number; possible_duplicates: number; average_score: number;
};
type QualityResponse = {
  summary: QualitySummary; filtered_total: number;
  freshness: { mode: "live"; calculated_at: string; universe: string };
  rows: QualityRow[];
};

const PAGE_SIZE = 50;
const ISSUE_FILTERS = [
  { value: "all", label: "Alle aktiven Spots" },
  { value: "low_quality", label: "Qualität unter 70 %" },
  { value: "possible_duplicate", label: "Mögliche Duplikate" },
  { value: "missing_google_place_id", label: "Ohne Google-Verknüpfung" },
  { value: "missing_photo", label: "Ohne sichtbares Bild" },
  { value: "missing_description", label: "Ohne Beschreibung" },
  { value: "missing_opening_hours", label: "Ohne Öffnungszeiten" },
  { value: "missing_taxonomies", label: "Taxonomie unvollständig" },
] as const;
const QUEUES: Array<{
  key: keyof Pick<QualitySummary, "missing_google_place_id" | "missing_photo" | "missing_description" | "missing_opening_hours" | "missing_taxonomies" | "possible_duplicates">;
  filter: string; label: string; meaning: string; danger?: boolean;
}> = [
  { key: "missing_google_place_id", filter: "missing_google_place_id", label: "Ohne Google-Verknüpfung", meaning: "Eine verlässliche externe Identität fehlt." },
  { key: "missing_photo", filter: "missing_photo", label: "Ohne sichtbares Bild", meaning: "Weder Backyrd-Bild noch erlaubtes Google-Fallback ist verfügbar." },
  { key: "missing_description", filter: "missing_description", label: "Ohne Beschreibung", meaning: "Keine veröffentlichbare Owner-, Admin- oder geprüfte Enrichment-Beschreibung." },
  { key: "missing_opening_hours", filter: "missing_opening_hours", label: "Ohne Öffnungszeiten", meaning: "Es ist kein vollständiges Öffnungszeitfenster hinterlegt." },
  { key: "missing_taxonomies", filter: "missing_taxonomies", label: "Taxonomie unvollständig", meaning: "Weniger als vier operative Taxonomie-Zuordnungen." },
  { key: "possible_duplicates", filter: "possible_duplicate", label: "Mögliche Duplikate", meaning: "Gleiche Google-ID oder gleicher normalisierter Name und Adresse.", danger: true },
];

function scoreTone(score: number) { if (score >= 90) return "excellent"; if (score >= 75) return "good"; if (score >= 50) return "warning"; return "critical"; }
function scoreLabel(score: number) { if (score >= 90) return "Launchbereit"; if (score >= 75) return "Gute Basis"; if (score >= 50) return "Ausbaufähig"; return "Kritisch"; }
function readableError(message: string) {
  if (message.includes("admin_required") || message.includes("42501")) return "Du hast keinen Zugriff auf die Spot-Qualität.";
  if (message.toLowerCase().includes("network") || message.toLowerCase().includes("fetch")) return "Die Qualitätsdaten sind gerade nicht erreichbar. Bitte prüfe die Verbindung und versuche es erneut.";
  return "Die Qualitätsdaten konnten nicht geladen werden.";
}

export default function SpotQualityPage() {
  return <Suspense fallback={<div className="bi-page"><LoadingState label="Spot-Qualität wird geladen …" /></div>}><SpotQualityContent /></Suspense>;
}

function SpotQualityContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initialIssue = params.get("issue") ?? "all";
  const [data, setData] = useState<QualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [issue, setIssue] = useState(ISSUE_FILTERS.some((item) => item.value === initialIssue) ? initialIssue : "all");
  const [page, setPage] = useState(Math.max(0, Number(params.get("page") ?? "1") - 1));
  const [refreshKey, setRefreshKey] = useState(0);

  const updateUrl = useCallback((nextIssue: string, nextSearch: string, nextPage: number) => {
    const next = new URLSearchParams();
    if (nextIssue !== "all") next.set("issue", nextIssue);
    if (nextSearch.trim()) next.set("q", nextSearch.trim());
    if (nextPage > 0) next.set("page", String(nextPage + 1));
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
  }, [pathname, router]);

  const loadQuality = useCallback(async () => {
    setLoading(true);
    const { data: result, error: rpcError } = await supabase.rpc("admin_spot_quality_v2", {
      p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE, p_search: search.trim() || null, p_issue: issue,
    });
    if (rpcError) {
      console.error("Spot quality load failed", { code: rpcError.code, message: rpcError.message });
      setError(readableError(rpcError.message)); setData(null);
    } else { setError(""); setData(result as QualityResponse); }
    setLoading(false);
  }, [issue, page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { updateUrl(issue, search, page); void loadQuality(); }, 250);
    return () => window.clearTimeout(timer);
  }, [issue, loadQuality, page, refreshKey, search, updateUrl]);
  useEffect(() => {
    const refresh = () => void loadQuality();
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, [loadQuality]);

  const totalPages = Math.max(1, Math.ceil((data?.filtered_total ?? 0) / PAGE_SIZE));
  const returnTo = useMemo(() => `${pathname}${params.size ? `?${params.toString()}` : ""}`, [params, pathname]);
  const queueLabel = ISSUE_FILTERS.find((item) => item.value === issue)?.label ?? "Aktive Spots";
  function chooseIssue(value: string) { setIssue(value); setPage(0); }

  return <div className="bi-page sq-page">
    <header className="bi-header sq-header"><div><div className="bi-eyebrow">Spot Operations</div><h1>Spot-Qualität</h1><p>Live-Arbeitsstand der aktiven Product-Spots. Gold-Status und Human Readiness werden separat bewertet.</p></div><div className="sq-headerActions"><button type="button" className="bi-actionButton" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>Jetzt aktualisieren</button><Link href="/spots/new" className="bi-primaryButton">+ Neuer Spot</Link></div></header>
    {error ? <ErrorState message={error} onRetry={() => setRefreshKey((value) => value + 1)} /> : null}
    {!data && loading ? <LoadingState label="Spot-Qualität wird live berechnet …" /> : null}
    {data ? <>
      <section className="sq-freshness" aria-label="Datenstand"><StatusBadge tone="success">Live</StatusBadge><span>Berechnet {new Date(data.freshness.calculated_at).toLocaleString("de-CH")}</span><span>Aktive Product-Spots · Test-, Fixture-, archivierte und abgelehnte Spots ausgeschlossen</span></section>
      <section className="sq-heroGrid"><article className="sq-scoreHero"><div className="sq-scoreHeroTop"><div><span className="bi-kicker">Operative Gesamtqualität</span><strong>{data.summary.average_score}%</strong></div><div className="sq-scoreHeroBadge">{data.summary.total} aktive Spots</div></div><div className="sq-scoreTrack"><div className="sq-scoreFill" style={{ width: `${Math.max(0, Math.min(100, data.summary.average_score))}%` }} /></div><p>{data.summary.excellent} Spots sind operativ launchbereit. {data.summary.critical} brauchen dringend Aufmerksamkeit.</p><details className="sq-definition"><summary>Wie wird die Qualität berechnet?</summary><p>100 Punkte aus Identität (40), Bild (15), Beschreibung (10), Öffnungszeiten (10), Kontakt (8), Taxonomie (12) und Freigabe (5). Der Wert beeinflusst weder Ranking noch Gold-Status.</p></details></article><div className="sq-statusGrid"><SummaryCard label="Launchbereit" value={data.summary.excellent} tone="excellent" onSelect={() => chooseIssue("all")} /><SummaryCard label="Gute Basis" value={data.summary.good} tone="good" onSelect={() => chooseIssue("all")} /><SummaryCard label="Ausbaufähig" value={data.summary.needs_work} tone="warning" onSelect={() => chooseIssue("low_quality")} /><SummaryCard label="Kritisch" value={data.summary.critical} tone="critical" onSelect={() => chooseIssue("low_quality")} /></div></section>
      <section className="sq-queueGrid" aria-label="Qualitäts-Queues">{QUEUES.map((queue) => <QueueCard key={queue.filter} label={queue.label} value={data.summary[queue.key]} meaning={queue.meaning} filter={queue.filter} active={issue === queue.filter} danger={queue.danger} onSelect={chooseIssue} />)}</section>
      <section className="bi-card sq-worklist"><div className="sq-worklistHead"><div><span className="bi-kicker">Founder Arbeitsliste</span><h2>{queueLabel}</h2><p>{data.filtered_total} passende Spots · Seite {Math.min(page + 1, totalPages)} von {totalPages}</p></div><div className="sq-toolbar"><label><span className="sr-only">Spots suchen</span><input className="bi-input" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Name, Stadt, Adresse, Spot- oder Google-ID …" /></label><label><span className="sr-only">Qualitätsproblem wählen</span><select className="bi-select" value={issue} onChange={(event) => chooseIssue(event.target.value)}>{ISSUE_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label></div></div>
        {loading ? <LoadingState label="Arbeitsliste wird aktualisiert …" /> : data.rows.length === 0 ? <EmptyState title="Keine Spots in dieser Queue" description="Für den gewählten Filter gibt es aktuell nichts zu bearbeiten." /> : <div className="sq-list">{data.rows.map((spot) => <article className="sq-spotCard" key={spot.spot_id}><div className={`sq-scoreCircle sq-score-${scoreTone(spot.quality_score)}`}><strong>{spot.quality_score}</strong><span>%</span></div><div className="sq-spotMain"><div className="sq-spotTitleRow"><div><h3>{spot.name}</h3><p>{spot.address || spot.city || "Adresse unbekannt"}</p></div><span className={`sq-qualityLabel sq-label-${scoreTone(spot.quality_score)}`}>{scoreLabel(spot.quality_score)}</span></div><div className="sq-facts"><span>{spot.photo_count} Backyrd-Bilder</span><span>{spot.opening_slot_count} Zeitfenster</span><span>{spot.taxonomy_count} Taxonomien</span><span>{spot.google_place_id ? "Google verknüpft" : "Google nicht verknüpft"}</span></div><div className="sq-issues">{spot.issues.slice(0, 5).map((item) => <span className={`sq-issue sq-issue-${item.severity}`} key={item.key}>{item.label}</span>)}{spot.issues.length > 5 ? <span className="sq-issue sq-issue-more">+{spot.issues.length - 5} weitere</span> : null}</div></div><div className="sq-spotActions"><Link className="bi-primaryButton" href={`/spots/${spot.spot_id}/edit?returnTo=${encodeURIComponent(returnTo)}`}>Verbessern</Link><Link className="bi-actionButton" href={spot.google_place_id ? `/spot-quality/${spot.spot_id}/enrichment?returnTo=${encodeURIComponent(returnTo)}` : `/spot-quality/${spot.spot_id}/google-backfill?returnTo=${encodeURIComponent(returnTo)}`}>{spot.google_place_id ? "Google-Daten" : "Google finden"}</Link><Link className="bi-action" href={`/spots/${spot.spot_id}?returnTo=${encodeURIComponent(returnTo)}`}>Spot-Übersicht →</Link></div></article>)}</div>}
        {totalPages > 1 ? <nav className="sq-pagination" aria-label="Seitennavigation"><button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>← Zurück</button><span>Seite {page + 1} von {totalPages}</span><button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Weiter →</button></nav> : null}
      </section>
    </> : null}
  </div>;
}

function SummaryCard({ label, value, tone, onSelect }: { label: string; value: number; tone: string; onSelect: () => void }) { return <button type="button" className={`sq-summaryCard sq-summary-${tone}`} onClick={onSelect}><span>{label}</span><strong>{value}</strong></button>; }
function QueueCard({ label, value, meaning, filter, active, danger=false, onSelect }: { label: string; value: number; meaning: string; filter: string; active: boolean; danger?: boolean; onSelect: (value: string) => void }) { return <button type="button" className={["sq-queueCard",active ? "active" : "",danger ? "danger" : ""].filter(Boolean).join(" ")} onClick={() => onSelect(active ? "all" : filter)} aria-pressed={active}><span>{label}</span><strong>{value}</strong><p>{meaning}</p><small>{active ? "Filter entfernen" : "Arbeitsliste öffnen →"}</small></button>; }
