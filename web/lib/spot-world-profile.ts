export type PublicWorldSpotProfile = {
  contractVersion: "backyrd.spot-detail-product-profile@1.0";
  surface: "WEB";
  worldManifestHash: string | null;
  spot: {
    spotId: string;
    name: string;
    addressLine1: string | null;
    locality: string | null;
    countryCode: string | null;
    latitude: number | null;
    longitude: number | null;
    regularHours: unknown;
    source: "WORLD_KNOWLEDGE" | "LEGACY_COMPATIBILITY";
    headerPhotoPath: string | null;
  };
  fields: Array<{ attributeKey:string; sectionKey:string; sortOrder:number; scope:string; knowledgeState:string; value:unknown; trust:string; freshness:string }>;
};

const dayNames: Record<string,string> = {
  MONDAY:"Montag",TUESDAY:"Dienstag",WEDNESDAY:"Mittwoch",THURSDAY:"Donnerstag",
  FRIDAY:"Freitag",SATURDAY:"Samstag",SUNDAY:"Sonntag",
};

function canonicalHours(value: unknown) {
  if (!Array.isArray(value)) return [];
  const rows: Array<{day_of_week:string;open_time:string;close_time:string;idx:number}> = [];
  for (const day of value) {
    if (!day || typeof day !== "object") continue;
    const record = day as {day?:unknown;intervals?:unknown};
    const label = typeof record.day === "string" ? dayNames[record.day] : undefined;
    if (!label || !Array.isArray(record.intervals)) continue;
    for (const interval of record.intervals) {
      if (!interval || typeof interval !== "object") continue;
      const window = interval as {start?:unknown;end?:unknown};
      if (typeof window.start !== "string" || typeof window.end !== "string") continue;
      rows.push({day_of_week:label,open_time:window.start,close_time:window.end,idx:rows.length});
    }
  }
  return rows;
}

export function applyCanonicalWorldSpot<S extends object, T extends {
  spot: S;
  opening_hours: unknown[];
}>(detail: T, profile: PublicWorldSpotProfile | null): T {
  if (!profile?.worldManifestHash || profile.spot.source !== "WORLD_KNOWLEDGE") return detail;
  const legacySpot = detail.spot as S & {header_photo_path?:unknown};
  return {
    ...detail,
    spot: {
      ...legacySpot,
      name: profile.spot.name,
      address: profile.spot.addressLine1,
      city: profile.spot.locality,
      country: profile.spot.countryCode,
      lat: profile.spot.latitude,
      lng: profile.spot.longitude,
      header_photo_path: profile.spot.headerPhotoPath ?? legacySpot.header_photo_path ?? null,
    },
    opening_hours: canonicalHours(profile.spot.regularHours),
  };
}
