import Link from "next/link";
import type { OwnerSpotListItem } from "@/lib/owner-api";

function statusLabel(status: string | null): string {
  if (status === "approved") return "Öffentlich";
  if (status === "pending") return "In Prüfung";
  if (status === "archived") return "Archiviert";
  if (status === "rejected") return "Nicht veröffentlicht";
  return "Status offen";
}

export function OwnerSpotCard({ spot }: { spot: OwnerSpotListItem }) {
  return (
    <Link href={`/owner/spots/${spot.spot_id}`} className="owner-spot-card" aria-label={`${spot.name} ansehen`}>
      <div className="owner-spot-card-top">
        <div>
          <div className="owner-spot-category">{spot.category_name ?? "DEIN ORT"}</div>
          <h2>{spot.name}</h2>
          <p>{[spot.address, spot.city].filter(Boolean).join(" · ") || "Adresse noch offen"}</p>
        </div>
        <span className={`owner-status ${spot.status === "approved" ? "owner-status-approved" : ""}`}>{statusLabel(spot.status)}</span>
      </div>
      <div className="owner-spot-card-footer">
        <span>{spot.website ? "Website hinterlegt" : "Website ergänzen"}</span>
        <strong>Details ansehen ↗</strong>
      </div>
    </Link>
  );
}
