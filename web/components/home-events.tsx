"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { events, type EventRow } from "@/lib/events-public";

type State = "loading" | "ready" | "error";

export function HomeEvents() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let active = true;
    void events(4)
      .then((result) => {
        if (!active) return;
        setRows(result);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section
      style={{
        padding: "72px max(20px,5vw)",
        background: "#0b0b0d",
        color: "#f4efe4",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <small style={{ color: "#ff8fb4", fontWeight: 900 }}>
            KOMMENDE EVENTS IN BASEL
          </small>
          <h2 style={{ fontSize: 42, margin: "8px 0" }}>Was läuft?</h2>
        </div>
        <Link href="/events">Alle Events →</Link>
      </div>

      {state === "loading" ? (
        <p style={{ color: "#aaa" }}>Events werden geladen …</p>
      ) : state === "error" ? (
        <p style={{ color: "#aaa" }}>Events konnten gerade nicht geladen werden.</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#aaa" }}>Aktuell sind noch keine Events bestätigt.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12,
          }}
        >
          {rows.map((event) => (
            <Link
              key={event.occurrence_id}
              href={`/events/${event.event_id}?occurrence=${event.occurrence_id}`}
              style={{
                padding: 18,
                border: "1px solid #2b292d",
                borderRadius: 20,
                background: "#141417",
              }}
            >
              <small style={{ color: "#ff9aba" }}>
                {new Date(event.start_at).toLocaleDateString("de-CH", {
                  timeZone: "Europe/Zurich",
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                })}
              </small>
              <h3>{event.title}</h3>
              <span style={{ color: "#aaa" }}>
                {event.venue_name ?? "Venue noch nicht bestätigt"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
