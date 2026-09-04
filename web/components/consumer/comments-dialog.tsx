"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  createMomentComment,
  getMomentComments,
  type Moment,
} from "@/lib/consumer-api";
import { Avatar, Button, Dialog, StateView } from "./ui";

function relative(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "Gerade eben";
  if (hours < 24) return `Vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `Vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
}
export function CommentsDialog({
  moment,
  onClose,
}: {
  moment: Moment | null;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<
    Array<{
      comment_id: string;
      user_id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      body: string;
      created_at: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const pendingRequest = useRef<{ postId: string; body: string; id: string } | null>(null);
  const load = useCallback(async () => {
    if (!moment) return;
    setLoading(true);
    setError(false);
    try {
      setComments(await getMomentComments(moment.post_id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [moment]);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!moment || !body.trim()) return;
    setSending(true);
    try {
      const text = body.trim();
      const request = pendingRequest.current?.postId === moment.post_id && pendingRequest.current.body === text
        ? pendingRequest.current
        : { postId: moment.post_id, body: text, id: crypto.randomUUID() };
      pendingRequest.current = request;
      const created = await createMomentComment(moment.post_id, text, request.id);
      if (created?.comment_id) setComments((items) => [created, ...items]);
      else await load();
      setBody("");
      pendingRequest.current = null;
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }
  return (
    <Dialog open={Boolean(moment)} title="Kommentare" onClose={onClose}>
      {loading ? (
        <div className="b-skeleton" style={{ height: 220, borderRadius: 16 }} />
      ) : error ? (
        <StateView
          title="Kommentare nicht geladen"
          message="Versuch es gleich nochmals."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      ) : comments.length ? (
        <div className="b-comments-list">
          {comments.map((comment) => (
            <article className="b-comment" key={comment.comment_id}>
              <Avatar
                src={comment.avatar_url}
                name={
                  comment.display_name || comment.username || "Backyrd User"
                }
                size="sm"
              />
              <div>
                <div className="b-comment-meta">
                  <strong>{comment.display_name || comment.username || "Backyrd User"}</strong>
                  <span>{relative(comment.created_at)}</span>
                </div>
                <p>{comment.body}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="b-muted">
          Noch keine Kommentare. Du kannst den Anfang machen.
        </p>
      )}
      <form className="b-form" onSubmit={submit} style={{ marginTop: 24 }}>
        <label className="b-label" htmlFor="comment">
          Dein Kommentar
        </label>
        <textarea
          id="comment"
          className="b-textarea"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Schreib etwas Echtes …"
        />
        <Button type="submit" disabled={!body.trim() || sending}>
          {sending ? "Wird geteilt …" : "Kommentieren"}
        </Button>
      </form>
    </Dialog>
  );
}
