"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type EventSummary = {
  id: string;
  title: string;
  status: string;
  categories: string[];
  organizer: string | null;
  updated_at: string;
};

export default function EventsPage() {
  const [rows, setRows] = useState<EventSummary[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase
      .from("events_v1")
      .select("id,title,status,categories,organizer,updated_at")
      .eq("primary_source_id", "manual_admin")
      .order("updated_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setRows((data ?? []) as EventSummary[]);
      });
    return () => {
      active = false;
    };
  }, []);

  const shown = useMemo(
    () =>
      rows.filter(
        (event) =>
          (status === "ALL" || event.status === status) &&
          (!query ||
            `${event.title} ${event.organizer ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [query, rows, status],
  );

  return (
    <div className="bi-page">
      <header className="bi-header">
        <div>
          <div className="bi-eyebrow">MANUAL ADMIN</div>
          <h1>Events</h1>
          <p>Basler Events anlegen, terminieren und veröffentlichen.</p>
        </div>
        <Link className="bi-primaryButton" href="/events/new">
          Neues Event
        </Link>
      </header>
      {error && <div className="bi-error">{error}</div>}
      <section className="bi-card">
        <div className="bi-tableToolbar">
          <input
            className="bi-input"
            placeholder="Events suchen …"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="bi-select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">Alle Status</option>
            {["DRAFT", "PUBLISHED", "CANCELLED", "ENDED"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="bi-tableWrap">
          <table className="bi-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Kategorien</th>
                <th>Status</th>
                <th>Veranstalter</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((event) => (
                <tr key={event.id}>
                  <td>
                    <strong>{event.title}</strong>
                  </td>
                  <td>{event.categories.join(" · ")}</td>
                  <td>
                    <span
                      className={`bi-badge ${
                        event.status === "PUBLISHED"
                          ? "success"
                          : event.status === "CANCELLED"
                            ? "danger"
                            : "muted"
                      }`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td>{event.organizer ?? "—"}</td>
                  <td>
                    <Link className="bi-action" href={`/events/${event.id}/edit`}>
                      Bearbeiten →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!shown.length && <div className="bi-empty">Keine Events gefunden.</div>}
      </section>
    </div>
  );
}
