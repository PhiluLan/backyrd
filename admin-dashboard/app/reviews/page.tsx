"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ReviewRow = {
  id: string;
  text: string | null;
  mood_a: string | null;
  mood_b: string | null;
  created_at: string;
  spots: { name: string } | null;
  profiles: { first_name: string | null } | null;
};

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadReviews();
  }, []);

  async function loadReviews() {
    setLoading(true);
    const { data, error } = await supabase
      .from("reviews")
      .select(
        `
        id,
        text,
        mood_a,
        mood_b,
        created_at,
        spots ( name ),
        profiles ( first_name )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fehler beim Laden der Reviews:", error.message);
    } else {
      setReviews(data as ReviewRow[]);
    }
    setLoading(false);
  }

  async function deleteReview(id: string) {
    if (!confirm("Review wirklich löschen?")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) {
      alert("Fehler beim Löschen: " + error.message);
    } else {
      setReviews((prev) => prev.filter((r) => r.id !== id));
    }
  }

  const filtered = reviews.filter((r) => {
    const spotName = r.spots?.name?.toLowerCase() ?? "";
    const userName = r.profiles?.first_name?.toLowerCase() ?? "";
    const q = search.toLowerCase();
    return spotName.includes(q) || userName.includes(q) || (r.text ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6 text-white">📝 Reviews verwalten</h1>

      {/* Suche */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Suche nach Spot, User oder Text..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-1/2 px-3 py-2 rounded bg-gray-800 text-gray-200 placeholder-gray-500 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tabelle */}
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Spot</th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">User</th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Text</th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Moods</th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Datum</th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-300">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  ⏳ Reviews werden geladen...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Keine Reviews gefunden.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-white">{r.spots?.name ?? "–"}</td>
                  <td className="px-4 py-2 text-gray-300">{r.profiles?.first_name ?? "–"}</td>
                  <td className="px-4 py-2 text-gray-400 max-w-xs truncate">{r.text ?? "–"}</td>
                  <td className="px-4 py-2 text-gray-400">
                    {[r.mood_a, r.mood_b].filter(Boolean).join(", ") || "–"}
                  </td>
                  <td className="px-4 py-2 text-gray-400">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => deleteReview(r.id)}
                      className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                    >
                      Löschen
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
