"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Stats = {
  users: number;
  spots: number;
  reviews: number;
  pendingSpots: number;
  pendingReviews: number;
};

type RecentSpot = {
  id: string;
  name: string;
  city: string | null;
  created_at: string;
};

type RecentReview = {
  id: string;
  text: string | null;
  created_at: string;
  spot: { name: string } | null;
  mood_a: string | null;
  mood_b: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSpots, setRecentSpots] = useState<RecentSpot[]>([]);
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);

    // --- COUNTS ---
    const { count: userCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    const { count: spotCount } = await supabase
      .from("spots")
      .select("*", { count: "exact", head: true });

    const { count: reviewCount } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true });

    const { count: pendingSpots } = await supabase
      .from("spots")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: pendingReviews } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true });

    // --- RECENT SPOTS ---
    const { data: spots } = await supabase
      .from("spots")
      .select("id, name, city, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    // --- RECENT REVIEWS ---
    const { data: reviews } = await supabase
      .from("reviews")
      .select(`
        id,
        text,
        created_at,
        mood_a,
        mood_b,
        spot:spots ( name )
      `)
      .order("created_at", { ascending: false })
      .limit(5);

    setStats({
      users: userCount ?? 0,
      spots: spotCount ?? 0,
      reviews: reviewCount ?? 0,
      pendingSpots: pendingSpots ?? 0,
      pendingReviews: pendingReviews ?? 0,
    });

    setRecentSpots(spots ?? []);
    setRecentReviews(reviews ?? []);
    setLoading(false);
  }

  // ---------------------------------------------
  // UI
  // ---------------------------------------------
  return (
    <div className="min-h-screen bg-black text-white p-8 space-y-10">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold">Dashboard</h1>

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/");
          }}
          className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold"
        >
          Logout
        </button>
      </div>

      {/* STATS */}
      {loading ? (
        <p>Lade Daten…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatBox label="Nutzer" value={stats!.users} />
          <StatBox label="Spots" value={stats!.spots} />
          <StatBox label="Reviews" value={stats!.reviews} />
          <StatBox label="Wartende Spots" value={stats!.pendingSpots} />
          <StatBox label="Neue Reviews" value={stats!.pendingReviews} />
        </div>
      )}

      {/* QUICK ACTIONS */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Quick Actions</h2>
        <div className="flex gap-4 flex-wrap">
          <QuickAction label="Neuen Spot erstellen" href="/spots/new" />
          <QuickAction label="Spots verwalten" href="/spots" />
          <QuickAction label="Review Übersicht" href="/reviews" />
        </div>
      </div>

      {/* RECENT SPOTS */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Zuletzt hinzugefügte Spots</h2>
        <RecentList>
          {recentSpots.map((s) => (
            <RecentListItem
              key={s.id}
              title={s.name}
              subtitle={s.city ?? ""}
              date={s.created_at}
              href={`/spots/${s.id}/edit`}
            />
          ))}
        </RecentList>
      </div>

      {/* RECENT REVIEWS */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Neueste Reviews</h2>
        <RecentList>
          {recentReviews.map((r) => (
            <RecentListItem
              key={r.id}
              title={r.spot?.name ?? "Unknown Spot"}
              subtitle={r.text?.slice(0, 60) + "…"}
              date={r.created_at}
              href={`/reviews/${r.id}`}
              badges={[r.mood_a, r.mood_b].filter(Boolean) as string[]}
            />
          ))}
        </RecentList>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-neutral-900 p-6 rounded-xl text-center border border-neutral-800">
      <p className="text-gray-400 text-sm">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function RecentList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

function RecentListItem({
  title,
  subtitle,
  date,
  href,
  badges = [],
}: {
  title: string;
  subtitle?: string;
  date: string;
  href: string;
  badges?: string[];
}) {
  return (
    <a
      href={href}
      className="block p-4 bg-neutral-900 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition"
    >
      <div className="flex justify-between items-center">
        <div>
          <p className="font-semibold">{title}</p>
          {subtitle && <p className="text-gray-400 text-sm">{subtitle}</p>}
          <p className="text-gray-500 text-xs mt-1">
            {new Date(date).toLocaleDateString("de-CH")}
          </p>
        </div>

        {badges.length > 0 && (
          <div className="flex gap-2">
            {badges.map((b) => (
              <span
                key={b}
                className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

function QuickAction({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg font-semibold"
    >
      {label}
    </a>
  );
}
