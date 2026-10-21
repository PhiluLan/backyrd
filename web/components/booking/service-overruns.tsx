"use client";

import { useEffect, useState } from "react";
import { bookingAllocationLabel, type BookingSnapshot } from "@/lib/booking-api";
import { serviceClock, serviceOverruns } from "@/lib/booking-service-attention";
import styles from "./console.module.css";

export function ServiceOverruns({ snapshot, date, onOpen }: { snapshot: BookingSnapshot; date: string; onOpen: (id: string) => void }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => { if (document.visibilityState !== "hidden") setNow(Date.now()); };
    update();
    const interval = window.setInterval(update, 30_000);
    window.addEventListener("focus", update); document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  const rows = now === null ? [] : serviceOverruns(snapshot, date, now);
  if (!rows.length) return null;
  return <section className={styles.unclosed} aria-label="Besuche nach geplanter Zeit">
    <h2>Geplante Zeit vorbei</h2>
    <p>Noch als «Am Tisch» erfasst · ganzes Restaurant, unabhängig von Filtern. Prüfe vor Ort, ob die Gäste noch da sind. Der Status wird nicht automatisch geändert.</p>
    <details className={styles.overrunDetails}>
      <summary>{rows.length} {rows.length === 1 ? "Besuch prüfen" : "Besuche prüfen"}</summary>
      <ul className={styles.overrunList}>{rows.map(({ reservation, plannedEnd, next }) => <li key={reservation.id}>
        <button type="button" className={styles.secondary} aria-label={`Besuch von ${reservation.guest_name} prüfen`} onClick={() => onOpen(reservation.id)}>
          <strong>{reservation.guest_name} · {bookingAllocationLabel(reservation, snapshot)}</strong>
          <span>{reservation.party_size} Personen · geplante Belegung bis {serviceClock(plannedEnd)}</span>
          {next && <span>Weitere Reservierung ab {serviceClock(next.allocation_starts_at ?? next.starts_at)}</span>}
        </button>
      </li>)}</ul>
    </details>
  </section>;
}
