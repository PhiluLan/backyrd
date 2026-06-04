//admin-dashboard/app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Stats = {
  users: number;
  spots: number;
  reviews: number;
  pendingSpots: number;
  pendingReviews: number;
  pendingClaims: number;
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
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);

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

    const { data: pendingClaimRows } = await supabase.rpc("get_spot_claim_queue_v2", {
      p_status: "pending",
      p_limit: 200,
    });

    const { data: spots } = await supabase
      .from("spots")
      .select("id, name, city, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    const { data: reviews } = await supabase
      .from("reviews")
      .select(
        `
        id,
        text,
        created_at,
        mood_a,
        mood_b,
        spot:spots ( name )
      `
      )
      .order("created_at", { ascending: false })
      .limit(5);

    setStats({
      users: userCount ?? 0,
      spots: spotCount ?? 0,
      reviews: reviewCount ?? 0,
      pendingSpots: pendingSpots ?? 0,
      pendingReviews: pendingReviews ?? 0,
      pendingClaims: Array.isArray(pendingClaimRows) ? pendingClaimRows.length : 0,
    });

    setRecentSpots(spots ?? []);
    setRecentReviews(reviews ?? []);
    setLoading(false);
  }

  return (
    <div className="by-page by-dashboard by-container-wide">
      {/* HEADER */}
      <div className="by-dashboardHeader">
        <div>
          <h1 className="by-dashboardTitle">Dashboard</h1>
          <div className="by-dashboardSubtitle">Überblick über Backyrd Admin.</div>
        </div>

        <div className="by-toolbar">
          <button className="by-btn by-btn-soft" onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? "Lade…" : "Neu laden"}
          </button>

          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/");
            }}
            className="by-btn by-btn-accent"
          >
            Logout
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="by-card by-section">
        {loading || !stats ? (
          <div className="by-muted by-small">Lade Daten…</div>
        ) : (
          <div className="by-statsGrid">
            <StatCard label="Nutzer" value={stats.users} />
            <StatCard label="Spots" value={stats.spots} />
            <StatCard label="Reviews" value={stats.reviews} />
            <StatCard label="Wartende Spots" value={stats.pendingSpots} />
            <StatCard label="Offene Claims" value={stats.pendingClaims} />
            <StatCard label="Reviews (gesamt)" value={stats.pendingReviews} />
          </div>
        )}
      </div>

      {/* QUICK ACTIONS */}
      <div className="by-card by-section">
        <div style={{ marginBottom: 10 }}>
          <div className="by-cardTitle">Quick Actions</div>
          <div className="by-cardHint">Schnelle Links für häufige Aufgaben.</div>
        </div>

        <div className="by-toolbar">
          <QuickAction label="+ Neuer Spot" href="/spots/new" variant="blue" />
          <QuickAction label="Claims prüfen" href="/claims" variant="blue" />
          <QuickAction label="Spots verwalten" href="/spots" variant="soft" />
          <QuickAction label="Review Übersicht" href="/reviews" variant="soft" />
        </div>
      </div>

      {/* RECENT SPOTS */}
      <div className="by-card by-section">
        <div style={{ marginBottom: 10 }}>
          <div className="by-cardTitle">Zuletzt hinzugefügte Spots</div>
          <div className="by-cardHint">Die neuesten 5 Spots.</div>
        </div>

        <div className="by-listCompact">
          {recentSpots.map((s) => (
            <RecentRow
              key={s.id}
              title={s.name}
              subtitle={s.city ?? ""}
              date={s.created_at}
              href={`/spots/${s.id}`}
            />
          ))}
        </div>
      </div>

      {/* RECENT REVIEWS */}
      <div className="by-card by-section">
        <div style={{ marginBottom: 10 }}>
          <div className="by-cardTitle">Neueste Reviews</div>
          <div className="by-cardHint">Die neuesten 5 Reviews.</div>
        </div>

        <div className="by-listCompact">
          {recentReviews.map((r) => (
            <RecentRow
              key={r.id}
              title={r.spot?.name ?? "Unknown Spot"}
              subtitle={(r.text ?? "").length ? (r.text ?? "").slice(0, 72) + "…" : "—"}
              date={r.created_at}
              href={`/reviews/${r.id}`}
              badges={[r.mood_a, r.mood_b].filter(Boolean) as string[]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="by-panel by-statCard">
      <div className="by-statLabel">{label}</div>
      <div className="by-statValue">{value}</div>
    </div>
  );
}

function QuickAction({
  label,
  href,
  variant,
}: {
  label: string;
  href: string;
  variant: "blue" | "soft";
}) {
  const cls = variant === "blue" ? "by-btn by-btn-blue" : "by-btn by-btn-soft";
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}

function RecentRow({
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
    <Link href={href} className="by-panel" style={{ padding: 12, textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 1000 }}>{title}</div>
          {subtitle ? <div className="by-muted by-small">{subtitle}</div> : null}
          <div className="by-muted by-xs" style={{ marginTop: 6 }}>
            {new Date(date).toLocaleDateString("de-CH")}
          </div>
        </div>

        {badges.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {badges.map((b) => (
              <span key={b} className="by-badge">
                {b}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
