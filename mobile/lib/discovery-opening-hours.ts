import { getMobileSpotProductProfile, spotProductOpeningHours } from "./spot-product-profile";
import { spotOpeningStatusNow, type SpotHoursRow, type SpotOpeningStatus } from "./spot-opening-status";
import { withRequestDeadline } from "./requestDeadline";

type HoursPlace = { id: string; hours: SpotHoursRow[] };

/** Same public projection and missing-day semantics as Place Detail. Enrich only
 * displayed places, deduplicate rails and never block discovery on these RPCs. */
export type OpeningSchedule = { rows: SpotHoursRow[]; missingDayIsUnknown: boolean };
export async function loadDiscoveryOpeningSchedules(places: readonly HoursPlace[]): Promise<Record<string, OpeningSchedule>> {
  const unique = [...new Map(places.map(place => [place.id, place])).values()];
  const schedules: Record<string, OpeningSchedule> = {};
  let next = 0;
  await withRequestDeadline(async signal => {
    await Promise.all(Array.from({ length: Math.min(4, unique.length) }, async () => {
      while (!signal.aborted) {
        const place = unique[next++];
        if (!place) return;
        let schedule: OpeningSchedule = { rows: [], missingDayIsUnknown: true };
        try {
          const profile = await getMobileSpotProductProfile(place.id, signal);
          if (profile?.spot.spotId === place.id) {
            const canonical = Boolean(profile.worldManifestHash);
            const rows = canonical ? spotProductOpeningHours(profile) : place.hours;
            schedule = { rows, missingDayIsUnknown: canonical };
          }
        } catch { /* Never replace failed or unknown canonical hours with stale legacy facts. */ }
        if (!signal.aborted) schedules[place.id] = schedule;
      }
    }));
  }, 8_000).catch(() => undefined);
  return { ...schedules };
}

export async function loadDiscoveryOpeningStatuses(places: readonly HoursPlace[], now = new Date()): Promise<Record<string, SpotOpeningStatus>> {
  const schedules = await loadDiscoveryOpeningSchedules(places);
  return Object.fromEntries(Object.entries(schedules).map(([id, schedule]) => [id, spotOpeningStatusNow(schedule.rows, now, schedule.missingDayIsUnknown)]));
}
