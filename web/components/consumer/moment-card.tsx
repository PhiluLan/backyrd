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
  const [liked, setLiked] = useState(moment.viewer_has_liked);
  const [saved, setSaved] = useState(moment.viewer_has_saved);
  const [likes, setLikes] = useState(moment.like_count);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void resolveMomentMedia(moment.media || []).then((values) => {
      if (active)
        setUrls(values.filter((value): value is string => Boolean(value)));
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
    <article className="b-moment">
      <header className="b-moment-head">
        <Link href={`/users/${moment.user_id}`}>
          <Avatar
            src={moment.avatar_url}
            name={moment.display_name || moment.username || "Backyrd User"}
          />
        </Link>
        <div className="b-moment-author">
          <Link href={`/users/${moment.user_id}`}>
            <strong>{moment.display_name || "Backyrd User"}</strong>
          </Link>
          <span className="b-meta">
            {moment.username ? `@${moment.username} · ` : ""}
            {relative(moment.created_at)}
          </span>
        </div>
      </header>
      {urls[0] ? (
        <div className="b-moment-media">
          <img
            src={urls[0]}
            alt={`Moment von ${moment.display_name || "Backyrd User"}`}
          />
        </div>
      ) : null}
      {moment.caption ? (
        <p className="b-moment-copy">{moment.caption}</p>
      ) : null}
      {moment.mood_tags?.length ? (
        <div className="b-spot-card-moods">
          {moment.mood_tags.slice(0, 4).map((mood) => (
            <span className="b-chip" key={mood}>
              {mood}
            </span>
          ))}
        </div>
      ) : null}
      {moment.spot_id && moment.spot_name ? (
        <Link className="b-moment-spot" href={`/spots/${moment.spot_id}`}>
          <span>
            <span className="b-kicker">{moment.category_name || "Ort"}</span>
            <strong style={{ display: "block", marginTop: 3 }}>
              {moment.spot_name}
              {moment.spot_city ? ` · ${moment.spot_city}` : ""}
            </strong>
          </span>
          <PlacesIcon />
        </Link>
      ) : null}
      <div className="b-moment-actions">
        <button
          type="button"
          className="b-action-button"
          data-active={liked}
          onClick={() => void react("like")}
          aria-pressed={liked}
        >
          <HeartIcon />
          {likes}
        </button>
        <button
          type="button"
          className="b-action-button"
          onClick={() => onComments(moment)}
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
        >
          <BookmarkIcon /> Speichern
        </button>
      </div>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </article>
  );
}
