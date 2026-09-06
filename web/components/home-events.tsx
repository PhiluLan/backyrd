"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { events, type EventRow } from "@/lib/events-public";
import styles from "./home-events.module.css";

type State = "loading" | "ready" | "error";

export function HomeEvents() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let active = true;
    void events(8)
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
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <small className={styles.eyebrow}>
            KOMMENDE EVENTS IN BASEL
          </small>
          <h2 className={styles.title}>Was läuft?</h2>
        </div>
        <Link className={styles.allEvents} href="/events">Alle ansehen →</Link>
      </div>

      {state === "loading" ? (
        <p className={styles.state}>Events werden geladen …</p>
      ) : state === "error" ? (
        <p className={styles.state}>Events konnten gerade nicht geladen werden.</p>
      ) : rows.length === 0 ? (
        <p className={styles.state}>Aktuell sind noch keine Events bestätigt.</p>
      ) : (
        <div
          aria-label="Kommende Events"
          className={`${styles.carousel} ${rows.length === 1 ? styles.single : ""}`}
        >
          {rows.map((event) => (
            <Link
              className={styles.card}
              key={event.occurrence_id}
              href={`/events/${event.event_id}?occurrence=${event.occurrence_id}`}
            >
              <small className={styles.date}>
                {new Date(event.start_at).toLocaleDateString("de-CH", {
                  timeZone: "Europe/Zurich",
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                })}
              </small>
              <h3>{event.title}</h3>
              <span className={styles.venue}>
                {event.venue_name ?? "Venue noch nicht bestätigt"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
