import Link from "next/link";
import { eventCategoryLabel } from "@backyrd/shared";
import { events, imageUrl, type EventRow } from "@/lib/events-public";
import styles from "./events.module.css";

export const dynamic = "force-dynamic";

type Range = "today" | "tomorrow" | "weekend" | "all";

const rangeLinks: Array<{ key: Range; label: string }> = [
  { key: "today", label: "Heute" },
  { key: "tomorrow", label: "Morgen" },
  { key: "weekend", label: "Wochenende" },
  { key: "all", label: "Alle" },
];

const categoryLinks = [
  { key: "SPORT", label: "Sport" },
  { key: "ACTIVITY", label: "Aktivität" },
  { key: "LEISURE", label: "Freizeit" },
];

function zurichDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekendKeys(today: string): Set<string> {
  const noon = new Date(`${today}T12:00:00Z`);
  const isoDay = noon.getUTCDay() || 7;
  const fridayOffset = isoDay <= 5 ? 5 - isoDay : -(isoDay - 5);
  const friday = addDays(today, fridayOffset);
  return new Set([friday, addDays(friday, 1), addDays(friday, 2)]);
}

function filterRows(rows: EventRow[], range: Range, category?: string) {
  const today = zurichDateKey(new Date());
  const tomorrow = addDays(today, 1);
  const weekend = weekendKeys(today);
  return rows.filter((row) => {
    const rowDate = zurichDateKey(new Date(row.start_at));
    const inRange =
      range === "all" ||
      (range === "today" && rowDate === today) ||
      (range === "tomorrow" && rowDate === tomorrow) ||
      (range === "weekend" && weekend.has(rowDate));
    return inRange && (!category || row.categories.includes(category));
  });
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; category?: string }>;
}) {
  const params = await searchParams;
  const range = rangeLinks.some((item) => item.key === params.range)
    ? (params.range as Range)
    : "all";
  const category = categoryLinks.some((item) => item.key === params.category)
    ? params.category
    : undefined;

  let rows: EventRow[] = [];
  let loadError = false;
  try {
    rows = filterRows(await events(), range, category);
  } catch {
    loadError = true;
  }

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <div className={styles.pink}>BASEL</div>
          <h1>Was läuft?</h1>
          <p>Events für heute, morgen und das Wochenende.</p>
        </div>
        <Link href="/">backyrd</Link>
      </header>

      <nav className={styles.filters} aria-label="Event-Zeitraum">
        {rangeLinks.map((item) => (
          <Link key={item.key} href={`/events?range=${item.key}`}>
            {item.label}
          </Link>
        ))}
        {categoryLinks.map((item) => (
          <Link key={item.key} href={`/events?range=${range}&category=${item.key}`}>
            {item.label}
          </Link>
        ))}
      </nav>

      {loadError ? (
        <div className={styles.empty} role="alert">
          Events konnten gerade nicht geladen werden. Bitte versuche es erneut.
        </div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>Für diesen Zeitraum sind noch keine Events bestätigt.</div>
      ) : (
        <div className={styles.grid}>
          {rows.map((event) => {
            const eventImage = imageUrl(
              event.image_storage_path,
              event.image_rights_verified,
            );
            return (
              <Link
                className={styles.card}
                href={`/events/${event.event_id}?occurrence=${event.occurrence_id}`}
                key={event.occurrence_id}
              >
                <div
                  className={styles.image}
                  style={eventImage ? { backgroundImage: `url(${eventImage})` } : undefined}
                />
                <div className={styles.body}>
                  <div className={styles.tags}>
                    {event.categories.map((item) => (
                      <span key={item}>{eventCategoryLabel(item)}</span>
                    ))}
                  </div>
                  <h2>{event.title}</h2>
                  <p>
                    {new Date(event.start_at).toLocaleString("de-CH", {
                      timeZone: "Europe/Zurich",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <p>{event.venue_name ?? "Venue noch nicht bestätigt"}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
