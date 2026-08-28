"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar, StateView } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
type Chat = {
  chat_id: string;
  other_user_id: string;
  other_display_name: string | null;
  other_first_name: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  chat_created_at: string;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
};
export default function MessagesPage() {
  const [rows, setRows] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_direct_chats_v1");
    setError(Boolean(error));
    setRows((Array.isArray(data) ? data : []) as Chat[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="b-narrow b-main">
      <p className="b-kicker">BACKYRD</p>
      <h1 className="b-display b-page-title" style={{ marginTop: 9 }}>
        NACHRICHTEN
      </h1>
      <div className="b-marker" />
      {loading ? (
        <div className="b-skeleton" style={{ height: 420, borderRadius: 22 }} />
      ) : error ? (
        <StateView
          title="Nachrichten nicht verfügbar"
          message="Melde dich an oder versuch es gleich nochmals."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      ) : rows.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row) => {
            const name =
              row.other_display_name ||
              row.other_first_name ||
              row.other_username ||
              "Backyrd User";
            return (
              <Link
                href={`/messages/${row.chat_id}`}
                key={row.chat_id}
                className="b-setting-row b-surface"
                style={{ padding: 14 }}
              >
                <Avatar src={row.other_avatar_url} name={name} />
                <span style={{ flex: 1 }}>
                  <strong>{name}</strong>
                  <span
                    className="b-meta"
                    style={{ display: "block", marginTop: 4 }}
                  >
                    {row.last_message_text || "Noch keine Nachricht"}
                  </span>
                </span>
                {row.unread_count > 0 ? (
                  <span className="b-chip" data-active="true">
                    {row.unread_count}
                  </span>
                ) : (
                  <span>→</span>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <StateView
          title="Noch keine Nachrichten"
          message="Öffne ein öffentliches Profil und starte einen persönlichen Backyrd-Chat."
        />
      )}
    </div>
  );
}
