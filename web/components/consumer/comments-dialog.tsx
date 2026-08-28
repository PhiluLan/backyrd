"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  createMomentComment,
  getMomentComments,
  type Moment,
} from "@/lib/consumer-api";
import { Avatar, Button, Dialog, StateView } from "./ui";
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
      const created = await createMomentComment(moment.post_id, body);
      if (created?.comment_id) setComments((items) => [created, ...items]);
      else await load();
      setBody("");
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
        <div
          style={{ display: "grid", gap: 20, maxHeight: 420, overflow: "auto" }}
        >
          {comments.map((comment) => (
            <article
              key={comment.comment_id}
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr",
                gap: 12,
              }}
            >
              <Avatar
                src={comment.avatar_url}
                name={
                  comment.display_name || comment.username || "Backyrd User"
                }
                size="sm"
              />
              <div>
                <strong>
                  {comment.display_name || comment.username || "Backyrd User"}
                </strong>
                <p style={{ margin: "5px 0 0", lineHeight: 1.5 }}>
                  {comment.body}
                </p>
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
