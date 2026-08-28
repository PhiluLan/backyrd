import Link from "next/link";
import type { SpotCardDTO } from "@backyrd/shared";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";

function priceSymbols(level?: number | null) {
  if (!level || level < 1) return "—";
  return "$".repeat(Math.min(4, Math.max(1, level)));
}

export function SpotCard({ spot }: { spot: SpotCardDTO }) {
  return (
    <Link
      href={`/spots/${spot.id}`}
      className="group overflow-hidden rounded-3xl border border-white/10 bg-white/5 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07]"
    >
      <CanonicalSpotImage
        attributionMode="thumbnail"
        className="relative aspect-[4/3] overflow-hidden bg-neutral-900 transition duration-500 group-hover:scale-[1.03]"
        ownerAdminImageUrl={spot.header_photo_path}
        spotId={spot.id}
        spotName={spot.name}
      />

      <div className="space-y-2 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{spot.name}</h3>
            <p className="mt-1 text-sm text-white/55">
              {spot.category_name || "Spot"}
            </p>
          </div>

          <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
            {priceSymbols(spot.price_level)}
          </div>
        </div>

        <p className="line-clamp-2 text-sm text-white/60">
          {spot.address || [spot.city, spot.country].filter(Boolean).join(", ") || "Keine Adresse"}
        </p>
      </div>
    </Link>
  );
}
