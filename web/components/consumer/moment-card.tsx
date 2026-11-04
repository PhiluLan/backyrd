"use client";

import { ReportMoment } from "./report-moment";
import { MomentEditor } from "./moment-editor";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  type Moment,
  reactToMoment,
  resolveMomentMedia,
} from "@/lib/consumer-api";
import { Avatar, Toast } from "./ui";
import { BookmarkIcon, CommentIcon, HeartIcon, PlacesIcon } from "./icons";

function relative(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "Gerade eben";
  if (hours < 24) return `Vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `Vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
}
export function MomentCard({
  moment,
  onComments,
  currentUserId = null,
  onChanged,
  onUnsaved,
}: {
  moment: Moment;
  currentUserId?: string | null;
  onChanged?: () => void;
  onUnsaved?: (id: string) => void;
  onComments: (moment: Moment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const busy = useRef({ like: false, save: false });
  const [pending, setPending] = useState({ like: false, save: false });
  const [urls, setUrls] = useState<string[]>([]);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(Boolean(moment.media?.length));
  const [liked, setLiked] = useState(moment.viewer_has_liked);
  const [saved, setSaved] = useState(moment.viewer_has_saved);
  const [likes, setLikes] = useState(moment.like_count);
  const [toast, setToast] = useState<string | null>(null);
  const authorName = moment.display_name || moment.username || "Backyrd User";
  const hasMedia = Boolean(urls[0] && !mediaFailed);
  const author = (
    <header className="b-moment-head">
      <Link href={`/users/${moment.user_id}`} aria-label={`Profil von ${authorName}`}>
        <Avatar src={moment.avatar_url} name={authorName} size="sm" />
      </Link>
      <div className="b-moment-author">
        <Link href={`/users/${moment.user_id}`}>
          <strong>{moment.display_name || "Backyrd User"}</strong>
        </Link>
        <span className="b-meta">{relative(moment.created_at)}</span>
      </div>
    </header>
  );
  useEffect(() => {
    let active = true;
    setMediaFailed(false);
    setMediaLoading(Boolean(moment.media?.length));
    void resolveMomentMedia(moment.media || [])
      .then((values) => {
        if (!active) return;
        setUrls(values.filter((value): value is string => Boolean(value)));
      })
      .catch(() => {
        if (active) setUrls([]);
      })
      .finally(() => {
        if (active) setMediaLoading(false);
      });
    return () => {
      active = false;
    };
  }, [moment.media]);
  useEffect(() => {
    if (!busy.current.like) { setLiked(moment.viewer_has_liked); setLikes(moment.like_count); }
    if (!busy.current.save) setSaved(moment.viewer_has_saved);
  }, [moment.post_id, moment.viewer_has_liked, moment.viewer_has_saved, moment.like_count]);
  async function react(kind: "like" | "save") {
    if (busy.current[kind]) return;
    busy.current[kind] = true; setPending(v => ({ ...v, [kind]: true }));
    const was = kind === "like" ? liked : saved;
    if (kind === "like") {
      setLiked(!was);
      setLikes((value) => Math.max(0, value + (was ? -1 : 1)));
    } else {
      setSaved(!was);
    }
    try {
      const receipt = await reactToMoment(moment.post_id, kind, !was);
      if (kind === "like") { setLiked(receipt.active); setLikes(receipt.likeCount); } else { setSaved(receipt.active); if (!receipt.active) onUnsaved?.(moment.post_id); }
    } catch {
      if (kind === "like") {
        setLiked(was);
        setLikes((value) => Math.max(0, value + (was ? 1 : -1)));
      } else {
        setSaved(was);
      }
      setToast("Die Aktion konnte nicht gespeichert werden.");
    } finally { busy.current[kind] = false; setPending(v => ({ ...v, [kind]: false })); }
  }
  async function share() {
    const url = `${window.location.origin}/moments/${moment.post_id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Ein Moment auf Backyrd", url });
      else { await navigator.clipboard.writeText(url); setToast("Link kopiert. Die Sichtbarkeit des Moments bleibt geschützt."); }
    } catch (e: unknown) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setToast("Der Moment konnte nicht geteilt werden. Bitte versuche es erneut.");
    }
  }
  return (
    <article className="b-moment" data-has-media={hasMedia}>
      <MomentEditor postId={editing ? moment.post_id : null} onClose={() => setEditing(false)} onChanged={() => onChanged?.()} />
      {mediaLoading ? <div className="b-skeleton b-moment-media" /> : null}
      {urls[0] && !mediaFailed ? (
        <div className="b-moment-media">
          <img
            src={urls[0]}
            alt={`Moment von ${moment.display_name || "Backyrd User"}`}
            loading="lazy"
            decoding="async"
            onError={() => setMediaFailed(true)}
          />
          <span className="b-moment-media-shade" aria-hidden="true" />
          {moment.spot_id && moment.spot_name ? (
            <Link className="b-moment-location" href={`/spots/${moment.spot_id}`}>
              <PlacesIcon />
              <span>{moment.spot_name}</span>
            </Link>
          ) : null}
          <div className="b-moment-media-author">{author}</div>
        </div>
      ) : null}
      <div className="b-moment-content">
        {!hasMedia ? author : null}
        {moment.mentions?.length ? <p className="b-moment-moods">Mit {moment.mentions.map(p => <Link className="b-chip" key={p.user_id} href={`/users/${p.user_id}`}>{p.display_name}</Link>)}</p> : null}
        {moment.caption ? <p className="b-moment-copy">{moment.caption}</p> : null}
        {moment.mood_tags?.length ? (
          <div className="b-moment-moods" aria-label="Stimmung">
            {moment.mood_tags.slice(0, 3).map((mood) => (
              <span className="b-chip" key={mood}>{mood}</span>
            ))}
          </div>
        ) : null}
        {!urls[0] || mediaFailed ? (
          moment.spot_id && moment.spot_name ? (
            <Link className="b-moment-spot" href={`/spots/${moment.spot_id}`}>
              <span>
                <span className="b-kicker">{moment.category_name || "Ort"}</span>
                <strong>{moment.spot_name}{moment.spot_city ? ` · ${moment.spot_city}` : ""}</strong>
              </span>
              <PlacesIcon />
            </Link>
          ) : null
        ) : null}
      </div>
      {currentUserId === moment.user_id ? <button type="button" className="b-action-button" onClick={() => setEditing(true)}>Bearbeiten oder entfernen</button> : null}
      <div className="b-moment-actions" aria-label="Momentaktionen">
        <button type="button" className="b-action-button" onClick={() => void share()} aria-label="Moment teilen">↗</button>
        <button
          type="button"
          className="b-action-button"
          data-active={liked}
          disabled={pending.like}
          aria-busy={pending.like}
          onClick={() => void react("like")}
          aria-pressed={liked}
          aria-label={liked ? `Gefällt mir entfernen, ${likes} Likes` : `Gefällt mir, ${likes} Likes`}
        >
          <HeartIcon />
          {likes}
        </button>
        <button
          type="button"
          className="b-action-button"
          onClick={() => onComments(moment)}
          aria-label={`${moment.comment_count} Kommentare öffnen`}
        >
          <CommentIcon />
          {moment.comment_count}
        </button>
        <button
          type="button"
          className="b-action-button"
          data-active={saved}
          disabled={pending.save}
          aria-busy={pending.save}
          onClick={() => void react("save")}
          aria-pressed={saved}
          aria-label={saved ? "Nicht mehr speichern" : "Moment speichern"}
        >
          <BookmarkIcon />
        </button>
        {currentUserId !== moment.user_id ? <ReportMoment moment={moment} /> : null}
      </div>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </article>
  );
}
