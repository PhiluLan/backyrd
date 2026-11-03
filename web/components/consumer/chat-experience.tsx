"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ChatImage } from "./chat-image";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { Avatar, Button, StateView, Toast } from "./ui";
type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string | null;
  image_url?: string | null;
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
  const sendingRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const blockingRef = useRef(false);
  const [blocking, setBlocking] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const pendingRequest = useRef<{ fingerprint: string; id: string; imagePath: string | null; uploaded: boolean } | null>(null);
  useEffect(() => { setText(""); setFile(null); if (fileInput.current) fileInput.current.value = ""; pendingRequest.current = null; }, [chatId]);
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
          .select("id,chat_id,sender_id,text,image_url,created_at,seen_at")
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
      await supabase.rpc("mark_chat_read_v1", { p_chat_id: chatId });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [chatId]);
  useEffect(() => {
    void load();
    let active = true;
    const refreshMessages = async () => {
      const {data,error: readError}=await supabase.from("messages").select("id,chat_id,sender_id,text,image_url,created_at,seen_at").eq("chat_id",chatId).order("created_at",{ascending:true});
      if(active && !readError)setMessages((data??[]) as Message[]);
    };
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
      .subscribe(status => {
        if(active && status==="SUBSCRIBED")void refreshMessages();
      });
    return () => {
      active=false;
      void supabase.removeChannel(channel);
    };
  }, [chatId, load]);
  useEffect(
    () => { end.current?.scrollIntoView({ behavior: "smooth" }); },
    [messages.length],
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if ((!body && !file) || !userId || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const fingerprint = JSON.stringify([chatId,userId,body,file ? [file.name,file.size,file.lastModified] : null]);
    const request = pendingRequest.current?.fingerprint === fingerprint
      ? pendingRequest.current : { fingerprint, id: crypto.randomUUID(), imagePath: null, uploaded: false };
    pendingRequest.current = request;
    try {
      if (file && !request.uploaded) {
        const allowed: Record<string,string> = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif","image/avif":"avif"};
        const extension = allowed[file.type];
        if (!extension || file.size > 10*1024*1024) throw new Error("invalid_image");
        request.imagePath ??= `chat/${chatId}/${request.id}.${extension}`;
        const upload = await supabase.storage.from("chat-uploads").upload(request.imagePath,file,{contentType:file.type,upsert:false});
        if (upload.error) throw upload.error;
        request.uploaded = true;
      }
      const actor = await supabase.auth.getUser();
      if (actor.error || actor.data.user?.id !== userId) throw new Error("actor_changed");
      const response = await supabase.rpc("send_message_v2", {
        p_chat_id: chatId, p_text: body || null, p_image_url: request.imagePath, p_client_request_id: request.id,
      });
      const data = Array.isArray(response.data) ? response.data[0] : response.data;
      if (response.error || !data || typeof data.id !== "string") throw response.error ?? new Error("missing_receipt");
      pendingRequest.current = null;
      setText(""); setFile(null); if (fileInput.current) fileInput.current.value = "";
      setMessages(rows => rows.some(row => row.id === data.id) ? rows : [...rows, data as Message]);
    } catch (error: unknown) {
      const reason = error && typeof error === "object" && "message" in error ? String(error.message) : "";
      setToast(reason.includes("chat_blocked") ? "Zwischen diesen Konten sind keine weiteren Nachrichten möglich. Dein Entwurf bleibt erhalten." : "Die Nachricht konnte nicht bestätigt werden. Dein Entwurf bleibt erhalten.");
    } finally { sendingRef.current = false; setSending(false); }
  }

  async function blockPerson() {
    if (!summary || blockingRef.current || !window.confirm("Person blockieren? Ihr könnt euch danach keine weiteren Nachrichten senden. Du kannst die Blockierung in den Einstellungen aufheben.")) return;
    blockingRef.current = true; setBlocking(true);
    try {
      const { data, error } = await supabase.rpc("block_user_v1", { p_user_id: summary.other_user_id });
      const receipt = Array.isArray(data) ? data[0] : data;
      if (error || receipt?.is_blocked !== true) throw error ?? new Error("missing_receipt");
      setToast("Person blockiert. Weitere Nachrichten sind nicht möglich.");
    } catch { setToast("Die Person konnte nicht blockiert werden. Bitte versuche es erneut."); }
    finally { blockingRef.current = false; setBlocking(false); }
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
      className="b-narrow b-chat-shell"
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
        <button type="button" className="b-button b-button-tertiary" disabled={blocking || !summary} onClick={() => void blockPerson()} aria-label="Person blockieren">{blocking ? "Wird blockiert …" : "Blockieren"}</button>
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
              {message.image_url ? <ChatImage storedValue={message.image_url} chatId={chatId} /> : null}
              {message.text ? <p style={{ margin: 0, lineHeight: 1.5 }}>{message.text}</p> : null}
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
        className="b-chat-compose"
        style={{ margin: "12px 0 26px" }}
      >
        <input
          value={text}
          disabled={sending}
          maxLength={4000}
          onChange={(event) => setText(event.target.value)}
          aria-label="Nachricht"
          placeholder="Nachricht schreiben …"
        />
        <label className="b-label" htmlFor="chat-photo">Foto hinzufügen · optional</label>
        <input ref={fileInput} id="chat-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif" disabled={sending} aria-label="Foto für den Chat auswählen" onChange={event => {
          const selected = event.target.files?.[0] ?? null;
          pendingRequest.current = null;
          if (selected && (!/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(selected.type) || selected.size > 10*1024*1024)) {
            setFile(null); event.target.value = ""; setToast("Bitte wähle ein Foto mit höchstens 10 MB.");
          } else setFile(selected);
        }} />
        {file ? <button type="button" className="b-action-button" disabled={sending} onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; pendingRequest.current = null; }}>Foto entfernen</button> : null}
        <Button type="submit" disabled={(!text.trim() && !file) || sending}>
          {sending ? "…" : "Senden"}
        </Button>
      </form>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}
