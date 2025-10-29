"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Spot = {
  id: string;
  name: string;
  category: string | null;
  status: "pending" | "approved";
  created_at: string;
};

export default function SpotsPage() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const router = useRouter();

  useEffect(() => {
    loadSpots();
  }, [filter]);

  async function loadSpots() {
    setLoading(true);
    let query = supabase.from("spots").select("*").order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Fehler beim Laden der Spots:", error.message);
    } else {
      setSpots(data as Spot[]);
    }
    setLoading(false);
  }

  async function approveSpot(id: string) {
    const { error } = await supabase.from("spots").update({ status: "approved" }).eq("id", id);
    if (error) {
      alert("Fehler beim Freigeben: " + error.message);
    } else {
      setSpots((prev) => prev.map((s) => (s.id === id ? { ...s, status: "approved" } : s)));
    }
  }

  async function deleteSpot(id: string) {
    if (!confirm("Spot wirklich löschen?")) return;
    const { error } = await supabase.from("spots").delete().eq("id", id);
    if (error) {
      alert("Fehler beim Löschen: " + error.message);
    } else {
      setSpots((prev) => prev.filter((s) => s.id !== id));
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6 text-white">📍 Spots verwalten</h1>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {["all", "pending", "approved"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-3 py-1 rounded ${
              filter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"
            }`}
          >
            {f === "all" ? "Alle" : f === "pending" ? "Pending" : "Approved"}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">📍 Spots verwalten</h1>
        <Link
            href="/spots/new"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
            + Neuer Spot
        </Link>
        </div>

      {/* Tabelle */}
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Name</th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Kategorie</th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Status</th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-300">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  ⏳ Spots werden geladen...
                </td>
              </tr>
            ) : spots.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Keine Spots gefunden.
                </td>
              </tr>
            ) : (
              spots.map((spot) => (
                <tr key={spot.id}>
                  <td className="px-4 py-2 text-white">{spot.name}</td>
                  <td className="px-4 py-2 text-gray-300">{spot.category || "–"}</td>
                  <td
                    className={`px-4 py-2 font-medium ${
                      spot.status === "approved" ? "text-green-400" : "text-yellow-400"
                    }`}
                  >
                    {spot.status}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {spot.status !== "approved" && (
                      <button
                        onClick={() => approveSpot(spot.id)}
                        className="mr-2 text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
                      >
                        Approve
                      </button>
                    )}
                    <button
                      onClick={() => deleteSpot(spot.id)}
                      className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
