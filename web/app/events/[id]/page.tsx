import Link from "next/link";
import {
  eventCategoryLabel,
  eventPropertyLabels,
  eventSourceDisclaimer,
  formatCompactOccurrenceDate,
  formatEventAddress,
  formatEventDateTime,
  humanizeRecurrence,
} from "@backyrd/shared";
import {
  eventDetail,
  editionPlaces,
  events,
  imageUrl,
  type EventRow,
} from "@/lib/events-public";
import styles from "../events.module.css";

import { seasonalDateLabel, seasonalPlaceRows } from "../../../../packages/shared/src/seasonal-events";

export const dynamic = "force-dynamic";

function upcoming(current: EventRow, rows: EventRow[]) {
  const available = rows.filter(
    (row) =>
      row.occurrence_id !== current.occurrence_id &&
      row.start_at > current.start_at &&
      row.event_status !== "CANCELLED" &&
      row.occurrence_status !== "CANCELLED",
  );
  const sameEvent = available.filter((row) => row.event_id === current.event_id);
  const sameVenue = available.filter(
    (row) =>
      row.event_id !== current.event_id &&
      ((current.matched_spot_id !== null &&
        row.matched_spot_id === current.matched_spot_id) ||
        (current.matched_spot_id === null &&
          current.venue_id !== null &&
          row.venue_id === current.venue_id)),
  );
  return { sameEvent, sameVenue: sameVenue.slice(0, 6) };
}

function routeUrl(event: EventRow): string {
  const fallbackAddress = formatEventAddress({
    addressLine: event.address_line,
    postalCode: event.postal_code,
    city: event.city,
    countryCode: event.country_code,
  });
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

  const placeRows=event.series_id?await editionPlaces(event.event_id).catch(()=>null):null;
  const places=seasonalPlaceRows(placeRows??[]);
  const more = upcoming(event, allEvents);
  const recurrence = humanizeRecurrence(event.recurrence_summary);
  const properties = eventPropertyLabels(event.minimum_age, event.family_friendly);
  const eventAddress = formatEventAddress({
    addressLine: event.address_line,
    postalCode: event.postal_code,
    city: event.city,
    countryCode: event.country_code,
  });
  const spotAddress = formatEventAddress({
    addressLine: event.matched_spot_address,
    city: event.matched_spot_city,
    countryCode: event.country_code,
  });
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
          {event.series_id&&<p>{seasonalDateLabel(event)}</p>}
          <div className={styles.tags}>
            {event.categories.map((category) => (
              <span key={category}>{eventCategoryLabel(category)}</span>
            ))}
          </div>
          <div className={styles.facts}>
            <strong>
              {formatEventDateTime(event.start_at, event.end_at)}
            </strong>
            {recurrence && <span className={styles.recurrence}>{recurrence}</span>}
            <div className={styles.where}>
              <strong>{event.venue_name ?? "Ort noch nicht bestätigt"}</strong>
              {eventAddress && <span>{eventAddress}</span>}
            </div>
            <span>
              {event.is_free
                ? "Gratis"
                : event.price_min !== null
                  ? `ab CHF ${event.price_min}`
                  : "Preis unbekannt"}
            </span>
            {properties.length > 0 && (
              <div className={styles.properties}>
                {properties.map((property) => <span key={property}>{property}</span>)}
              </div>
            )}
            <p>{event.short_description}</p>
          </div>

          {event.admission_note&&<p>{event.admission_note}</p>}
          {event.series_id&&<section><h2>Die Schauplätze</h2><p>Jeder Platz hat eigene Tageszeiten und eine eigene Route.</p>{placeRows===null?<p role="alert">Die Schauplätze konnten gerade nicht geladen werden.</p>:places.map(place=><article key={place.venue_id} className={styles.facts}><h3>{place.venue_name}</h3><p>{place.place_environment==='INDOOR'?'Drinnen':place.place_environment==='OUTDOOR'?'Draussen':'Bereich noch nicht bestätigt'}</p><p>{formatEventDateTime(place.start_at,place.end_at)}</p><a href={routeUrl(place)} target="_blank" rel="noreferrer">Route zu diesem Platz ↗</a><details><summary>Alle Tageszeiten ansehen</summary>{placeRows.filter(row=>row.venue_id===place.venue_id).map(row=><p key={row.occurrence_id}>{formatEventDateTime(row.start_at,row.end_at)}{row.occurrence_status==='CANCELLED'?' · Abgesagt':''}</p>)}</details></article>)}</section>}
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
                  {spotAddress}
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
          <p className={styles.sourceNote}>{eventSourceDisclaimer(event.source)}</p>
        </article>
      </div>

      {more.sameEvent.length > 0 && (
        <section className={styles.more}>
          <h2>Nächste Termine</h2>
          <div className={styles.occurrences}>
            {more.sameEvent.slice(0, 3).map((item) => (
              <Link
                className={styles.occurrence}
                href={`/events/${item.event_id}?occurrence=${item.occurrence_id}`}
                key={item.occurrence_id}
              >
                {formatCompactOccurrenceDate(item.start_at)}
              </Link>
            ))}
          </div>
          {more.sameEvent.length > 3 && (
            <details className={styles.allOccurrences}>
              <summary>Alle Termine</summary>
              <div className={styles.occurrences}>
                {more.sameEvent.slice(3).map((item) => (
                  <Link
                    className={styles.occurrence}
                    href={`/events/${item.event_id}?occurrence=${item.occurrence_id}`}
                    key={item.occurrence_id}
                  >
                    {formatCompactOccurrenceDate(item.start_at)}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {more.sameVenue.length > 0 && (
        <section className={styles.more}>
          <h2>Weitere Events im {event.matched_spot_name || event.venue_name || "Veranstaltungsort"}</h2>
          <div className={styles.grid}>
            {more.sameVenue.map((item) => (
              <Link
                className={styles.card}
                href={`/events/${item.event_id}?occurrence=${item.occurrence_id}`}
                key={item.occurrence_id}
              >
                <div className={styles.body}>
                  <h2>{item.title}</h2>
                  <p>{formatEventDateTime(item.start_at, item.end_at)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
