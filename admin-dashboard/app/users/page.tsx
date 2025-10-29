"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type UserProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  city?: string | null;
  is_local?: boolean | null;
  created_at: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const [favCounts, setFavCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);

    try {
      // 🧍 Nutzer laden
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, city, is_local, created_at");

      if (profErr) throw profErr;
      setUsers(profiles as UserProfile[]);

      // 📝 Reviews zählen
      const { data: allReviews, error: revErr } = await supabase
        .from("reviews")
        .select("user_id");
      if (revErr) throw revErr;

      const reviewCounter: Record<string, number> = {};
      allReviews?.forEach((r) => {
        if (r.user_id) {
          reviewCounter[r.user_id] = (reviewCounter[r.user_id] || 0) + 1;
        }
      });
      setReviewCounts(reviewCounter);

      // ❤️ Favoriten zählen
      const { data: allFavs, error: favErr } = await supabase
        .from("favorites")
        .select("user_id");
      if (favErr) throw favErr;

      const favCounter: Record<string, number> = {};
      allFavs?.forEach((f) => {
        if (f.user_id) {
          favCounter[f.user_id] = (favCounter[f.user_id] || 0) + 1;
        }
      });
      setFavCounts(favCounter);
    } catch (e: any) {
      console.error("Fehler beim Laden der Benutzer:", e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm("Diesen Benutzer wirklich löschen?")) return;

    try {
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e: any) {
      alert("Fehler beim Löschen: " + e.message);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6 text-white">👤 Benutzerverwaltung</h1>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Name</th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Stadt</th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Typ</th>
              <th className="px-4 py-2 text-center text-sm font-semibold text-gray-300">Reviews</th>
              <th className="px-4 py-2 text-center text-sm font-semibold text-gray-300">Favoriten</th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-300">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  ⏳ Benutzer werden geladen...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Keine Benutzer gefunden.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-2 text-white">
                    {user.first_name ?? "Unbekannt"} {user.last_name ?? ""}
                  </td>
                  <td className="px-4 py-2 text-gray-300">{user.city || "–"}</td>
                  <td className="px-4 py-2 text-gray-300">
                    {user.is_local === true
                      ? "Local"
                      : user.is_local === false
                      ? "Tourist"
                      : "Unbekannt"}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-300">
                    {reviewCounts[user.id] ?? 0}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-300">
                    {favCounts[user.id] ?? 0}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => deleteUser(user.id)}
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
