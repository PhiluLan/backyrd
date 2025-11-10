export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371; // Erd-Radius (km)

  const dLat = deg2rad(b.latitude - a.latitude);
  const dLng = deg2rad(b.longitude - a.longitude);

  const lat1 = deg2rad(a.latitude);
  const lat2 = deg2rad(b.latitude);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}
