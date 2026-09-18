"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { dateTime } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";

type LegacyDecisionDetail = {
  session?: {
    mood_a_text?: string | null;
    mood_b_text?: string | null;
    city?: string | null;
    created_at?: string | null;
    display_name?: string | null;
    username?: string | null;
  };
  events?: Array<{
    id: string;
    event_name: string;
    spot_name?: string | null;
    occurred_at?: string | null;
    screen_name?: string | null;
  }>;
};

export default function DecisionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [data, setData] = useState<LegacyDecisionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void supabase.rpc("admin_decision_session_v1", { p_decision_id: id }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setData(data as LegacyDecisionDetail);
    });
  }, [id]);

  return (
    <div className="bi-page">
      <Link className="bi-back" href="/decision">← Zurück zu Decision Legacy</Link>
      <div className="bi-card bi-pad">
        <div className="bi-kicker">Historische Ansicht</div>
        <p>Diese Detailansicht zeigt ausschließlich eine frühere Legacy-Session. Sie enthält keine Decision-vNext-Daten.</p>
      </div>
      {error && <div className="bi-error">{error}</div>}
      {!data && !error && <div className="bi-state">Historische Session wird geladen …</div>}
      {data && <>
        <div className="bi-detailHero">
          <div>
            <div className="bi-eyebrow">Legacy Decision session</div>
            <h1>{data.session?.mood_a_text || "Decision"}{data.session?.mood_b_text ? ` + ${data.session.mood_b_text}` : ""}</h1>
            <p>{data.session?.city || "—"} · {dateTime(data.session?.created_at)}</p>
          </div>
          <div className="bi-meta">
            <code>{id}</code>
            <span>{data.session?.display_name || data.session?.username || "Unbekannter Nutzer"}</span>
          </div>
        </div>
        <section className="bi-card bi-pad">
          <div className="bi-kicker">Historische Event timeline</div>
          <h2>Ablauf</h2>
          <div className="bi-timeline">{(data.events || []).map((event) => (
            <div className="bi-timelineItem" key={event.id}>
              <span />
              <div>
                <strong>{event.event_name}{event.spot_name ? ` · ${event.spot_name}` : ""}</strong>
                <small>{dateTime(event.occurred_at)} · {event.screen_name || "—"}</small>
              </div>
            </div>
          ))}</div>
        </section>
      </>}
    </div>
  );
}
