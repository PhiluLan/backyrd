import { create } from "zustand";
import { supabase } from "./supabase";
import { filterDistributedSpots } from "./distributionTrust";
import { selectSpotImageUrl } from "./spot-images";

type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  city?: string | null;
  category_id?: string | null;
  header_photo_url?: string | null;
  categories?: { name?: string | null; color?: string | null } | null;
};

type State = {
  spots: Spot[];
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
};

let latestRefresh = 0;

export const useSpotsStore = create<State>((set) => ({
  spots: [],
  loading: true,
  error: false,

  refresh: async () => {
    const refreshId = ++latestRefresh;
    set({ loading: true, error: false });

    try {
      const { data, error } = await supabase
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
        spot_photos ( url )
        `)
        .eq("status", "approved")
        .limit(2000);

      if (error) throw error;

      const mapped = (data ?? []).map((s) => ({
        ...s,
        lat: Number(s.lat),
        lng: Number(s.lng),
        categories: Array.isArray(s.categories) ? s.categories[0] ?? null : null,
        header_photo_url: selectSpotImageUrl({
          photoUrl: s.spot_photos[0]?.url || null,
          headerPhotoPath: s.header_photo_path,
        }),
      }));
      const visible = await filterDistributedSpots(mapped, "maps");
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
