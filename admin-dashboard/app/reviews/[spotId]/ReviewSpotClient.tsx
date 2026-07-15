"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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

    if (spotError) console.error("Spot Load Error:", spotError);
    if (reviewError) console.error("Review Load Error:", reviewError);

    setSpot((spotData as SpotInfo | null) ?? null);
    setReviews((reviewData ?? []) as unknown as ReviewRow[]);
    setLoading(false);
  }, [spotId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteReview(id: string) {
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (!error) setReviews((current) => current.filter((review) => review.id !== id));
  }

  if (loading) return <p>Lade…</p>;
  if (!spot) return <p>Spot nicht gefunden.</p>;

  return (
    <div className="p-8 text-white space-y-6">
      <h1 className="text-2xl font-bold">
        Reviews für <span className="text-blue-300">{spot.name}</span>
      </h1>

      <Link href={`/reviews/${spot.id}/new`} className="inline-block bg-blue-600 px-4 py-2 rounded hover:bg-blue-700">
        + Neues Review
      </Link>

      <div className="space-y-4 mt-6">
        {reviews.map((review) => {
          const moodA = firstRelation(review.mood_a_token)?.token ?? review.mood_a;
          const moodB = firstRelation(review.mood_b_token)?.token ?? review.mood_b;
          const profile = firstRelation(review.profiles);

          return (
            <div key={review.id} className="border border-gray-700 rounded p-4 space-y-2">
              <p>{review.text ?? "–"}</p>
              <p className="text-sm text-gray-400">
                Moods: {[moodA, moodB].filter(Boolean).join(", ") || "–"}
              </p>
              <p className="text-xs text-gray-500">von {profile?.first_name ?? "Unbekannt"}</p>
              <button onClick={() => void deleteReview(review.id)} className="text-sm text-red-400">
                Löschen
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
