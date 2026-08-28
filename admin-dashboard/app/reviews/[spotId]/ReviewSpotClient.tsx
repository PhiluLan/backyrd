"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AdminPageHeader, EmptyState, LoadingState, StatusBadge } from "@/components/admin/AdminUi";

type SpotInfo = {
  id: string;
  name: string;
  city: string | null;
};

type ReviewRow = {
  id: string;
  text: string | null;
  created_at: string;
  mood_a: string | null;
  mood_b: string | null;
  profile_name: string | null;
  photos: { url: string }[];
};
type ReviewDetailResponse={spot:SpotInfo;reviews:ReviewRow[]};

export default function ReviewSpotClient({ spotId }: { spotId: string }) {
  const [spot, setSpot] = useState<SpotInfo | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    const result=await supabase.rpc("admin_review_spot_detail_v2",{p_spot_id:spotId});
    if(result.error){setError("Reviews konnten nicht geladen werden.");setSpot(null);setReviews([]);}
    else {const response=result.data as ReviewDetailResponse|null;setError("");setSpot(response?.spot??null);setReviews(response?.reviews??[]);}
    setLoading(false);
  }, [spotId]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  if (loading) return <div className="by-page"><LoadingState label="Reviews werden geladen …" /></div>;
  if (!spot) return <div className="by-page"><EmptyState title="Spot nicht gefunden" description={error || "Der Spot ist nicht mehr verfügbar."} action={{href:"/reviews",label:"Zur Review-Übersicht"}} /></div>;

  return (
    <div className="by-page admin-page">
      <AdminPageHeader eyebrow="Reviews" title={spot.name} description={`${spot.city ?? "Ort unbekannt"} · ${reviews.length} ${reviews.length === 1 ? "Review" : "Reviews"}`} actions={<Link href="/reviews" className="bi-actionButton">Zur Übersicht</Link>} />
      {error ? <div className="admin-errorState"><div><strong>Aktion fehlgeschlagen.</strong><span>{error}</span></div></div> : null}
      {reviews.length === 0 ? <EmptyState title="Noch keine Reviews" description="Für diesen Spot wurden noch keine Erfahrungen erfasst." /> : <div className="admin-reviewGrid">
        {reviews.map((review) => {
          const moods = [review.mood_a, review.mood_b].filter((value): value is string => Boolean(value));

          return (
            <article key={review.id} className="admin-reviewDetailCard">
              <header><div><strong>{review.profile_name ?? "Backyrd Nutzer"}</strong><span>{new Date(review.created_at).toLocaleString("de-CH", {dateStyle:"medium",timeStyle:"short"})}</span></div><StatusBadge tone="success">Aktiv</StatusBadge></header>
              <p className="admin-reviewText">{review.text || "Kein Text – dieses Review enthält nur strukturierte Signale."}</p>
              <div className="admin-reviewMoods"><span>Moods</span>{moods.length ? moods.map((mood) => <b key={mood}>{mood}</b>) : <em>Keine</em>}</div>
              {review.photos.length ? <div className="admin-reviewPhotos">{review.photos.map((photo) => <img key={photo.url} src={photo.url} alt="Review-Aufnahme" />)}</div> : null}
              <footer><span>Quelle: Nutzer-Review · Änderungen erfolgen über die Moderationskonsole.</span></footer>
            </article>
          );
        })}
      </div>}
    </div>
  );
}
