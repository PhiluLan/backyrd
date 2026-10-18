import { reviewCountCopy } from "../../../packages/shared/src/presentation/mood";
import { MoodSignature } from "./mood-signature";
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
      aria-label={`${spot.name} öffnen${spot.moods?.length ? `. Moods: ${spot.moods.slice(0, 3).join(", ")}` : ""}${reviewCountCopy(spot.reviews) ? `. ${reviewCountCopy(spot.reviews)}` : ""}`}
    >
      <CanonicalSpotImage
        className="b-spot-image"
        ownerAdminImageUrl={spot.image}
        spotId={spot.id}
        spotName={spot.name}
      />
      <div className="b-spot-card-body">
        <h3 className="b-card-title">{spot.name}</h3>
        <MoodSignature labels={spot.moods ?? []} reviewCount={spot.reviews} compact />
        <p className="b-kicker">{spot.category || spot.city || "Backyrd Spot"}</p>
        <div className="b-spot-card-meta">
          <span className="b-meta">{spot.address || spot.city || "Basel"}</span>
        </div>

      </div>
    </Link>
  );
}
