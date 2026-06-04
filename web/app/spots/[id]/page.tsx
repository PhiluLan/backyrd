//web/app/spots/[id]/page.tsx
import { SiteHeader } from "@/components/site-header";
import { getSpotDetail } from "@/lib/backyrd-api";
import { notFound } from "next/navigation";

function priceSymbols(level?: number | null) {
  if (!level || level < 1) return "—";
  return "$".repeat(Math.min(4, Math.max(1, level)));
}

export default async function SpotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getSpotDetail(id);

  const spot = data?.spot;

  if (!spot?.id) {
    notFound();
  }

  const hero =
    data.photos[0]?.url ||
    spot.header_photo_path ||
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1600&auto=format&fit=crop";

  return (
    <main className="min-h-screen bg-[#050506]">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-6 pb-20 pt-8">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
          <div className="aspect-[16/7] bg-neutral-900">
            <img src={hero} alt={spot.name} className="h-full w-full object-cover" />
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
                {spot.category?.name || "Spot"}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
                {priceSymbols(spot.price_level)}
              </div>
            </div>

            <h1 className="text-4xl font-semibold tracking-tight text-white">
              {spot.name}
            </h1>

            <p className="mt-4 max-w-3xl text-lg leading-8 text-white/60">
              {spot.address || [spot.city, spot.country].filter(Boolean).join(", ") || "Keine Adresse"}
            </p>

            {data.top_moods.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-3">
                {data.top_moods.map((mood) => (
                  <div
                    key={`${mood.mood_id}-${mood.token}`}
                    className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/75"
                  >
                    {mood.token}
                  </div>
                ))}
              </div>
            )}

            {data.photos.length > 1 && (
              <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.photos.slice(1).map((photo) => (
                  <div
                    key={String(photo.id)}
                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/5"
                  >
                    <img
                      src={photo.url}
                      alt={spot.name}
                      className="aspect-[4/3] h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-12">
              <h2 className="text-2xl font-semibold text-white">Reviews</h2>

              <div className="mt-6 space-y-4">
                {data.reviews.length === 0 ? (
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/60">
                    Noch keine Reviews vorhanden.
                  </div>
                ) : (
                  data.reviews.map((review) => (
                    <article
                      key={review.id}
                      className="rounded-3xl border border-white/10 bg-white/5 p-6"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-sm font-medium text-white">
                          {review.user.first_name || "User"}
                        </div>

                        {review.mood_a && (
                          <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
                            {review.mood_a}
                          </div>
                        )}

                        {review.mood_b && (
                          <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
                            {review.mood_b}
                          </div>
                        )}
                      </div>

                      {review.text && (
                        <p className="mt-4 text-sm leading-7 text-white/65">{review.text}</p>
                      )}

                      {review.photos[0]?.url && (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                          <img
                            src={review.photos[0].url}
                            alt="Review photo"
                            className="aspect-[4/3] w-full object-cover"
                          />
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>

          <aside className="h-fit rounded-3xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">Info</h3>

            <div className="mt-5 space-y-4 text-sm text-white/65">
              <div>
                <div className="mb-1 text-white/40">Adresse</div>
                <div>{spot.address || "—"}</div>
              </div>

              <div>
                <div className="mb-1 text-white/40">Website</div>
                <div>{spot.website || "—"}</div>
              </div>

              <div>
                <div className="mb-1 text-white/40">Telefon</div>
                <div>{spot.phone || "—"}</div>
              </div>

              <div>
                <div className="mb-1 text-white/40">E-Mail</div>
                <div>{spot.email || "—"}</div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}