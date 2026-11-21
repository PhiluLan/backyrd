import Link from "next/link";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
import type { EventRow } from "@/lib/events-public";
import {
  contactHref,
  contactLabels,
  fieldValue,
  moreInfo,
  regularHours,
  specialHours,
} from "@/lib/spot-profile-presentation";
import { spotAddressLines } from "../../../mobile/lib/spot-address-presentation";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import { EventCards } from "@/components/home-events";
import { SpotMoodProfile } from "./spot-mood-profile";
import { SpotExperience } from "./spot-experience";
import { SpotActions } from "./spot-actions";
import { SpotNearby } from "./spot-nearby";
import { ArrowIcon, PlacesIcon } from "./icons";
import styles from "./spot-profile.module.css";

export function SpotProfile({
  data,
  events,
}: {
  data: PublicSpotDetailDTO;
  events: { rows: EventRow[]; failed: boolean };
}) {
  const { spot } = data;
  const world = data.world_profile;
  const canonical = Boolean(
    world?.worldManifestHash && world.spot.source === "WORLD_KNOWLEDGE",
  );
  const unavailable = data.world_profile_unavailable;
  const fields = world?.fields ?? [];
  const field = (key: string) =>
    fields.find(
      (item) => item.attributeKey === key && item.knowledgeState !== "UNKNOWN",
    );
  const types =
    fieldValue(field("classification.place_types")) ??
    fieldValue(field("classification.primary_category")) ??
    (!canonical && !unavailable ? spot.category?.name : null);
  const price =
    fieldValue(field("operation.price_level")) ??
    (!canonical && !unavailable && spot.price_level
      ? ["Günstig", "Mittel", "Gehoben", "Premium"][spot.price_level - 1]
      : null);
  const highlight = field("description.highlight")?.value;
  const description =
    typeof highlight === "string" && highlight.trim()
      ? highlight
      : (world?.publicDescription ??
        (!canonical && !unavailable ? spot.description : null));
  const addressLines = spotAddressLines({
    street: spot.address,
    legacyAddress: spot.legacy_address,
    postalCode: canonical ? world?.spot.postalCode : null,
    locality: spot.city,
    country: spot.country,
    neighborhood:
      typeof field("location.neighborhood")?.value === "string"
        ? (field("location.neighborhood")?.value as string)
        : null,
  });
  const routeUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([spot.name, ...addressLines].join(", "))}`;
  const contacts = Object.entries(contactLabels).flatMap(([key, label]) => {
    const value =
      field(key)?.value ??
      (!canonical && !unavailable
        ? {
            "contact.website": spot.website,
            "contact.phone": spot.phone,
            "contact.public_email": spot.email,
          }[key as "contact.website"]
        : null);
    const href = contactHref(key, value);
    return href ? [{ label, href }] : [];
  });
  const hoursRows = unavailable ? [] : data.opening_hours;
  const hours = regularHours(hoursRows);
  const specials = specialHours(field("hours.special")?.value);
  const more = moreInfo(fields);
  const report = `mailto:hello@backyrd.ch?subject=${encodeURIComponent(`Hinweis zu ${spot.name}`)}&body=${encodeURIComponent(`Ort: ${spot.name}\nhttps://www.backyrd.ch/spots/${spot.id}\n\nMein Hinweis:\n`)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: spot.name,
    address: addressLines.join(", "),
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.backyrd.ch"}/spots/${spot.id}`,
    image: spot.header_photo_path || undefined,
  };
  return (
    <article className={styles.profile}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className={styles.hero} aria-label={spot.name}>
        <CanonicalSpotImage
          ownerAdminImageUrl={spot.header_photo_path}
          spotId={spot.id}
          spotName={spot.name}
        >
          <div className={styles.heroContent}>
            <div className="b-container">
              <Link href="/places" className={styles.back}>
                ← Alle Orte
              </Link>
              <h1 className="b-display b-display-lg">{spot.name}</h1>
            </div>
          </div>
        </CanonicalSpotImage>
      </section>
      <div className={`b-container ${styles.layout}`}>
        <div className={styles.content}>
          <div className={styles.essentials}>
            {types ? <p className={styles.types}>{types}</p> : null}
            {price ? (
              <span className={styles.price}>Preisniveau: {price}</span>
            ) : null}
          </div>
          {addressLines.length ? (
            <a
              href={routeUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.address}
            >
              <PlacesIcon />
              <span>
                {addressLines.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </span>
            </a>
          ) : null}
          {unavailable ? (
            <p role="status" className={styles.notice}>
              Einige Angaben zu diesem Ort konnten gerade nicht geladen werden.
              Lade die Seite erneut, um sie zu sehen.
            </p>
          ) : null}
          {description ? (
            <section className="b-detail-section" aria-label="Über diesen Ort">
              <h2 className="b-section-title">Über diesen Ort</h2>
              <p className={styles.description}>{description}</p>
            </section>
          ) : null}
          {contacts.length ? (
            <section className="b-detail-section" aria-label="Kontakt">
              <h2 className="b-section-title">Kontakt</h2>
              <div className={styles.contacts}>
                {contacts.map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noreferrer" : undefined}
                  >
                    <span>{label}</span>
                    <ArrowIcon />
                  </a>
                ))}
              </div>
            </section>
          ) : null}
          <section
            className={`b-detail-section ${styles.hours}`}
            aria-label="Besuchszeiten"
          >
            <details>
              <summary>
                <span>Öffnungszeiten</span>
                <span className={styles.chevron} aria-hidden="true">
                  +
                </span>
              </summary>
              {hoursRows.length ? (
                <dl>
                  {hours.map((row) => (
                    <div key={row.day}>
                      <dt>{row.day}</dt>
                      <dd>{row.hours}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="b-muted">
                  Aktuell nicht verlässlich hinterlegt. Frag am besten direkt
                  beim Ort nach.
                </p>
              )}
            </details>
            {field("hours.special") ? (
              <details>
                <summary>
                  <span>Sonderöffnungszeiten</span>
                  <span className={styles.chevron} aria-hidden="true">
                    +
                  </span>
                </summary>
                {specials.length ? (
                  <dl>
                    {specials.map((row) => (
                      <div key={row.date}>
                        <dt>{row.date}</dt>
                        <dd>{row.hours}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="b-muted">
                    Noch keine bestätigten Sonderöffnungszeiten.
                  </p>
                )}
              </details>
            ) : null}
          </section>
          <SpotExperience profile={world?.experienceProfile}>
            {events.failed || events.rows.length ? (
              <section
                className="b-detail-section"
                aria-label="Events bei diesem Spot"
              >
                <h2 className="b-section-title">Was steht an?</h2>
                {events.failed ? (
                  <p className="b-muted">
                    Die Events konnten gerade nicht geladen werden. Bitte lade
                    die Seite erneut.
                  </p>
                ) : (
                  <div className={styles.events}>
                    <EventCards rows={events.rows} />
                  </div>
                )}
              </section>
            ) : null}
          </SpotExperience>
          <section className="b-detail-section" aria-label="Moods">
            <SpotMoodProfile moods={data.top_moods} />
          </section>
          <details className={`b-detail-section ${styles.more}`}>
            <summary>
              Mehr Infos
              <span className={styles.chevron} aria-hidden="true">
                +
              </span>
            </summary>
            <p className="b-muted">
              Ausstattung, Atmosphäre und weitere Details
            </p>
            {more.length ? (
              <dl className="b-detail-facts">
                {more.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>
                      <ul className={styles.factList}>
                        {item.lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="b-muted">
                Sobald weitere bestätigte Angaben vorliegen, findest du sie
                hier.
              </p>
            )}
            {data.photos.length > 1 ? (
              <div className={styles.gallery}>
                <h3>Fotos vom Ort</h3>
                <div>
                  {data.photos
                    .filter((photo) => photo.url !== spot.header_photo_path)
                    .slice(0, 4)
                    .map((photo) => (
                      <img
                        key={String(photo.id)}
                        src={photo.url}
                        alt={`Weitere Perspektive von ${spot.name}`}
                        loading="lazy"
                      />
                    ))}
                </div>
              </div>
            ) : null}
            {data.source_credit ? (
              <p className={styles.source}>
                Quelle der Grundangaben:{" "}
                <a href={data.source_credit.source_url}>
                  {data.source_credit.credit}
                </a>
                {data.source_credit.license_url ? (
                  <>
                    {" "}
                    · <a href={data.source_credit.license_url}>Lizenz</a>
                  </>
                ) : null}
              </p>
            ) : null}
          </details>
          <section className="b-detail-section" aria-label="Hier erlebt">
            <div className={styles.sectionHeader}>
              <h2 className="b-section-title">Hier erlebt</h2>
              <Link
                href={`/reviews/new?spotId=${encodeURIComponent(spot.id)}`}
                className={styles.textLink}
              >
                Moment teilen <ArrowIcon />
              </Link>
            </div>
            <p className="b-muted">Persönliche Eindrücke von diesem Ort.</p>
            {data.reviews.length ? (
              <div className={styles.moments}>
                {data.reviews.slice(0, 8).map((review) => (
                  <article key={review.id} className={styles.moment}>
                    {review.photos[0]?.url ? (
                      <img
                        src={review.photos[0].url}
                        alt={`Eindruck von ${spot.name}`}
                        loading="lazy"
                        className={styles.momentPhoto}
                      />
                    ) : null}
                    <div className={styles.momentBody}>
                      <div className={styles.momentMeta}>
                        <strong>{review.user.first_name || "Mitglied"}</strong>
                        {review.created_at &&
                        Number.isFinite(
                          new Date(review.created_at).getTime(),
                        ) ? (
                          <time dateTime={review.created_at}>
                            {new Intl.DateTimeFormat("de-CH", {
                              day: "numeric",
                              month: "short",
                              timeZone: "Europe/Zurich",
                            }).format(new Date(review.created_at))}
                          </time>
                        ) : null}
                      </div>
                      {review.text ? <p>{review.text}</p> : null}
                      <div className={styles.moodTags}>
                        {[
                          ...new Set(
                            [review.mood_a, review.mood_b].filter(Boolean),
                          ),
                        ].map((mood) => (
                          <span key={mood}>{mood}</span>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>
                Hier ist noch Platz für deinen ersten Moment.
              </p>
            )}
          </section>
          <SpotNearby
            spotId={spot.id}
            city={spot.city}
            latitude={canonical ? world!.spot.latitude : null}
            longitude={canonical ? world!.spot.longitude : null}
          />
          <section className="b-detail-section" aria-label="Ort verwalten">
            <h2 className="b-section-title">Ort verwalten</h2>
            <p className="b-muted">
              Du betreibst diesen Ort? Im Betreiberbereich kannst du deine
              freigegebenen Orte pflegen.
            </p>
            <Link
              href={`/owner/spots/${encodeURIComponent(spot.id)}`}
              className={styles.textLink}
            >
              Zum Betreiberbereich <ArrowIcon />
            </Link>
          </section>
          <section
            className="b-detail-section"
            aria-label="Hinweis zu diesem Ort"
          >
            <h2 className="b-section-title">Stimmt etwas nicht?</h2>
            <a href={report} className={styles.textLink}>
              Schreibe uns! <ArrowIcon />
            </a>
          </section>
        </div>
        <aside className={styles.actions} aria-label="Dein Besuch">
          <div>
            <p className={styles.actionTitle}>Lust, vorbeizuschauen?</p>
            <p className={styles.actionSubtitle}>
              Merk dir den Ort oder mach dich auf den Weg.
            </p>
            <SpotActions
              spotId={spot.id}
              spotName={spot.name}
              routeUrl={routeUrl}
            />
          </div>
        </aside>
      </div>
    </article>
  );
}
