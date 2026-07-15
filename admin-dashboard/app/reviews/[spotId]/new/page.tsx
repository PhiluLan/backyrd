// app/reviews/[spotId]/new/page.tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PageProps = {
  params: Promise<{ spotId: string }>;
};

export default function NewReviewPage({ params }: PageProps) {
  const { spotId } = use(params);
  const router = useRouter();

  const [text, setText] = useState("");
  const [moodA, setMoodA] = useState("");
  const [moodB, setMoodB] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MOOD_OPTIONS = [
    "chillig",
    "laut",
    "gemütlich",
    "stylish",
    "rustikal",
    "elegant",
    "trendy",
    "fancy",
  ];

  async function getMoodId(token: string | null) {
    if (!token) return null;

    const { data, error } = await supabase
      .from("mood_tokens")
      .select("id")
      .eq("token", token)
      .single();

    if (error) {
      console.error("Mood lookup error:", error);
      return null;
    }

    return data.id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const moodAId = await getMoodId(moodA);
      const moodBId = await getMoodId(moodB);

      const { data: reviewData, error: reviewError } = await supabase
        .from("reviews")
        .insert({
          spot_id: spotId,
          text,
          mood_a_id: moodAId,
          mood_b_id: moodBId,
        })
        .select("id")
        .single();

      if (reviewError || !reviewData) {
        throw reviewError ?? new Error("Review konnte nicht erstellt werden.");
      }

      const reviewId = reviewData.id;

      for (const file of photos) {
        const ext = file.name.split(".").pop() || "jpg";
        const filename = `review-${reviewId}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("review-photos")
          .upload(filename, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("review-photos")
          .getPublicUrl(filename);

        const { error: photoInsertError } = await supabase
          .from("review_photos")
          .insert({
            review_id: reviewId,
            url: data.publicUrl,
          });

        if (photoInsertError) throw photoInsertError;
      }

      router.push(`/reviews/${spotId}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Konnte Review nicht speichern.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotos(Array.from(e.target.files ?? []));
  }

  return (
    <div className="p-8 text-white max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Neues Review erstellen</h1>
        <p className="text-gray-400">
          für Spot <span className="text-blue-300">{spotId}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1">Kurzbeschreibung</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-200"
            placeholder="Wie war dein Besuch…?"
          />
        </div>

        <div>
          <label className="block mb-1">Mood A</label>
          <select
            value={moodA}
            onChange={(e) => setMoodA(e.target.value)}
            className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-200"
          >
            <option value="">– auswählen –</option>
            {MOOD_OPTIONS.map((mood) => (
              <option key={mood} value={mood}>
                {mood}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-1">Mood B (optional)</label>
          <select
            value={moodB}
            onChange={(e) => setMoodB(e.target.value)}
            className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-200"
          >
            <option value="">– auswählen –</option>
            {MOOD_OPTIONS.map((mood) => (
              <option key={mood} value={mood}>
                {mood}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-1">Fotos (optional)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handleFileChange}
            className="w-full text-gray-300"
          />

          {photos.length > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              {photos.length} Bild(er) ausgewählt
            </p>
          )}
        </div>

        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold disabled:opacity-60"
          disabled={saving}
        >
          {saving ? "Speichere…" : "Review erstellen"}
        </button>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </form>
    </div>
  );
}
