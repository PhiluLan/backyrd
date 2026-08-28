import Link from "next/link";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";

export type ConsumerSpot = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  category?: string | null;
  image?: string | null;
  moods?: string[];
  reviews?: number;
};
export function ConsumerSpotCard({ spot }: { spot: ConsumerSpot }) {
  return (
    <Link
      href={`/spots/${spot.id}`}
      className="b-spot-card"
      aria-label={`${spot.name} öffnen`}
    >
      <CanonicalSpotImage
        className="b-spot-image"
        ownerAdminImageUrl={spot.image}
        spotId={spot.id}
        spotName={spot.name}
      />
      <div className="b-spot-card-body">
        <p className="b-kicker">
          {spot.category || spot.city || "Backyrd Spot"}
        </p>
        <h3 className="b-card-title" style={{ marginTop: 7 }}>
          {spot.name}
        </h3>
        <div className="b-spot-card-meta">
          <span className="b-meta">{spot.address || spot.city || "Basel"}</span>
          {typeof spot.reviews === "number" ? (
            <span className="b-meta">{spot.reviews} Momente</span>
          ) : null}
        </div>
        {spot.moods?.length ? (
          <div className="b-spot-card-moods">
            {spot.moods.slice(0, 3).map((mood) => (
              <span className="b-chip" key={mood}>
                {mood}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
