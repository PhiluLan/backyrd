"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import styles from "./events.module.css";

const statusLabels: Record<string, string> = {
  DRAFT: "Entwurf",
  PUBLISHED: "Veröffentlicht",
  CANCELLED: "Abgesagt",
  ENDED: "Beendet",
};

type EventSummary = {
  id: string;
  primary_source_id: string;
  authoring_spot_id: string | null;
  series_id: string | null;
  provenance: { submissionStatus?: string };
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
      .select("id,title,status,categories,organizer,updated_at,primary_source_id,authoring_spot_id,provenance,series_id")
      .in("primary_source_id", ["manual_admin", "manual_owner"])
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
        <Link className="bi-secondaryButton" href="/events/seasonal">Herbstmesse vorbereiten</Link>
        <Link className="bi-primaryButton" href="/events/new">
          Neues Event
        </Link>
      </header>
      {error && <div className="bi-error">{error}</div>}
      <section className="bi-card">
        <div className={`bi-tableToolbar ${styles.toolbar}`}>
          <input
            className="bi-input"
            aria-label="Events suchen"
            placeholder="Events suchen …"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="bi-select"
            aria-label="Eventstatus filtern"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">Alle Status</option>
            {["DRAFT", "PUBLISHED", "CANCELLED", "ENDED"].map((item) => (
              <option key={item} value={item}>{statusLabels[item]}</option>
            ))}
          </select>
        </div>
        <ul className={styles.list} aria-label="Events">
          {shown.map((event) => {
            const href = event.series_id
              ? `/events/seasonal/${event.id}`
              : event.authoring_spot_id
                ? `/spots/${event.authoring_spot_id}/edit#events`
                : `/events/${event.id}/edit`;
            const label = event.status === "DRAFT" && event.provenance.submissionStatus === "PENDING_REVIEW"
              ? "Zur Prüfung"
              : statusLabels[event.status] ?? event.status;
            const tone = event.status === "PUBLISHED" ? "success" : event.status === "CANCELLED" ? "danger" : "muted";

            return (
              <li key={event.id}>
                <Link className={styles.eventLink} href={href}>
                  <div className={styles.eventDescription}>
                    <strong>{event.title}</strong>
                    <span>{[event.categories.join(" · "), event.organizer].filter(Boolean).join(" · ")}</span>
                  </div>
                  <span className={`bi-badge ${tone}`}>{label}</span>
                  <span className={styles.edit}>Bearbeiten <span aria-hidden="true">→</span></span>
                </Link>
              </li>
            );
          })}
        </ul>
        {!shown.length && <div className="bi-empty">Keine Events gefunden.</div>}
      </section>
    </div>
  );
}
