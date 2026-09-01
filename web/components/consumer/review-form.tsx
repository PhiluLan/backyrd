"use client";
import { FormEvent, useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createReviewWithPhotos } from "@/lib/backyrd-api";
import { supabase } from "@/lib/supabase/client";
import { Button } from "./ui";

type Suggestion = { concept_key: string; label: string; matched_expression: string };

function MoodField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.rpc("backyrd_search_mood_concepts_v1", {
        p_query: value,
        p_locale: "de",
        p_limit: 8,
      });
      if (current) setSuggestions((data as Suggestion[] | null) ?? []);
    }, 120);
    return () => { current = false; window.clearTimeout(timer); };
  }, [value]);
  return (
    <div className="b-input-group">
      <label className="b-label" htmlFor={id}>{label}</label>
      <input id={id} className="b-input" value={value} maxLength={40}
        placeholder="z. B. gemütlich" autoComplete="off" aria-describedby={`${id}-hint`}
        role="combobox" aria-autocomplete="list"
        aria-controls={`${id}-suggestions`} aria-expanded={Boolean(value.trim() && suggestions.length)}
        onChange={(event) => onChange(event.target.value)} />
      {value.trim() && suggestions.length ? (
        <div id={`${id}-suggestions`} className="b-mood-suggestions" role="listbox" aria-label={`${label} Vorschläge`}>
          {suggestions.slice(0, 6).map((item) => (
            <button key={item.concept_key} type="button" role="option" aria-selected="false" className="b-mood-suggestion"
              onClick={() => { onChange(item.label); setSuggestions([]); }}>
              <strong>{item.label}</strong>
              {item.matched_expression.toLocaleLowerCase("de") !== item.label.toLocaleLowerCase("de")
                ? <span>{item.matched_expression}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <span id={`${id}-hint`} className="b-muted">Vorschlag wählen oder einen eigenen kurzen Eindruck eingeben.</span>
    </div>
  );
}
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
      setError("Teile einen Gedanken oder mindestens eine Stimmung.");
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
      if (!result.ok) throw new Error();
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
        <fieldset className="b-form-row" style={{ border: 0, padding: 0 }}>
          <legend className="b-label">Welche zwei Moods beschreiben diesen Ort am besten?</legend>
          <MoodField label="Mood 1 (optional)" value={a} onChange={setA} />
          <MoodField label="Mood 2 (optional)" value={b} onChange={setB} />
        </fieldset>
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
