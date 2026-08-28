"use client";

import { useState, type ReactNode } from "react";

type Props = {
  spotId: string;
  spotName: string;
  ownerAdminImageUrl?: string | null;
  className?: string;
  children?: ReactNode;
  attributionMode?: "full" | "thumbnail";
};

/** Public Web security boundary: curated Owner/Admin image, then local Backyrd artwork. */
export function CanonicalSpotImage({
  spotName,
  ownerAdminImageUrl,
  className = "",
  children,
}: Props) {
  const [failed, setFailed] = useState(false);
  const image =
    ownerAdminImageUrl?.trim() && !failed ? ownerAdminImageUrl.trim() : null;
  return (
    <div className={`b-spot-image ${children ? "b-spot-image-has-content" : ""} ${className}`}>
      {image ? (
        <img
          src={image}
          alt={spotName}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="b-spot-fallback"
          role="img"
          aria-label={`Backyrd Bild für ${spotName}`}
        >
          <strong>{spotName}</strong>
        </div>
      )}
      {children}
    </div>
  );
}
