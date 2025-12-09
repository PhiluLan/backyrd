"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function ReviewSpotClient({ spotId }: { spotId: string }) {
  const [spot, setSpot] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [spotId]);

  async function load() {
    setLoading(true);

    // Spot laden
    const { data: spotData } = await supabase
      .from("spots")
      .select("id, name, city")
      .eq("id", spotId)
      .single();

    // Reviews
    const { data: reviewData } = await supabase
      .from("reviews")
      .select(`
        id,
        text,
        created_at,
        mood_a,
        mood_b,

        profiles:profiles!reviews_user_id_fkey (
          first_name
        ),

        mood_a_token:mood_tokens!reviews_mood_a_fk ( token ),
        mood_b_token:mood_tokens!reviews_mood_b_fk ( token ),

        review_photos ( url )
      `)
      .eq("spot_id", spotId)
      .order("created_at", { ascending: false });

    setSpot(spotData);
    setReviews(reviewData ?? []);
    setLoading(false);
  }

  async function deleteReview(id: string) {
    console.log("DELETE CLICKED", id);

    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("id", id);

    console.log("DELETE RESULT:", error);

    if (!error) {
      setReviews((prev) => prev.filter((r) => r.id !== id));
    }
  }

  if (loading) return <p>Lade…</p>;
  if (!spot) return <p>Spot nicht gefunden.</p>;

  return (
    <div className="p-8 text-white space-y-6">
      <h1 className="text-2xl font-bold">
        Reviews für <span className="text-blue-300">{spot.name}</span>
      </h1>

      <Link
        href={`/reviews/${spot.id}/new`}
        className="inline-block bg-blue-600 px-4 py-2 rounded hover:bg-blue-700"
      >
        + Neues Review
      </Link>

      <div className="space-y-4 mt-6">
        {reviews.map((r) => {
          const moodA = r.mood_a_token?.token ?? r.mood_a ?? null;
          const moodB = r.mood_b_token?.token ?? r.mood_b ?? null;

          return (
            <div key={r.id} className="border border-gray-700 rounded p-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("CLICK DELETE", r.id);
                  deleteReview(r.id);
                }}
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
