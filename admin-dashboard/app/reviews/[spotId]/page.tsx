// app/reviews/[spotId]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// --- Typen ---
type ReviewRow = {
  id: string;
  text: string | null;
  created_at: string;

  mood_a?: string | null;
  mood_b?: string | null;

  mood_a_token?: { token: string } | null;
  mood_b_token?: { token: string } | null;

  review_photos?: { url: string }[];
  profiles: { first_name: string | null } | null;
};

type SpotInfo = {
  id: string;
  name: string;
  city: string | null;
};

type PageProps = {
  params: Promise<{ spotId: string }>;
};

export default function ReviewSpotPage({ params }: PageProps) {
  // ✅ KORREKT FÜR NEXT.JS 15 → params ist ein Promise
  const { spotId } = React.use(params);

  const [spot, setSpot] = useState<SpotInfo | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spotId) return;
    load();
  }, [spotId]);

  async function load() {
    setLoading(true);

    // --- Spot laden ---
    const { data: spotData, error: spotError } = await supabase
      .from("spots")
      .select("id, name, city")
      .eq("id", spotId)
      .single();

    if (spotError) {
      console.error("Spot Load Error:", JSON.stringify(spotError, null, 2));
      setLoading(false);
      return;
    }

    // --- Reviews laden ---
    const { data: reviewData, error: reviewError } = await supabase
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
      .order("created_at", { ascending: false });

    console.error("Review Ladefehler:", JSON.stringify(reviewError, null, 2));

    setSpot(spotData);
    setReviews(reviewData ?? []);
    setLoading(false);
  }

  async function deleteReview(id: string) {
    if (!confirm("Review löschen?")) return;

    console.log("DELETE START", id);

    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("id", id);

    console.log("DELETE RESULT:", error);

    if (!error) {
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } else {
      alert("Fehler beim Löschen: " + JSON.stringify(error, null, 2));
    }
  }

  if (loading) return <p className="p-8 text-gray-400">Lade Daten…</p>;
  if (!spot) return <p className="p-8 text-red-400">Spot nicht gefunden.</p>;

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
        {reviews.length === 0 ? (
          <p className="text-gray-400">Keine Reviews vorhanden.</p>
        ) : (
          reviews.map((r) => {
            const moodA = r.mood_a_token?.token ?? r.mood_a ?? null;
            const moodB = r.mood_b_token?.token ?? r.mood_b ?? null;

            return (
              <div
                key={r.id}
                className="border border-gray-700 rounded-lg p-4 bg-gray-900 space-y-2"
              >
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-400">
                    {new Date(r.created_at).toLocaleDateString("de-CH")}
                  </p>

                  <button
                    onClick={() => {
                      console.log("KLICK AUF DELETE BUTTON", r.id);
                      deleteReview(r.id);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded"
                  >
                    Löschen
                  </button>
                </div>

                <p className="text-gray-300">{r.text ?? "–"}</p>

                <p className="text-sm text-gray-400">
                  Moods: {[moodA, moodB].filter(Boolean).join(", ") || "–"}
                </p>

                {r.review_photos?.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pt-2">
                    {r.review_photos.map((p, idx) => (
                      <img
                        key={idx}
                        src={p.url}
                        className="w-28 h-28 object-cover rounded border border-gray-700"
                      />
                    ))}
                  </div>
                )}

                <p className="text-gray-500 text-xs">
                  von {r.profiles?.first_name ?? "Unbekannt"}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
