import { create } from "zustand";
import { supabase } from "./supabase";

type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  category_id?: string | null;
  header_photo_url?: string | null;
  categories?: { name?: string | null; color?: string | null } | null;
};

type State = {
  spots: Spot[];
  loading: boolean;
  refresh: () => Promise<void>;
};

export const useSpotsStore = create<State>((set, get) => ({
  spots: [],
  loading: true,

  refresh: async () => {
    set({ loading: true });

    // 1️⃣ Hauptabfrage mit Kategorie + Foto-Join
    const { data, error } = await supabase
      .from("spots")
      .select(
        `
        id,
        name,
        lat,
        lng,
        address,
        category_id,
        categories ( name, color ),
        spot_photos ( url )
        `
      )
      .limit(2000);

    if (error) {
      console.error("❌ Error loading spots:", error);
      set({ loading: false });
      return;
    }

    // 2️⃣ Mappen & sicherstellen, dass URLs und Koordinaten passen
    const mapped =
      data?.map((s: any) => ({
        ...s,
        lat: Number(s.lat),
        lng: Number(s.lng),
        header_photo_url: Array.isArray(s.spot_photos)
          ? s.spot_photos[0]?.url || null
          : s.spot_photos?.url || null,
      })) ?? [];

    set({ spots: mapped, loading: false });
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
      get().refresh();
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
      get().refresh();
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
      get().refresh();
    }
  )
  .subscribe();
