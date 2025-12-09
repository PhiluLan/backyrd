"use client";

import { useEffect, useState } from "react";
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

export default function SpotsPage() {
  const [spots, setSpots] = useState<SpotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SpotStatus | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadSpots();
  }, []);

  async function loadSpots() {
    setLoading(true);

    const { data, error } = await supabase
      .from("spots")
      .select("id, name, city, status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fehler beim Laden der Spots:", error);
    } else {
      setSpots((data ?? []) as SpotListItem[]);
    }

    setLoading(false);
  }

  const filteredSpots = spots.filter((spot) => {
    if (statusFilter !== "all" && spot.status !== statusFilter) return false;
    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      return (
        spot.name.toLowerCase().includes(q) ||
        (spot.city ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Spots</h1>
          <p className="text-sm text-gray-500">
            Verwaltung aller Spots im Backyrd Universum.
          </p>
        </div>

        <Link
          href="/spots/new"
          className="inline-flex items-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          + Neuer Spot
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Suche nach Name oder Stadt…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/5"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SpotStatus | "all")}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/5"
        >
          <option value="all">Alle Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="hidden">Hidden</option>
        </select>

        <button
          type="button"
          onClick={loadSpots}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Neu laden
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Lade Spots…</p>
      ) : filteredSpots.length === 0 ? (
        <p className="text-sm text-gray-500">Keine Spots gefunden.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Stadt</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Erstellt</th>
                <th className="px-4 py-2 font-medium text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filteredSpots.map((spot) => (
                <tr key={spot.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{spot.name}</td>
                  <td className="px-4 py-2">{spot.city ?? "-"}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                      {STATUS_LABELS[spot.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {new Date(spot.created_at).toLocaleDateString("de-CH")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/spots/${spot.id}/edit`}
                      className="text-sm text-blue-600 hover:underline"
                    >
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
  );
}
