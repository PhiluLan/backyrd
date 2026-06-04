"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboardHome() {
  const [stats, setStats] = useState<{
    spotsTotal: number;
    spotsPending: number;
    spotsApproved: number;
    reviewsTotal: number;
    usersTotal: number;
    spotsWeek: number;
    reviewsWeek: number;
    usersWeek: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      // Spots
      const { count: spotsTotal } = await supabase
        .from("spots")
        .select("*", { count: "exact", head: true });

      const { count: spotsPending } = await supabase
        .from("spots")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      const { count: spotsApproved } = await supabase
        .from("spots")
        .select("*", { count: "exact", head: true })
        .eq("status", "approved");

      // Reviews
      const { count: reviewsTotal } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true });

      // Users
      const { count: usersTotal } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Neue Einträge letzte 7 Tage
      const since = new Date();
      since.setDate(since.getDate() - 7);

      const { count: spotsWeek } = await supabase
        .from("spots")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since.toISOString());

      const { count: reviewsWeek } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since.toISOString());

      const { count: usersWeek } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since.toISOString());

      setStats({
        spotsTotal: spotsTotal ?? 0,
        spotsPending: spotsPending ?? 0,
        spotsApproved: spotsApproved ?? 0,
        reviewsTotal: reviewsTotal ?? 0,
        usersTotal: usersTotal ?? 0,
        spotsWeek: spotsWeek ?? 0,
        reviewsWeek: reviewsWeek ?? 0,
        usersWeek: usersWeek ?? 0,
      });
    } catch (e) {
      console.error("Fehler beim Laden der Statistiken:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 text-white">
      <h1 className="text-3xl font-bold mb-8">📊 Dashboard Übersicht</h1>

      {loading || !stats ? (
        <p className="text-gray-400">Lade Statistiken…</p>
      ) : (
        <>
          {/* Kennzahlen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            <StatBox title="📍 Spots gesamt" value={stats.spotsTotal} />
            <StatBox title="⏳ Pending Spots" value={stats.spotsPending} />
            <StatBox title="✅ Approved Spots" value={stats.spotsApproved} />
            <StatBox title="📝 Reviews gesamt" value={stats.reviewsTotal} />
            <StatBox title="👤 Benutzer gesamt" value={stats.usersTotal} />
          </div>

          {/* Letzte 7 Tage */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">📅 Letzte 7 Tage</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-gray-400 text-sm">Neue Spots</p>
                <p className="text-2xl font-bold">{stats.spotsWeek}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Neue Reviews</p>
                <p className="text-2xl font-bold">{stats.reviewsWeek}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Neue User</p>
                <p className="text-2xl font-bold">{stats.usersWeek}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatBox({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 shadow-md">
      <h2 className="text-gray-400 text-sm mb-2">{title}</h2>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}
