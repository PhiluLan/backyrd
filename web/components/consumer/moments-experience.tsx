"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMoment,
  getCatalog,
  getMoments,
  type CatalogSpot,
  type Moment,
} from "@/lib/consumer-api";
import { supabase } from "@/lib/supabase/client";
import { PlusIcon, SparkIcon } from "./icons";
import { Avatar, Button, Dialog, StateView, Toast } from "./ui";
import { PersonMentions } from "./person-mentions";
import type { MentionPerson } from "../../../packages/shared/src/presentation/social";
import { MoodSelection } from "./mood-selection";
import { MomentCard } from "./moment-card";
import { CommentsDialog } from "./comments-dialog";
export function MomentsExperience() {
  const pendingPostRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const createInFlight = useRef(false);
  const draftActor = useRef<string | null>(null);
  const router = useRouter();
  const [mode, setMode] = useState<"for_you" | "following">("for_you");
  const [items, setItems] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Moment | null>(null);
  const [composer, setComposer] = useState(false);
  const [spots, setSpots] = useState<CatalogSpot[]>([]);
  const [caption, setCaption] = useState("");
  const [mentions, setMentions] = useState<MentionPerson[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [spotId, setSpotId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const nextActor = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || (draftActor.current && draftActor.current !== nextActor)) {
        setCaption(""); setMoods([]); setMentions([]); setFile(null); setSpotId("");
        setComposer(false); setItems([]); setSelected(null); pendingPostRequest.current = null;
      }
      draftActor.current = nextActor;
      setSignedIn(Boolean(nextActor)); setCurrentUserId(nextActor);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await supabase.auth.getUser();
      setSignedIn(Boolean(data.user)); setCurrentUserId(data.user?.id ?? null);
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
  const networkPeople = useMemo(() => {
    const people = new Map<
      string,
      Pick<Moment, "user_id" | "display_name" | "username" | "avatar_url">
    >();
    for (const moment of items) {
      if (!moment.viewer_follows_author || people.has(moment.user_id)) continue;
      people.set(moment.user_id, moment);
      if (people.size === 5) break;
    }
    return [...people.values()];
  }, [items]);
  async function submit() {
    if (createInFlight.current || (!caption.trim() && !file)) return;
    createInFlight.current = true;
    setCreating(true);
    try {
      const fingerprint = JSON.stringify({ caption: caption.trim(), moods, mentions: mentions.map(p => p.user_id).sort(), spotId: spotId || null, file: file ? [file.name, file.size, file.lastModified] : null });
      const request = pendingPostRequest.current?.fingerprint === fingerprint
        ? pendingPostRequest.current
        : { fingerprint, id: crypto.randomUUID() };
      pendingPostRequest.current = request;
      const requestId = request.id;
      await createMoment({ caption, spotId: spotId || null, file, requestId, moods, mentionedUserIds: mentions.map(p => p.user_id) });
      pendingPostRequest.current = null;
      setComposer(false);
      setCaption("");
      setMoods([]); setMentions([]);
      setSpotId("");
      setFile(null);
      setToast("Dein Moment ist geteilt.");
      await load();
    } catch (error: unknown) {
      setToast(error instanceof Error ? error.message : "Dein Moment konnte nicht geteilt werden. Dein Entwurf bleibt erhalten.");
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  }
  function closeComposer() {
    if (createInFlight.current) return;
    if ((caption.trim() || file || spotId || moods.length || mentions.length) && !window.confirm("Entwurf verwerfen? Dein Moment wurde noch nicht geteilt.")) return;
    setCaption(""); setFile(null); setSpotId(""); setMoods([]); setMentions([]);
    pendingPostRequest.current = null;
    setComposer(false);
  }
  return (
    <div className="b-container b-main b-moments-page">
      <div className="b-moments-layout">
        <section className="b-moments-workspace" aria-labelledby="moments-title">
          <header className="b-moments-hero">
            <div>
              <p className="b-kicker">Die Stadt durch Menschen</p>
              <h1 id="moments-title" className="b-display b-moments-title">
                MOMENTE
              </h1>
              <p className="b-moments-intro">
                Erlebt. Festgehalten. Moods machen dein Erlebnis spürbar.
                Entdecke durch die Momente anderer deinen nächsten Ort.
              </p>
            </div>
            {signedIn ? (
              <Button className="b-moments-create" onClick={() => setComposer(true)}>
                <PlusIcon /> Moment teilen
              </Button>
            ) : null}
          </header>
          <div className="b-moments-toolbar">
            <div className="b-tabs" role="tablist" aria-label="Momente filtern">
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
          </div>
          <div className="b-moments-feed" aria-live="polite">
        {loading ? (
              <div className="b-moments-grid" aria-label="Momente werden geladen">
                {[0, 1, 2].map((item) => (
                  <div className="b-skeleton b-moment-skeleton" key={item} />
                ))}
              </div>
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
            onAction={() => router.push("/login?next=/moments")}
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
                : router.push("/places")
            }
          />
        ) : (
              <div className="b-moments-grid" data-count={Math.min(items.length, 3)}>
                {items.map((moment) => (
                  <MomentCard
                    key={moment.post_id}
                    moment={moment}
                    currentUserId={currentUserId}
                    onChanged={() => { void load(); }}
                    onComments={setSelected}
                  />
                ))}
              </div>
        )}
          </div>
        </section>
        <aside className="b-moments-sidebar" aria-label="Momente in Backyrd">
          <div className="b-moments-sidebar-sticky">
            {networkPeople.length ? (
              <section className="b-moments-side-card" aria-labelledby="network-title">
                <h2 id="network-title" className="b-kicker">
                  Dein Netzwerk
                </h2>
                <div className="b-moments-network">
                  {networkPeople.map((person) => {
                    const name = person.display_name || person.username || "Backyrd User";
                    return (
                      <Link className="b-moments-person" href={`/users/${person.user_id}`} key={person.user_id}>
                        <Avatar src={person.avatar_url} name={name} />
                        <span>{name.split(" ")[0]}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <section className="b-moments-callout" aria-labelledby="moment-counts-title">
              <span className="b-moments-callout-icon" aria-hidden="true">
                <SparkIcon />
              </span>
              <h2 id="moment-counts-title" className="b-card-title">
                Dein Moment zählt.
              </h2>
              <p>
                Teile echte Erlebnisse, inspiriere andere und hilf, die Stadt
                noch besser zu machen.
              </p>
              {signedIn ? (
                <Button variant="secondary" onClick={() => setComposer(true)}>
                  Moment teilen
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => router.push("/login?next=/moments")}>
                  Anmelden
                </Button>
              )}
            </section>
          </div>
        </aside>
      </div>
      <CommentsDialog onCreated={() => void load()} moment={selected} onClose={() => setSelected(null)} />
      <Dialog
        open={composer}
        title="Moment teilen"
        onClose={closeComposer}
      >
        <fieldset className="b-form" disabled={creating}>
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
          <MoodSelection context="moment" values={moods} onChange={setMoods} />
          <PersonMentions values={mentions} onChange={setMentions} disabled={creating} />
          <div className="b-form-actions">
            <Button variant="secondary" onClick={closeComposer}>
              Abbrechen
            </Button>
            <Button
              disabled={creating || (!caption.trim() && !file)}
              onClick={() => void submit()}
            >
              {creating ? "Wird geteilt …" : "Teilen"}
            </Button>
          </div>
        </fieldset>
      </Dialog>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}
