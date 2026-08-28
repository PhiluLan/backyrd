"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { AdminPageHeader, EmptyState, FilterBar, LoadingState } from "@/components/admin/AdminUi";

type SpotWithCount = {
  id: string;
  name: string;
  city: string | null;
  review_count: number;
};

export default function ReviewsOverview() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [spots, setSpots] = useState<SpotWithCount[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) params.set("q", search.trim());
      else params.delete("q");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [pathname, router, search, searchParams]);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase.rpc("spots_with_review_count");

    if (error) {
      setError(error.message);
      setSpots([]);
    } else {
      setError("");
      setSpots(data ?? []);
    }

    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return spots;
    return spots.filter((s) => {
      return (
        s.name.toLowerCase().includes(q) || (s.city ?? "").toLowerCase().includes(q)
      );
    });
  }, [spots, search]);

  return (
    <div className="by-page admin-page">
      <AdminPageHeader eyebrow="Reviews" title="Erfahrungen prüfen" description="Finde Reviews nach Spot und öffne die zugehörige Moderationsansicht." actions={<button className="by-btn by-btn-soft" onClick={() => void load()} disabled={loading}>{loading ? "Wird geladen …" : "Aktualisieren"}</button>} />
      {error ? <div className="admin-errorState"><div><strong>Reviews konnten nicht geladen werden.</strong><span>{error}</span></div><button onClick={() => void load()}>Erneut versuchen</button></div> : null}
      <div className="admin-listPanel">
        <FilterBar resultLabel={`${filtered.length} Spots`}>
          <input
            type="text"
            placeholder="Spot oder Stadt suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="by-input"
          />
        </FilterBar>
        {loading ? <LoadingState label="Reviews werden geladen …" /> : filtered.length === 0 ? <EmptyState title="Keine Reviews gefunden" description="Für diese Suche gibt es keine Spots mit Reviews." /> : <>
        <div className="admin-desktopTable">
          <table className="by-table">
            <thead>
              <tr>
                <th>Spot</th>
                <th>Stadt</th>
                <th>Reviews</th>
                <th style={{ textAlign: "right" }}>Aktion</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 1000 }}>{s.name}</td>
                    <td className="by-muted">{s.city ?? "—"}</td>
                    <td>{s.review_count}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="by-link" href={`/reviews/${s.id}`}>
                        Anzeigen →
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="admin-mobileList">{filtered.map((spot) => <article className="admin-reviewCard" key={spot.id}><div><span className="admin-reviewCount">{spot.review_count}</span><div><h2>{spot.name}</h2><p>{spot.city ?? "Ort unbekannt"} · {spot.review_count === 1 ? "1 Review" : `${spot.review_count} Reviews`}</p></div></div><Link href={`/reviews/${spot.id}`}>Reviews ansehen</Link></article>)}</div>
        </>}
      </div>
    </div>
  );
}
