import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicSpotDetail } from "@/lib/public-spot-detail";
import styles from "./spot.module.css";

function priceSymbols(level?: number | null) {
  if (!level || level < 1) return null;
  return "$".repeat(Math.min(4, Math.max(1, level)));
}

function mapsUrl(address: string | null | undefined, name: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address || name
  )}`;
}

export default async function SpotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicSpotDetail(id);
  const spot = data?.spot;

  if (!spot?.id) notFound();

  const hero =
    data.photos[0]?.url ||
    spot.header_photo_path ||
    null;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || "#app-download";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          backyrd
        </Link>
        <div>
          <Link href="/discover">Neue Entscheidung</Link>
          <a href={appUrl} className={styles.appButton}>
            App laden
          </a>
        </div>
      </header>

      <section className={styles.hero}>
        <div
          className={`${styles.heroImage} ${hero ? "" : styles.heroFallback}`}
          style={
            hero
              ? {
                  backgroundImage: `linear-gradient(180deg, transparent 38%, rgba(7,7,8,.94)), url("${hero}")`,
                }
              : undefined
          }
        >
          <Link href="/discover" className={styles.back}>
            ← Zurück zur Entscheidung
          </Link>

          <div className={styles.heroCopy}>
            <div className={styles.meta}>
              <span>{spot.category?.name || "Spot"}</span>
              {spot.city && <span>{spot.city}</span>}
              {priceSymbols(spot.price_level) && (
                <span>{priceSymbols(spot.price_level)}</span>
              )}
            </div>
            <h1>{spot.name}</h1>
            <p>
              {spot.address ||
                [spot.city, spot.country].filter(Boolean).join(", ")}
            </p>
          </div>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.mainColumn}>
          {data.top_moods.length > 0 && (
            <section className={styles.block}>
              <p className={styles.eyebrow}>So fühlt es sich an</p>
              <div className={styles.moods}>
                {data.top_moods.slice(0, 8).map((mood) => (
                  <span key={`${mood.mood_id}-${mood.token}`}>{mood.token}</span>
                ))}
              </div>
            </section>
          )}

          {data.photos.length > 1 && (
            <section className={styles.block}>
              <p className={styles.eyebrow}>Eindrücke</p>
              <div className={styles.gallery}>
                {data.photos.slice(1, 5).map((photo) => (
                  <div key={String(photo.id)}>
                    <img src={photo.url} alt={spot.name} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={styles.block}>
            <div className={styles.sectionTitle}>
              <div>
                <p className={styles.eyebrow}>Backyrd Moments</p>
                <h2>So wurde dieser Ort erlebt.</h2>
              </div>
              <a href={appUrl}>Moment in der App erstellen</a>
            </div>

            {data.reviews.length === 0 ? (
              <div className={styles.empty}>Noch keine öffentlichen Moments.</div>
            ) : (
              <div className={styles.reviews}>
                {data.reviews.slice(0, 6).map((review) => (
                  <article key={review.id}>
                    <div className={styles.reviewTop}>
                      <strong>{review.user.first_name || "Backyrd User"}</strong>
                      <div>
                        {review.mood_a && <span>{review.mood_a}</span>}
                        {review.mood_b && <span>{review.mood_b}</span>}
                      </div>
                    </div>
                    {review.text && <p>{review.text}</p>}
                    {review.photos[0]?.url && (
                      <img src={review.photos[0].url} alt="" />
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className={styles.aside}>
          <p className={styles.eyebrow}>Spot Info</p>

          <dl>
            <div>
              <dt>Adresse</dt>
              <dd>{spot.address || "Nicht angegeben"}</dd>
            </div>
            {spot.website && (
              <div>
                <dt>Website</dt>
                <dd>
                  <a href={spot.website} target="_blank" rel="noreferrer">
                    Website öffnen ↗
                  </a>
                </dd>
              </div>
            )}
            {spot.phone && (
              <div>
                <dt>Telefon</dt>
                <dd>
                  <a href={`tel:${spot.phone}`}>{spot.phone}</a>
                </dd>
              </div>
            )}
          </dl>

          <a
            href={mapsUrl(spot.address, spot.name)}
            target="_blank"
            rel="noreferrer"
            className={styles.routeButton}
          >
            Route öffnen
          </a>
        </aside>
      </section>

      <section id="app-download" className={styles.appGate}>
        <div>
          <p className={styles.eyebrow}>Vollständig in der App</p>
          <h2>Speichern. Folgen. Erleben.</h2>
          <p>
            Favoriten, persönliche Empfehlungen, Journeys und eigene Moments
            sind Teil der Backyrd App.
          </p>
        </div>
        <a href={appUrl}>Backyrd App herunterladen</a>
      </section>
    </main>
  );
}
