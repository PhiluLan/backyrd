//admin-dashboard/app/spots/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Spot, SpotStatus } from "@/types/spots";

type SpotListItem = Pick<Spot, "id" | "name" | "city" | "status" | "created_at">;

const STATUS_LABELS: Record<SpotStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  hidden: "Hidden",
};

function statusBadgeClass(status: SpotStatus) {
  if (status === "approved") return "by-badge by-badge-green";
  if (status === "rejected") return "by-badge by-badge-red";
  if (status === "pending") return "by-badge by-badge-yellow";
  return "by-badge";
}

export default function SpotsPage() {
  const [spots, setSpots] = useState<SpotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SpotStatus | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadSpots();
  }, []);

  async function loadSpots() {
    setLoading(true);

    const { data, error } = await supabase
      .from("spots")
      .select("id, name, city, status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fehler beim Laden der Spots:", error);
      setSpots([]);
    } else {
      setSpots((data ?? []) as SpotListItem[]);
    }

    setLoading(false);
  }

  const filteredSpots = useMemo(() => {
    const q = search.trim().toLowerCase();
    return spots.filter((spot) => {
      if (statusFilter !== "all" && spot.status !== statusFilter) return false;
      if (q.length > 0) {
        return (
          spot.name.toLowerCase().includes(q) ||
          (spot.city ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [spots, statusFilter, search]);

  return (
    <div className="by-page">
      <div className="by-header">
        <div>
          <h1 className="by-title">Spots</h1>
          <div className="by-subtitle">
            Verwaltung aller Spots im Backyrd Universum.
          </div>
        </div>

        <div className="by-toolbar">
          <Link href="/spots/new" className="by-btn by-btn-blue">
            + Neuer Spot
          </Link>
        </div>
      </div>

      <div className="by-card by-section">
        <div className="by-toolbar">
          <input
            type="text"
            placeholder="Suche nach Name oder Stadt…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="by-input"
            style={{ maxWidth: 360 }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SpotStatus | "all")}
            className="by-select"
            style={{ maxWidth: 220 }}
          >
            <option value="all">Alle Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="hidden">Hidden</option>
          </select>

          <button type="button" onClick={() => void loadSpots()} className="by-btn by-btn-soft">
            {loading ? "Lade…" : "Neu laden"}
          </button>

          <div className="by-muted by-small" style={{ marginLeft: "auto" }}>
            {filteredSpots.length} Spots
          </div>
        </div>
      </div>

      <div className="by-card by-section">
        {loading ? (
          <div className="by-muted by-small">Lade Spots…</div>
        ) : filteredSpots.length === 0 ? (
          <div className="by-muted by-small">Keine Spots gefunden.</div>
        ) : (
          <div className="by-tableWrap">
            <table className="by-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Stadt</th>
                  <th>Status</th>
                  <th>Erstellt</th>
                  <th style={{ textAlign: "right" }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filteredSpots.map((spot) => (
                  <tr key={spot.id}>
                    <td style={{ fontWeight: 900 }}>{spot.name}</td>
                    <td className="by-muted">{spot.city ?? "—"}</td>
                    <td>
                      <span className={statusBadgeClass(spot.status)}>
                        {STATUS_LABELS[spot.status]}
                      </span>
                    </td>
                    <td className="by-muted">
                      {new Date(spot.created_at).toLocaleDateString("de-CH")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/spots/${spot.id}`} className="by-link">
                        Bearbeiten
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
