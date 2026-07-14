import Link from "next/link";
import type { OwnerSpotListItem } from "@/lib/owner-api";

function priceLabel(level: number | null) {
  if (!level) return "Offen";
  return "CHF ".repeat(Math.max(1, Math.min(level, 4))).trim();
}

export function OwnerSpotCard({ spot }: { spot: OwnerSpotListItem }) {
  const qualityPct = Math.max(0, Math.min(100, Math.round(Number(spot.quality_score ?? 0) * 100)));
  return (
    <Link href={`/owner/spots/${spot.spot_id}`} className="owner-spot-card">
      <div className="owner-spot-card-top">
        <div>
          <div className="owner-spot-category">{spot.category_name ?? "Spot"}</div>
          <h2>{spot.name}</h2>
          <p>{[spot.address, spot.city].filter(Boolean).join(" · ") || "Adresse offen"}</p>
        </div>
        <span className={`owner-status owner-status-${spot.status ?? "pending"}`}>{spot.status ?? "pending"}</span>
      </div>
      <div className="owner-spot-stats">
        <div><span>Qualität</span><strong>{qualityPct}%</strong></div>
        <div><span>Content</span><strong>{spot.content_status ?? "draft"}</strong></div>
        <div><span>Preis</span><strong>{priceLabel(spot.price_level)}</strong></div>
      </div>
      <div className="owner-progress"><span style={{ width: `${qualityPct}%` }} /></div>
      <div className="owner-spot-card-footer">
        <span>{spot.website ? "Website gepflegt" : "Website fehlt"}</span>
        <strong>Öffnen →</strong>
      </div>
    </Link>
  );
}
