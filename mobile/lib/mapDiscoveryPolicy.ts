export type MapZoomBucket = "city" | "district" | "neighborhood" | "street";

export type MapClusterPolicy = {
  enabled: boolean;
  radius: number;
  minPoints: number;
};

export function resolveMapZoomBucket(
  latitudeDelta: number,
  previous: MapZoomBucket = "city",
): MapZoomBucket {
  if (previous === "city") return latitudeDelta < 0.055 ? "district" : "city";
  if (previous === "district") {
    if (latitudeDelta >= 0.07) return "city";
    if (latitudeDelta < 0.02) return "neighborhood";
    return "district";
  }
  if (previous === "neighborhood") {
    if (latitudeDelta >= 0.028) return "district";
    if (latitudeDelta < 0.007) return "street";
    return "neighborhood";
  }
  return latitudeDelta >= 0.01 ? "neighborhood" : "street";
}

export function clusterPolicyFor(bucket: MapZoomBucket): MapClusterPolicy {
  switch (bucket) {
    case "city": return { enabled: true, radius: 104, minPoints: 2 };
    case "district": return { enabled: true, radius: 76, minPoints: 2 };
    case "neighborhood": return { enabled: true, radius: 56, minPoints: 2 };
    case "street": return { enabled: false, radius: 0, minPoints: 2 };
  }
}
