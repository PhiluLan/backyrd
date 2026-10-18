"use client";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createReviewWithPhotos } from "@/lib/backyrd-api";
import { supabase } from "@/lib/supabase/client";
import { Button } from "./ui";
import { MoodSelection } from "./mood-selection";

export function ReviewForm() {
  const params = useSearchParams();
  const router = useRouter();
  const spotId = params.get("spotId") ?? "";
  const [text, setText] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!spotId || (!text.trim() && !a && !b)) {
      setError("Teile einen Gedanken oder mindestens einen Eindruck vom Ort.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push(
          `/login?next=${encodeURIComponent(`/reviews/new?spotId=${spotId}`)}`,
        );
        return;
      }
      const result = await createReviewWithPhotos(
        {
          spot_id: spotId,
          text: text.trim() || null,
          mood_a: a || null,
          mood_b: b || null,
          photo_urls: [],
        },
        data.session.access_token,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(`/spots/${spotId}`);
      router.refresh();
    } catch {
      setError("Deine Review konnte gerade nicht geteilt werden.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="b-narrow b-main">
      <p className="b-kicker">Review</p>
      <h1 className="b-display b-page-title" style={{ marginTop: 10 }}>
        WIE WAR&apos;S?
      </h1>
      <div className="b-marker" />
      <p className="b-muted">
        Reviews sind rückblickende Erfahrungen. Ein aktueller sozialer Eindruck
        gehört als Moment in den Feed.
      </p>
      <form
        className="b-form b-surface"
        onSubmit={submit}
        style={{ padding: "clamp(22px,4vw,40px)", marginTop: 28 }}
      >
        <div className="b-input-group">
          <label className="b-label" htmlFor="review-text">
            Deine Erfahrung
          </label>
          <textarea
            id="review-text"
            className="b-textarea"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
          />
        </div>
        <MoodSelection values={[a, b]} onChange={values => { setA(values[0] ?? ""); setB(values[1] ?? ""); }} />
        {error ? (
          <p className="b-field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="b-form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Abbrechen
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Wird geteilt …" : "Review teilen"}
          </Button>
        </div>
      </form>
    </div>
  );
}
