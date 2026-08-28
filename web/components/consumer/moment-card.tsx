"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
}: {
  moment: Moment;
  onComments: (moment: Moment) => void;
}) {
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
  async function react(kind: "like" | "save") {
    const was = kind === "like" ? liked : saved;
    if (kind === "like") {
      setLiked(!was);
      setLikes((value) => Math.max(0, value + (was ? -1 : 1)));
    } else {
      setSaved(!was);
    }
    try {
      await reactToMoment(moment.post_id, kind, !was);
    } catch {
      if (kind === "like") {
        setLiked(was);
        setLikes((value) => Math.max(0, value + (was ? 1 : -1)));
      } else {
        setSaved(was);
      }
      setToast("Die Aktion konnte nicht gespeichert werden.");
    }
  }
  return (
    <article className="b-moment" data-has-media={hasMedia}>
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
      <div className="b-moment-actions" aria-label="Momentaktionen">
        <button
          type="button"
          className="b-action-button"
          data-active={liked}
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
          onClick={() => void react("save")}
          aria-pressed={saved}
          aria-label={saved ? "Nicht mehr speichern" : "Moment speichern"}
        >
          <BookmarkIcon />
        </button>
      </div>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </article>
  );
}
