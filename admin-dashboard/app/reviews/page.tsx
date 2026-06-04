"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type SpotWithCount = {
  id: string;
  name: string;
  city: string | null;
  review_count: number;
};

export default function ReviewsOverview() {
  const [spots, setSpots] = useState<SpotWithCount[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase.rpc("spots_with_review_count");

    if (error) {
      console.error("Fehler beim Laden:", error.message);
      setSpots([]);
    } else {
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
    <div className="by-page">
      <div className="by-header">
        <div>
          <h1 className="by-title">Reviews</h1>
          <div className="by-subtitle">Übersicht: Reviews nach Spot.</div>
        </div>

        <div className="by-toolbar">
          <button className="by-btn by-btn-soft" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade…" : "Neu laden"}
          </button>
        </div>
      </div>

      <div className="by-card by-section">
        <div className="by-toolbar">
          <input
            type="text"
            placeholder="Spot oder Stadt suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="by-input"
            style={{ maxWidth: 420 }}
          />

          <div className="by-muted by-small" style={{ marginLeft: "auto" }}>
            {filtered.length} Spots
          </div>
        </div>
      </div>

      <div className="by-card by-section">
        <div className="by-tableWrap">
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
              {loading ? (
                <tr>
                  <td colSpan={4} className="by-muted" style={{ padding: 14 }}>
                    ⏳ Lade Spots…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="by-muted" style={{ padding: 14 }}>
                    Keine Spots gefunden.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
