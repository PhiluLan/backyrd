"use client";

import { useEffect, useState } from "react";
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
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase.rpc("spots_with_review_count");

    if (error) {
      console.error("Fehler beim Laden:", error.message);
    } else {
      setSpots(data ?? []);
    }

    setLoading(false);
  }

  const filtered = spots.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.city ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-8 text-white">
      <h1 className="text-2xl font-bold mb-6">⭐ Reviews nach Spot</h1>

      {/* Suche */}
      <input
        type="text"
        placeholder="Spot oder Stadt suchen…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full md:w-1/2 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-gray-200"
      />

      <div className="rounded border border-gray-700 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left">Spot</th>
              <th className="px-4 py-2 text-left">Stadt</th>
              <th className="px-4 py-2 text-left">Reviews</th>
              <th className="px-4 py-2 text-right">Aktion</th>
            </tr>
          </thead>

          <tbody className="bg-gray-950 divide-y divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  ⏳ Lade Spots…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Keine Spots gefunden.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2">{s.city ?? "–"}</td>
                  <td className="px-4 py-2">{s.review_count}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/reviews/${s.id}`}>Anzeigen →</Link>

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
