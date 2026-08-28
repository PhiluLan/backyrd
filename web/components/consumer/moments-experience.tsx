"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createMoment,
  getCatalog,
  getMoments,
  type CatalogSpot,
  type Moment,
} from "@/lib/consumer-api";
import { supabase } from "@/lib/supabase/client";
import { PlusIcon } from "./icons";
import { Button, Dialog, StateView, Toast } from "./ui";
import { MomentCard } from "./moment-card";
import { CommentsDialog } from "./comments-dialog";
export function MomentsExperience() {
  const [mode, setMode] = useState<"for_you" | "following">("for_you");
  const [items, setItems] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Moment | null>(null);
  const [composer, setComposer] = useState(false);
  const [spots, setSpots] = useState<CatalogSpot[]>([]);
  const [caption, setCaption] = useState("");
  const [spotId, setSpotId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await supabase.auth.getUser();
      setSignedIn(Boolean(data.user));
      setItems(await getMoments(mode));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [mode]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (composer && !spots.length)
      void getCatalog({ city: "Basel", limit: 200 })
        .then(setSpots)
        .catch(() => setSpots([]));
  }, [composer, spots.length]);
  async function submit() {
    if (!caption.trim() && !file) return;
    setCreating(true);
    try {
      await createMoment({ caption, spotId: spotId || null, file });
      setComposer(false);
      setCaption("");
      setSpotId("");
      setFile(null);
      setToast("Dein Moment ist geteilt.");
      await load();
    } catch {
      setToast("Dein Moment konnte nicht geteilt werden.");
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="b-container b-main">
      <div className="b-section-header">
        <div>
          <p className="b-kicker">Die Stadt durch Menschen</p>
          <h1 className="b-display b-display-lg" style={{ marginTop: 10 }}>
            MOMENTE
          </h1>
          <p className="b-muted" style={{ maxWidth: 620 }}>
            Was Menschen gerade erleben – lokal, leicht und mit echten Orten
            verbunden.
          </p>
        </div>
        {signedIn ? (
          <Button onClick={() => setComposer(true)}>
            <PlusIcon /> Moment teilen
          </Button>
        ) : null}
      </div>
      <div className="b-tabs" role="tablist" style={{ marginBottom: 34 }}>
        <button
          type="button"
          className="b-tab"
          role="tab"
          aria-selected={mode === "for_you"}
          onClick={() => setMode("for_you")}
        >
          Für dich
        </button>
        <button
          type="button"
          className="b-tab"
          role="tab"
          aria-selected={mode === "following"}
          onClick={() => setMode("following")}
        >
          Folge ich
        </button>
      </div>
      <div style={{ width: "min(100%,760px)" }}>
        {loading ? (
          <div
            className="b-skeleton"
            style={{ height: 600, borderRadius: 22 }}
          />
        ) : error ? (
          <StateView
            title="Momente konnten nicht geladen werden"
            message="Die Stadt ist gerade kurz leise. Versuch es nochmals."
            actionLabel="Erneut versuchen"
            onAction={() => void load()}
          />
        ) : !signedIn ? (
          <StateView
            title="Momente werden persönlich, wenn du dich anmeldest"
            message="Dein Feed respektiert private Profile, Follow-Beziehungen und deine Sichtbarkeit."
            actionLabel="Anmelden"
            onAction={() => location.assign("/login?next=/moments")}
          />
        ) : items.length === 0 ? (
          <StateView
            title={
              mode === "following"
                ? "Hier ist es noch ruhig"
                : "Noch keine Momente"
            }
            message={
              mode === "following"
                ? "Folge Menschen, deren Basel du sehen möchtest."
                : "Teile einen echten Moment oder entdecke zuerst einen Ort."
            }
            actionLabel={
              mode === "following" ? "Für dich ansehen" : "Orte entdecken"
            }
            onAction={() =>
              mode === "following"
                ? setMode("for_you")
                : location.assign("/places")
            }
          />
        ) : (
          items.map((moment) => (
            <MomentCard
              key={moment.post_id}
              moment={moment}
              onComments={setSelected}
            />
          ))
        )}
      </div>
      <CommentsDialog moment={selected} onClose={() => setSelected(null)} />
      <Dialog
        open={composer}
        title="Moment teilen"
        onClose={() => setComposer(false)}
      >
        <div className="b-form">
          <div className="b-input-group">
            <label className="b-label" htmlFor="moment-text">
              Was erlebst du?
            </label>
            <textarea
              id="moment-text"
              className="b-textarea"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={1200}
              placeholder="Ein echter Satz genügt …"
            />
          </div>
          <div className="b-input-group">
            <label className="b-label" htmlFor="moment-spot">
              Ort · optional
            </label>
            <select
              id="moment-spot"
              className="b-select"
              value={spotId}
              onChange={(event) => setSpotId(event.target.value)}
            >
              <option value="">Kein Ort verknüpft</option>
              {spots.map((spot) => (
                <option key={spot.id} value={spot.id}>
                  {spot.name}
                </option>
              ))}
            </select>
          </div>
          <div className="b-input-group">
            <label className="b-label" htmlFor="moment-image">
              Bild · optional
            </label>
            <input
              id="moment-image"
              className="b-input"
              type="file"
              accept="image/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="b-form-actions">
            <Button variant="secondary" onClick={() => setComposer(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={creating || (!caption.trim() && !file)}
              onClick={() => void submit()}
            >
              {creating ? "Wird geteilt …" : "Teilen"}
            </Button>
          </div>
        </div>
      </Dialog>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}
