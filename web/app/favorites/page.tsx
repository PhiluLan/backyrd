"use client";
import { useCallback, useEffect, useState } from "react";
import { ConsumerSpotCard } from "@/components/consumer/spot-card";
import { StateView } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
type Favorite = {
  spot_id: string;
  spots: {
    id: string;
    name: string;
    city: string | null;
    address: string | null;
    header_photo_path: string | null;
    categories: { name: string } | null;
  } | null;
};
export default function FavoritesPage() {
  const [rows, setRows] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setError(true);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("favorites")
      .select(
        "spot_id,spots(id,name,city,address,header_photo_path,categories(name))",
      )
      .eq("user_id", user.user.id);
    setError(Boolean(error));
    setRows((data ?? []) as unknown as Favorite[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="b-container b-main">
      <p className="b-kicker">Deine Orte</p>
      <h1 className="b-display b-page-title" style={{ marginTop: 10 }}>
        GESPEICHERT
      </h1>
      <div className="b-marker" />
      {loading ? (
        <div className="b-skeleton" style={{ height: 420, borderRadius: 22 }} />
      ) : error ? (
        <StateView
          title="Gespeicherte Orte nicht geladen"
          message="Melde dich an oder versuch es gleich nochmals."
        />
      ) : rows.length ? (
        <div className="b-grid b-grid-4">
          {rows.map((item) =>
            item.spots ? (
              <ConsumerSpotCard
                key={item.spot_id}
                spot={{
                  id: item.spots.id,
                  name: item.spots.name,
                  city: item.spots.city,
                  address: item.spots.address,
                  category: item.spots.categories?.name,
                  image: item.spots.header_photo_path,
                }}
              />
            ) : null,
          )}
        </div>
      ) : (
        <StateView
          title="Noch nichts gespeichert"
          message="Deine Lieblingsorte warten in Orte und Für jetzt."
          actionLabel="Orte entdecken"
          onAction={() => location.assign("/places")}
        />
      )}
    </div>
  );
}
