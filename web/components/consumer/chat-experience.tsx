"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { Avatar, Button, StateView, Toast } from "./ui";
type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string | null;
  created_at: string;
  seen_at: string | null;
};
type Summary = {
  chat_id: string;
  other_user_id: string;
  other_display_name: string | null;
  other_first_name: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
};
export function ChatExperience({ chatId }: { chatId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error();
      setUserId(user.user.id);
      const [msg, chats] = await Promise.all([
        supabase
          .from("messages")
          .select("id,chat_id,sender_id,text,created_at,seen_at")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: true }),
        supabase.rpc("get_my_direct_chats_v1"),
      ]);
      if (msg.error || chats.error) throw new Error();
      setMessages((msg.data ?? []) as Message[]);
      setSummary(
        ((Array.isArray(chats.data) ? chats.data : []) as Summary[]).find(
          (row) => row.chat_id === chatId,
        ) ?? null,
      );
      void supabase.rpc("mark_chat_read_v1", { p_chat_id: chatId });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [chatId]);
  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`web-chat-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) =>
          setMessages((rows) =>
            rows.some((row) => row.id === (payload.new as Message).id)
              ? rows
              : [...rows, payload.new as Message],
          ),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, load]);
  useEffect(
    () => end.current?.scrollIntoView({ behavior: "smooth" }),
    [messages.length],
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || !userId || sending) return;
    setSending(true);
    setText("");
    const { data, error } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        sender_id: userId,
        text: body,
        image_url: null,
      })
      .select("id,chat_id,sender_id,text,created_at,seen_at")
      .single();
    if (error) {
      setText(body);
      setToast("Deine Nachricht konnte nicht gesendet werden.");
    } else
      setMessages((rows) =>
        rows.some((row) => row.id === data.id)
          ? rows
          : [...rows, data as Message],
      );
    setSending(false);
  }
  const name =
    summary?.other_display_name ||
    summary?.other_first_name ||
    summary?.other_username ||
    "Backyrd User";
  if (loading)
    return (
      <div className="b-narrow b-main">
        <div className="b-skeleton" style={{ height: 600, borderRadius: 22 }} />
      </div>
    );
  if (error)
    return (
      <div className="b-narrow b-main">
        <StateView
          title="Chat nicht geladen"
          message="Der Chat ist nicht verfügbar oder nicht für dein Konto freigegeben."
          actionLabel="Zurück"
          onAction={() => history.back()}
        />
      </div>
    );
  return (
    <div
      className="b-narrow"
      style={{
        minHeight: "calc(100vh - 76px)",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
      }}
    >
      <header className="b-setting-row" style={{ padding: "18px 0" }}>
        <Link href={summary ? `/users/${summary.other_user_id}` : "/messages"}>
          <Avatar src={summary?.other_avatar_url} name={name} />
        </Link>
        <span style={{ flex: 1 }}>
          <strong>{name}</strong>
          <span className="b-meta" style={{ display: "block" }}>
            {summary?.other_username
              ? `@${summary.other_username}`
              : "Backyrd Chat"}
          </span>
        </span>
        <Link href="/messages" className="b-button b-button-tertiary">
          Schliessen
        </Link>
      </header>
      <section
        style={{
          overflow: "auto",
          padding: "24px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.length ? (
          messages.map((message) => (
            <div
              key={message.id}
              style={{
                alignSelf:
                  message.sender_id === userId ? "flex-end" : "flex-start",
                maxWidth: "78%",
                padding: "11px 15px",
                borderRadius: 16,
                background:
                  message.sender_id === userId
                    ? "var(--pink)"
                    : "var(--surface-2)",
                color:
                  message.sender_id === userId
                    ? "var(--ink)"
                    : "var(--foreground)",
              }}
            >
              <p style={{ margin: 0, lineHeight: 1.5 }}>{message.text}</p>
              <span style={{ fontSize: 10, opacity: 0.62 }}>
                {new Date(message.created_at).toLocaleTimeString("de-CH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))
        ) : (
          <StateView
            title="Noch keine Nachricht"
            message="Ein echter Satz genügt."
          />
        )}
        <div ref={end} />
      </section>
      <form
        onSubmit={submit}
        className="b-decision-entry"
        style={{ margin: "12px 0 26px" }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Nachricht"
          placeholder="Nachricht schreiben …"
        />
        <Button type="submit" disabled={!text.trim() || sending}>
          {sending ? "…" : "Senden"}
        </Button>
      </form>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}
