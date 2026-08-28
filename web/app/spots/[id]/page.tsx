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
                {spot.category?.name || "Backyrd Spot"} · {spot.city || "Basel"}
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
                <p className="b-kicker">So fühlt es sich an</p>
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
                      key={`${mood.mood_id}-${mood.token}`}
                    >
                      {mood.token}
                    </span>
                  ))}
                </div>
              </section>
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
                <div>
                  <dt className="b-label">Adresse</dt>
                  <dd style={{ margin: "6px 0 0" }}>
                    {spot.address || "Nicht angegeben"}
                  </dd>
                </div>
                {spot.website ? (
                  <div>
                    <dt className="b-label">Website</dt>
                    <dd style={{ margin: "6px 0 0" }}>
                      <a href={spot.website} target="_blank" rel="noreferrer">
                        Website öffnen ↗
                      </a>
                    </dd>
                  </div>
                ) : null}
                {spot.phone ? (
                  <div>
                    <dt className="b-label">Telefon</dt>
                    <dd style={{ margin: "6px 0 0" }}>
                      <a href={`tel:${spot.phone}`}>{spot.phone}</a>
                    </dd>
                  </div>
                ) : null}
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
