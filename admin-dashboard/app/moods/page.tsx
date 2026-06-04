"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  id: number;
  label: string;
  label_norm: string;
  primary_cluster_id: number | null;
  primary_cluster_name: string | null;
  spots_count: number;
  tokens_count: number;
};

export default function MoodsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("admin_concepts_overview_v1")
      .select("*")
      .order("spots_count", { ascending: false });

    if (error) console.error(error);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const hay = `${r.label} ${r.label_norm} ${r.primary_cluster_name ?? ""} ${r.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="by-page">
      <div className="by-header">
        <div>
          <h1 className="by-title">Moods / Concepts</h1>
          <div className="by-subtitle">Konzepte, Cluster, Usage in Spots.</div>
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche Concept…"
            className="by-input"
            style={{ maxWidth: 420 }}
          />
          <div className="by-muted by-small" style={{ marginLeft: "auto" }}>
            {filtered.length} Concepts
          </div>
        </div>
      </div>

      <div className="by-card by-section">
        {loading ? (
          <div className="by-muted by-small">Lade…</div>
        ) : filtered.length === 0 ? (
          <div className="by-muted by-small">Keine Concepts gefunden.</div>
        ) : (
          <div className="by-tableWrap">
            <table className="by-table">
              <thead>
                <tr>
                  <th>Concept</th>
                  <th>Cluster</th>
                  <th>Spots</th>
                  <th>Tokens</th>
                  <th style={{ textAlign: "right" }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 1000 }}>{r.label}</div>
                      <div className="by-muted by-xs by-mono">{r.id}</div>
                    </td>
                    <td className="by-muted">{r.primary_cluster_name ?? "—"}</td>
                    <td>{r.spots_count ?? 0}</td>
                    <td>{r.tokens_count ?? 0}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/moods/${r.id}`} className="by-link">
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
