import Link from "next/link";
import {
  eventDetail,
  events,
  imageUrl,
  type EventRow,
} from "@/lib/events-public";
import styles from "../events.module.css";

export const dynamic = "force-dynamic";

function upcoming(current: EventRow, rows: EventRow[]): EventRow[] {
  const available = rows.filter(
    (row) => row.occurrence_id !== current.occurrence_id,
  );
  const sameEvent = available.filter((row) => row.event_id === current.event_id);
  const sameVenue = available.filter(
    (row) =>
      row.event_id !== current.event_id &&
      current.venue_id !== null &&
      row.venue_id === current.venue_id,
  );
  const other = available.filter(
    (row) => !sameEvent.includes(row) && !sameVenue.includes(row),
  );
  return [...sameEvent, ...sameVenue, ...other].slice(0, 4);
}

function routeUrl(event: EventRow): string {
  const fallbackAddress = [event.address_line, event.postal_code, event.city]
    .filter(Boolean)
    .join(", ");
  const destination =
    event.latitude !== null && event.longitude !== null
      ? `${event.latitude},${event.longitude}`
      : event.matched_spot_address || fallbackAddress || event.venue_name || event.title;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ occurrence?: string }>;
}) {
  const { id } = await params;
  const { occurrence } = await searchParams;

  let event: EventRow | null = null;
  let allEvents: EventRow[] = [];
  try {
    [event, allEvents] = await Promise.all([
      eventDetail(id, occurrence),
      events(100),
    ]);
  } catch {
    return (
      <main className={styles.page}>
        <div className={styles.empty} role="alert">
          Das Event konnte gerade nicht geladen werden. Bitte versuche es erneut.
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className={styles.page}>
        <div className={styles.empty}>Event nicht verfügbar.</div>
      </main>
    );
  }

  const more = upcoming(event, allEvents);
  const eventImage = imageUrl(
    event.image_storage_path,
    event.image_rights_verified,
  );

  return (
    <main className={styles.page}>
      <Link href="/events">← Was läuft?</Link>
      <div className={styles.detail}>
        <div
          className={styles.hero}
          style={eventImage ? { backgroundImage: `url(${eventImage})` } : undefined}
        />
        <article className={styles.panel}>
          <div className={styles.pink}>{event.organizer ?? "BACKYRD EVENT"}</div>
          <h1>{event.title}</h1>
          <div className={styles.tags}>
            {event.categories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
          <div className={styles.facts}>
            <strong>
              {new Date(event.start_at).toLocaleString("de-CH", {
                timeZone: "Europe/Zurich",
                dateStyle: "full",
                timeStyle: "short",
              })}
            </strong>
            {event.recurrence_summary && <span>{event.recurrence_summary}</span>}
            <span>
              {event.is_free
                ? "Gratis"
                : event.price_min !== null
                  ? `ab CHF ${event.price_min}`
                  : "Preis unbekannt"}
            </span>
            {event.minimum_age !== null && <span>Ab {event.minimum_age} Jahren</span>}
            <span>
              Familiengeeignet:{" "}
              {event.family_friendly === null
                ? "Unbekannt"
                : event.family_friendly
                  ? "Ja"
                  : "Nein"}
            </span>
            <p>{event.short_description}</p>
          </div>

          {event.matched_spot_id && (
            <div className={styles.spot}>
              {event.matched_spot_photo && (
                <div
                  className={styles.spotImage}
                  role="img"
                  aria-label={event.matched_spot_name ?? "Venue"}
                  style={{ backgroundImage: `url(${event.matched_spot_photo})` }}
                />
              )}
              <div>
                <div className={styles.pink}>VENUE AUF BACKYRD</div>
                <strong>{event.matched_spot_name}</strong>
                <p>
                  {[event.matched_spot_address, event.matched_spot_city]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <Link href={`/spots/${event.matched_spot_id}`}>Spot ansehen →</Link>
                <br />
                <a href={routeUrl(event)} target="_blank" rel="noreferrer">
                  Route öffnen ↗
                </a>
              </div>
            </div>
          )}

          {event.external_url && (
            <p>
              <a href={event.external_url} target="_blank" rel="noreferrer">
                Mehr erfahren ↗
              </a>
            </p>
          )}
        </article>
      </div>

      {more.length > 0 && (
        <section className={styles.more}>
          <h2>Weitere / kommende Events</h2>
          <div className={styles.grid}>
            {more.map((item) => (
              <Link
                className={styles.card}
                href={`/events/${item.event_id}?occurrence=${item.occurrence_id}`}
                key={item.occurrence_id}
              >
                <div className={styles.body}>
                  <h2>{item.title}</h2>
                  <p>
                    {new Date(item.start_at).toLocaleDateString("de-CH", {
                      timeZone: "Europe/Zurich",
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
