"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase/client";

type PublicPhoto = {
  source: "google" | "backyrd" | "placeholder";
  imageUrl: string | null;
  authorAttributions?: Array<{ displayName?: string; uri?: string; photoUri?: string }>;
  googleMapsUri?: string | null;
};

const requests = new Map<string, Promise<PublicPhoto>>();

function fallback(): PublicPhoto {
  return { source: "placeholder", imageUrl: null };
}

async function resolvePublicGooglePhoto(spotId: string, preferredOwnerImageFailed = false) {
  const key = `${spotId}:${preferredOwnerImageFailed ? "owner-failed" : "missing-owner"}`;
  const current = requests.get(key);
  if (current) return current;
  const request = supabase.functions
    .invoke<PublicPhoto>("public-spot-photo", { body: { spotId, preferredOwnerImageFailed } })
    .then(({ data, error }) => (!error && data?.source === "google" && data.imageUrl ? data : fallback()))
    .catch(() => fallback());
  requests.set(key, request);
  return request;
}

type Props = {
  spotId: string;
  spotName: string;
  ownerAdminImageUrl?: string | null;
  className?: string;
  children?: ReactNode;
  attributionMode?: "full" | "thumbnail";
};

/** Public-Web rendering boundary for the same Owner/Admin → Google → Backyrd contract as Mobile. */
export function CanonicalSpotImage({ spotId, spotName, ownerAdminImageUrl, className, children, attributionMode = "full" }: Props) {
  return (
    <CanonicalSpotImageInstance
      key={`${spotId}:${ownerAdminImageUrl ?? "none"}`}
      attributionMode={attributionMode}
      className={className}
      ownerAdminImageUrl={ownerAdminImageUrl}
      spotId={spotId}
      spotName={spotName}
    >
      {children}
    </CanonicalSpotImageInstance>
  );
}

function CanonicalSpotImageInstance({ spotId, spotName, ownerAdminImageUrl, className, children, attributionMode = "full" }: Props) {
  const [ownerFailed, setOwnerFailed] = useState(false);
  const [google, setGoogle] = useState<PublicPhoto | null>(null);
  const [resolved, setResolved] = useState(Boolean(ownerAdminImageUrl));
  const owner = ownerFailed ? null : ownerAdminImageUrl?.trim() || null;

  useEffect(() => {
    if (!ownerAdminImageUrl) {
      void resolvePublicGooglePhoto(spotId).then((result) => {
        setGoogle(result.source === "google" ? result : null);
        setResolved(true);
      });
    }
  }, [ownerAdminImageUrl, spotId]);

  useEffect(() => {
    if (!ownerFailed) return;
    void resolvePublicGooglePhoto(spotId, true).then((result) => {
      setGoogle(result.source === "google" ? result : null);
      setResolved(true);
    });
  }, [ownerFailed, spotId]);

  const imageUrl = owner ?? google?.imageUrl ?? null;
  const backgroundImage = useMemo(
    () => imageUrl ? `linear-gradient(180deg, rgba(7,7,8,.06), rgba(7,7,8,.78)), url("${imageUrl}")` : undefined,
    [imageUrl],
  );

  return (
    <div
      aria-busy={!resolved}
      className={className}
      style={{ position: "relative", backgroundImage, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      {imageUrl ? <img alt="" aria-hidden="true" onError={() => { if (owner) setOwnerFailed(true); else setGoogle(null); }} src={imageUrl} style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} /> : null}
      {children}
      {google?.imageUrl && attributionMode === "full" ? (
        <a
          aria-label="Fotoquelle bei Google Maps öffnen"
          href={google.googleMapsUri || undefined}
          rel="noreferrer"
          target="_blank"
          style={{ position: "absolute", left: 8, bottom: 8, maxWidth: "88%", borderRadius: 999, background: "rgba(7,7,8,.72)", color: "rgba(255,255,255,.92)", padding: "4px 7px", fontSize: 9, lineHeight: 1.2 }}
        >
          {google.authorAttributions?.[0]?.displayName ? `Foto: ${google.authorAttributions[0].displayName} · Google Maps` : "Foto · Google Maps"}
        </a>
      ) : null}
      {!imageUrl && resolved ? <span aria-label={`Kein Foto für ${spotName}`} /> : null}
    </div>
  );
}
