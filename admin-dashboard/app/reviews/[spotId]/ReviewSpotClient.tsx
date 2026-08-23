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

type TokenRelation = { token: string } | { token: string }[] | null;
type ProfileRelation = { first_name: string | null } | { first_name: string | null }[] | null;

type ReviewRow = {
  id: string;
  text: string | null;
  created_at: string;
  mood_a: string | null;
  mood_b: string | null;
  profiles: ProfileRelation;
  mood_a_token: TokenRelation;
  mood_b_token: TokenRelation;
  review_photos: { url: string }[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function ReviewSpotClient({ spotId }: { spotId: string }) {
  const [spot, setSpot] = useState<SpotInfo | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    const [{ data: spotData, error: spotError }, { data: reviewData, error: reviewError }] =
      await Promise.all([
        supabase.from("spots").select("id, name, city").eq("id", spotId).single(),
        supabase
          .from("reviews")
          .select(`
            id,
            text,
            created_at,
            mood_a,
            mood_b,
            profiles:profiles!reviews_user_id_fkey ( first_name ),
            mood_a_token:mood_tokens!reviews_mood_a_fk ( token ),
            mood_b_token:mood_tokens!reviews_mood_b_fk ( token ),
            review_photos ( url )
          `)
          .eq("spot_id", spotId)
          .order("created_at", { ascending: false }),
      ]);

    if (spotError || reviewError) setError(spotError?.message ?? reviewError?.message ?? "Reviews konnten nicht geladen werden.");
    else setError("");

    setSpot((spotData as SpotInfo | null) ?? null);
    setReviews((reviewData ?? []) as unknown as ReviewRow[]);
    setLoading(false);
  }, [spotId]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function deleteReview(id: string) {
    if (!window.confirm("Dieses Review wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (!error) setReviews((current) => current.filter((review) => review.id !== id));
    else setError(error.message);
  }

  if (loading) return <div className="by-page"><LoadingState label="Reviews werden geladen …" /></div>;
  if (!spot) return <div className="by-page"><EmptyState title="Spot nicht gefunden" description={error || "Der Spot ist nicht mehr verfügbar."} action={{href:"/reviews",label:"Zur Review-Übersicht"}} /></div>;

  return (
    <div className="by-page admin-page">
      <AdminPageHeader eyebrow="Reviews" title={spot.name} description={`${spot.city ?? "Ort unbekannt"} · ${reviews.length} ${reviews.length === 1 ? "Review" : "Reviews"}`} actions={<><Link href="/reviews" className="bi-actionButton">Zur Übersicht</Link><Link href={`/reviews/${spot.id}/new`} className="bi-primaryButton">Review erfassen</Link></>} />
      {error ? <div className="admin-errorState"><div><strong>Aktion fehlgeschlagen.</strong><span>{error}</span></div></div> : null}
      {reviews.length === 0 ? <EmptyState title="Noch keine Reviews" description="Für diesen Spot wurden noch keine Erfahrungen erfasst." /> : <div className="admin-reviewGrid">
        {reviews.map((review) => {
          const moodA = firstRelation(review.mood_a_token)?.token ?? review.mood_a;
          const moodB = firstRelation(review.mood_b_token)?.token ?? review.mood_b;
          const profile = firstRelation(review.profiles);
          const moods = [moodA, moodB].filter((value): value is string => Boolean(value));

          return (
            <article key={review.id} className="admin-reviewDetailCard">
              <header><div><strong>{profile?.first_name ?? "Backyrd Nutzer"}</strong><span>{new Date(review.created_at).toLocaleString("de-CH", {dateStyle:"medium",timeStyle:"short"})}</span></div><StatusBadge tone="success">Aktiv</StatusBadge></header>
              <p className="admin-reviewText">{review.text || "Kein Text – dieses Review enthält nur strukturierte Signale."}</p>
              <div className="admin-reviewMoods"><span>Moods</span>{moods.length ? moods.map((mood) => <b key={mood}>{mood}</b>) : <em>Keine</em>}</div>
              {review.review_photos?.length ? <div className="admin-reviewPhotos">{review.review_photos.map((photo) => <img key={photo.url} src={photo.url} alt="Review-Aufnahme" />)}</div> : null}
              <footer><span>Quelle: Product Review</span><button onClick={() => void deleteReview(review.id)}>Review löschen</button></footer>
            </article>
          );
        })}
      </div>}
    </div>
  );
}
