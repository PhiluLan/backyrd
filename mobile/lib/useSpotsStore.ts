import type { SpotHoursRow } from "./spot-opening-status";
import { create } from "zustand";
import { supabase } from "./supabase";
import { filterDistributedSpots } from "./distributionTrust";
import { selectSpotImageUrl } from "./spot-images";
import { withRequestDeadline } from "./requestDeadline";

type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  city?: string | null;
  category_id?: string | null;
  header_photo_url?: string | null;
  spot_hours?: SpotHoursRow[];
  categories?: { name?: string | null; color?: string | null } | null;
};

type State = {
  spots: Spot[];
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
};

let latestRefresh = 0;
const MAP_PAGE_SIZE = 500;

export const useSpotsStore = create<State>((set) => ({
  spots: [],
  loading: true,
  error: false,

  refresh: async () => {
    const refreshId = ++latestRefresh;
    set({ loading: true, error: false });

    try {
      const visible = await withRequestDeadline(async (signal) => {
        const mapped: Spot[] = [];
        let afterId: string | undefined;
        while (!signal.aborted) {
          const query = supabase
            .from("spots")
            .select(`
              id,
              name,
              lat,
              lng,
              address,

              city,
              category_id,
              header_photo_path,
              categories ( name, color ),
              spot_hours ( day_of_week, open_time, close_time )
            `)
            .eq("status", "approved")
            .order("id")
            .limit(MAP_PAGE_SIZE)
            .abortSignal(signal);
          const { data, error } = await (afterId ? query.gt("id", afterId) : query);
          if (error) throw error;
          const page = data ?? [];
          mapped.push(...page.map(spot => ({
            ...spot,
            lat: spot.lat == null ? Number.NaN : Number(spot.lat),
            lng: spot.lng == null ? Number.NaN : Number(spot.lng),
            categories: Array.isArray(spot.categories) ? spot.categories[0] ?? null : spot.categories,
            header_photo_url: selectSpotImageUrl({ headerPhotoPath: spot.header_photo_path }),
          })));
          if (page.length < MAP_PAGE_SIZE) break;
          afterId = page[page.length - 1].id;
        }
        if (signal.aborted) throw new Error("map_catalog_aborted");
        return filterDistributedSpots(mapped, "maps", signal);
      }, 12_000);
      if (refreshId === latestRefresh) set({ spots: visible, loading: false, error: false });
    } catch (loadError) {
      console.error("Spot catalog loading failed", loadError);
      if (refreshId === latestRefresh) set({ spots: [], loading: false, error: true });
    }
  },
}));

// 3️⃣ Supabase Realtime-Listener
supabase
  .channel("spots-live")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "spots" },
    () => {
      console.log("♻️ Spots geändert — reload...");
      void useSpotsStore.getState().refresh();
    }
  )
  .subscribe();

supabase
  .channel("spot-photos-live")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "spot_photos" },
    () => {
      console.log("📸 Foto geändert — reload...");
      void useSpotsStore.getState().refresh();
    }
  )
  .subscribe();

supabase
  .channel("categories-live")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "categories" },
    () => {
      console.log("🎨 Kategorien geändert — reload...");
      void useSpotsStore.getState().refresh();
    }
  )
  .subscribe();
