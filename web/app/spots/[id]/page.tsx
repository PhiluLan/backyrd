import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import { SpotActions } from "@/components/consumer/spot-actions";
import { ArrowIcon, RouteIcon } from "@/components/consumer/icons";
import { getPublicSpotDetailServer } from "@/lib/public-spot-detail-server";
function maps(address: string | null, name: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || name)}`;
}
const weekOrder = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
function shortTime(value: string | null) {
  return value ? value.slice(0, 5) : null;
}
const worldWord:Record<string,string>={COFFEE_DAYTIME:"Café & Tageszeit",DRINKS:"Getränke",EAT:"Essen",QUIET:"Ruhig",LIVELY:"Lebendig",COZY:"Gemütlich",MORNING:"Vormittag",MIDDAY:"Mittag",AFTERNOON:"Nachmittag",EVENING:"Abend",NIGHT:"Nacht"};
function presentWorld(value:unknown):string{if(value==null)return "Noch unbekannt";if(typeof value==="boolean")return value?"Ja":"Nein";if(typeof value==="string")return worldWord[value]??value.replaceAll("_"," ").toLocaleLowerCase("de-CH").replace(/^./,(letter)=>letter.toLocaleUpperCase("de-CH"));if(typeof value==="number")return new Intl.NumberFormat("de-CH").format(value);if(Array.isArray(value))return value.map(presentWorld).join(" · ");if(typeof value==="object")return Object.entries(value as Record<string,unknown>).filter(([,item])=>item!=null&&item!=="").map(([key,item])=>`${key.replaceAll("_"," ")}: ${presentWorld(item)}`).join(" · ");return String(value)}
const fieldLabels: Record<string, string> = {
  "classification.primary_category": "Hauptkategorie",
  "classification.place_types": "Art des Ortes",
  "operation.price_level": "Preisniveau",
  "description.highlight": "Beschreibung",
  "context.typical_dayparts": "Typische Tageszeit",
  "context.atmosphere": "Atmosphäre",
  "amenity.features": "Ausstattung",
  "accessibility.accessible_toilet": "Barrierefreies WC",
  "accessibility.elevator": "Lift",
  "accessibility.step_free_entrance": "Stufenfreier Eingang",
  "context.visit_situations": "Passt zu",
  "offering.food_specialities": "Spezialitäten",
  "rule.pet_access": "Tiere",
  "hours.special": "Sonderöffnungszeiten",
  "contact.website": "Webseite",
  "contact.phone": "Telefon",
  "contact.public_email": "E-Mail",
  "contact.instagram": "Instagram",
  "contact.facebook": "Facebook",
  "contact.linkedin": "LinkedIn",
  "contact.tiktok": "TikTok",
};
const overviewKeys = ["classification.primary_category", "classification.place_types", "operation.price_level"];
const contactKeys = ["contact.website", "contact.phone", "contact.public_email", "contact.instagram", "contact.facebook", "contact.linkedin", "contact.tiktok"];
const moreKeys = ["context.typical_dayparts", "context.atmosphere", "amenity.features", "accessibility.accessible_toilet", "accessibility.elevator", "accessibility.step_free_entrance", "context.visit_situations", "offering.food_specialities", "rule.pet_access"];
const shownKeys = new Set([...overviewKeys, ...contactKeys, ...moreKeys, "description.highlight", "hours.regular", "hours.special", "location.address_line1", "location.locality", "location.neighborhood", "location.country_code"]);
function contactHref(key: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (key === "contact.phone") return `tel:${text}`;
  if (key === "contact.public_email") return `mailto:${text}`;
  if (/^https?:\/\//i.test(text)) return text;
  if (key === "contact.website") return `https://${text}`;
  if (key.startsWith("contact.") && text.startsWith("@")) {
    const host = {"contact.instagram":"instagram.com","contact.facebook":"facebook.com","contact.linkedin":"linkedin.com/in","contact.tiktok":"tiktok.com"}[key];
    return host ? `https://${host}/${text.slice(1)}` : null;
  }
  return null;
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getPublicSpotDetailServer(id);
  if (!data) return { title: "Spot nicht gefunden" };
  return {
    title: data.spot.name,
    description: `${data.spot.name} in ${data.spot.city || "Basel"} auf Backyrd entdecken.`,
    alternates: { canonical: `/spots/${encodeURIComponent(data.spot.id)}` },
    openGraph: {
      title: data.spot.name,
      description: `${data.spot.category?.name || "Ort"} · ${data.spot.city || "Basel"}`,
      images: data.spot.header_photo_path ? [data.spot.header_photo_path] : [],
    },
  };
}
export default async function SpotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicSpotDetailServer(id);
  if (!data?.spot?.id) notFound();
  const spot = data.spot;
  const canonicalWorldDetail = Boolean(data.world_profile?.worldManifestHash);
  const publicCategory = data.world_profile?.fields.find((field)=>field.attributeKey==="classification.primary_category");
  const fields = data.world_profile?.fields ?? [];
  const field = (key: string) => fields.find((item) => item.attributeKey === key);
  const additionalFields = fields.filter((item) => !shownKeys.has(item.attributeKey));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: spot.name,
    address: spot.address,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.backyrd.ch"}/spots/${spot.id}`,
    telephone: spot.phone || undefined,
    image: spot.header_photo_path || undefined,
  };
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section style={{ position: "relative" }}>
        <CanonicalSpotImage
          className=""
          ownerAdminImageUrl={spot.header_photo_path}
          spotId={spot.id}
          spotName={spot.name}
        >
          <div
            style={{
              minHeight: "min(76vh,820px)",
              display: "flex",
              alignItems: "end",
              padding: "clamp(26px,6vw,96px)",
              background:
                "linear-gradient(180deg,rgba(5,5,6,.06),rgba(5,5,6,.9))",
            }}
          >
            <div className="b-container" style={{ margin: 0 }}>
              <p className="b-kicker">
                {publicCategory ? presentWorld(publicCategory.value) : canonicalWorldDetail ? "Backyrd Spot" : spot.category?.name || "Backyrd Spot"} · {spot.city || "Basel"}
              </p>
              <h1
                className="b-display b-display-lg"
                style={{ maxWidth: 1000, marginTop: 14 }}
              >
                {spot.name}
              </h1>
              <p className="b-body" style={{ fontSize: 18 }}>
                {spot.address ||
                  [spot.city, spot.country].filter(Boolean).join(" · ")}
              </p>
              <SpotActions
                spotId={spot.id}
                spotName={spot.name}
                routeUrl={maps(spot.address, spot.name)}
              />
            </div>
          </div>
        </CanonicalSpotImage>
      </section>
      <div className="b-container b-section">
        <div className="b-spot-detail-grid">
          <section aria-label="Erfahrungen und Eindrücke">
            {data.top_moods.length ? (
              <section>
                <h2 className="b-section-title">So fühlt es sich hier an</h2>
                {data.top_moods[0]?.evidence_state === "EARLY" ? <p className="b-muted" style={{ marginTop: 8 }}>Erste Eindrücke</p> : null}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 16,
                  }}
                >
                  {data.top_moods.slice(0, 8).map((mood) => (
                    <span
                      className="b-chip"
                      key={mood.concept_key}
                    >
                      {mood.label}{mood.evidence_state === "ESTABLISHED" ? ` ${mood.percentage}%` : ""}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
            {overviewKeys.some((key) => field(key)) ? (
              <section className="b-detail-section" aria-label="Auf einen Blick">
                <p className="b-kicker">Auf einen Blick</p>
                <dl className="b-detail-facts">
                  {overviewKeys.map((key) => field(key) ? (
                    <div key={key}><dt>{fieldLabels[key]}</dt><dd>{presentWorld(field(key)?.value)}</dd></div>
                  ) : null)}
                </dl>
              </section>
            ) : null}
            {contactKeys.some((key) => field(key)) ? (
              <section className="b-detail-section" aria-label="Kontakt">
                <h2 className="b-section-title">Kontakt</h2>
                <dl className="b-detail-contact">
                  {contactKeys.map((key) => {
                    const item = field(key);
                    if (!item) return null;
                    const href = contactHref(key, item.value);
                    return <div key={key}><dt>{fieldLabels[key]}</dt><dd>{href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>{String(item.value)} ↗</a> : String(item.value)}</dd></div>;
                  })}
                </dl>
              </section>
            ) : null}
            {(field("description.highlight") || (!canonicalWorldDetail && spot.description)) ? (
              <section className="b-detail-section" aria-label="Über diesen Ort">
                <h2 className="b-section-title">Was dich hier erwartet.</h2>
                <p className="b-body" style={{ marginTop: 18, whiteSpace: "pre-line" }}>
                  {typeof field("description.highlight")?.value === "string" ? field("description.highlight")?.value as string : spot.description}
                </p>
              </section>
            ) : null}
            {field("hours.special") ? (
              <section className="b-detail-section" aria-label="Sonderöffnungszeiten">
                <h2 className="b-section-title">Sonderöffnungszeiten</h2>
                <p className="b-body" style={{ marginTop: 18 }}>{presentWorld(field("hours.special")?.value)}</p>
              </section>
            ) : null}
            {moreKeys.some((key) => field(key)) || additionalFields.length ? (
              <details className="b-detail-more b-detail-section">
                <summary>Mehr Infos</summary>
                <dl className="b-detail-facts">
                  {[...moreKeys.map((key) => field(key)).filter((item) => item != null), ...additionalFields].map((item, index) => (
                    <div key={`${item.attributeKey}:${index}`}><dt>{fieldLabels[item.attributeKey] ?? item.attributeKey.replaceAll(".", " · ")}</dt><dd>{presentWorld(item.value)}</dd></div>
                  ))}
                </dl>
              </details>
            ) : null}
            {data.photos.length > 1 ? (
              <section style={{ marginTop: 64 }}>
                <p className="b-kicker">Eindrücke</p>
                <h2 className="b-section-title" style={{ marginTop: 9 }}>
                  Ein Ort, mehrere Perspektiven.
                </h2>
                <div className="b-grid b-grid-2" style={{ marginTop: 24 }}>
                  {data.photos.slice(1, 5).map((photo) => (
                    <img
                      key={String(photo.id)}
                      src={photo.url}
                      alt={`${spot.name} Eindruck`}
                      style={{
                        width: "100%",
                        aspectRatio: "4/3",
                        objectFit: "cover",
                        borderRadius: 18,
                      }}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            <section style={{ marginTop: 64 }}>
              <div className="b-section-header">
                <div>
                  <p className="b-kicker">Reviews</p>
                  <h2 className="b-section-title" style={{ marginTop: 9 }}>
                    So wurde dieser Ort erlebt.
                  </h2>
                </div>
                <Link
                  href={`/reviews/new?spotId=${spot.id}`}
                  className="b-button b-button-secondary"
                >
                  Review teilen <ArrowIcon />
                </Link>
              </div>
              {data.reviews.length ? (
                <div className="b-grid b-grid-2">
                  {data.reviews.slice(0, 8).map((review) => (
                    <article
                      className="b-surface"
                      style={{ padding: 22 }}
                      key={review.id}
                    >
                      <p className="b-meta">
                        {review.user.first_name || "Backyrd User"}
                      </p>
                      {review.text ? (
                        <p className="b-body">{review.text}</p>
                      ) : null}
                      <div className="b-spot-card-moods">
                        {[review.mood_a, review.mood_b]
                          .filter(Boolean)
                          .map((mood) => (
                            <span className="b-chip" key={mood!}>
                              {mood}
                            </span>
                          ))}
                      </div>
                      {review.photos[0]?.url ? (
                        <img
                          src={review.photos[0].url}
                          alt=""
                          style={{
                            width: "100%",
                            aspectRatio: "4/3",
                            objectFit: "cover",
                            borderRadius: 14,
                            marginTop: 16,
                          }}
                        />
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="b-state">
                  <div className="b-state-inner">
                    <h2>Noch keine Reviews</h2>
                    <p>
                      Dieser Ort wartet auf seine erste rückblickende Erfahrung.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </section>
          <aside>
            <div
              className="b-surface"
              style={{ padding: 24, position: "sticky", top: 110 }}
            >
              <p className="b-kicker">Spot Info</p>
              <dl style={{ display: "grid", gap: 20, marginTop: 24 }}>
                {!canonicalWorldDetail && spot.website ? (
                  <div>
                    <dt className="b-label">Website</dt>
                    <dd style={{ margin: "6px 0 0" }}><a href={spot.website} target="_blank" rel="noreferrer">Website öffnen ↗</a></dd>
                  </div>
                ) : null}
                {!canonicalWorldDetail && spot.phone ? (
                  <div><dt className="b-label">Telefon</dt><dd style={{ margin: "6px 0 0" }}><a href={`tel:${spot.phone}`}>{spot.phone}</a></dd></div>
                ) : null}
                {!canonicalWorldDetail ? <div>
                  <dt className="b-label">Adresse</dt>
                  <dd style={{ margin: "6px 0 0" }}>
                    {spot.address || "Nicht angegeben"}
                  </dd>
                </div> : <div><dt className="b-label">Adresse</dt><dd style={{ margin: "6px 0 0" }}>{spot.address || "Nicht angegeben"}</dd></div>}
                <div>
                  <dt className="b-label">Öffnungszeiten</dt>
                  <dd style={{ margin: "8px 0 0" }}>
                    {data.opening_hours.length ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        {weekOrder.map((day) => {
                          const slots = data.opening_hours.filter((row) => row.day_of_week === day);
                          return (
                            <div key={day} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                              <span>{day.slice(0, 2)}</span>
                              <span>
                                {slots.length
                                  ? slots.map((slot) => slot.open_time && slot.close_time
                                    ? `${shortTime(slot.open_time)}–${shortTime(slot.close_time)}`
                                    : "Geschlossen").join(", ")
                                  : "Nicht bekannt"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span>Aktuell nicht verlässlich hinterlegt</span>
                    )}
                  </dd>
                </div>
              </dl>
              <a
                className="b-button b-button-primary"
                href={maps(spot.address, spot.name)}
                target="_blank"
                rel="noreferrer"
                style={{ width: "100%", marginTop: 26 }}
              >
                <RouteIcon /> Route
              </a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
