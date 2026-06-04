"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Spot } from "@/types/spots";
import { SpotForm } from "../SpotForm";

export default function EditSpotPage() {
  const params = useParams<{ id: string }>();
  const spotId = params?.id;

  const [spot, setSpot] = useState<Spot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spotId) return;
    void loadSpot(spotId as string);
  }, [spotId]);

  async function loadSpot(id: string) {
    setLoading(true);

    const { data: spot, error: spotErr } = await supabase
      .from("spots")
      .select("*")
      .eq("id", id)
      .single();

    if (spotErr || !spot) {
      console.error("Fehler beim Laden des Spots:", spotErr);
      setSpot(null);
      setLoading(false);
      return;
    }

    const { data: hours, error: hoursErr } = await supabase
      .from("spot_hours")
      .select("day_of_week, open_time, close_time")
      .eq("spot_id", id)
      .order("idx", { ascending: true });

    if (hoursErr) {
      console.warn("spot_hours konnte nicht geladen werden:", hoursErr);
    }

    setSpot({
      ...(spot as Spot),
      // @ts-ignore
      opening_hours: hours ?? [],
    } as any);

    setLoading(false);
  }

  if (!spotId) {
    return (
      <div className="by-page">
        <div className="by-card by-section">
          <div className="by-muted by-small">Kein Spot ID in URL.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="by-page">
      <div className="by-header">
        <div>
          <h1 className="by-title">Spot bearbeiten</h1>
          <div className="by-subtitle">
            ID: <span className="by-mono">{spotId}</span>
          </div>
        </div>

        <div className="by-toolbar">
          <Link href={`/spots/${spotId}/moods`} className="by-btn by-btn-soft">
            🧠 Moods
          </Link>

          <Link href={`/spots/${spotId}/owner`} className="by-btn by-btn-soft">
            👤 Owner
          </Link>

          <Link href="/spots" className="by-btn by-btn-soft">
            Zurück
          </Link>
        </div>
      </div>

      <div className="by-card by-section">
        {loading ? (
          <div className="by-muted by-small">Lade Spot…</div>
        ) : !spot ? (
          <div className="by-muted by-small">Spot nicht gefunden.</div>
        ) : (
          <SpotForm
            mode="edit"
            spotId={spotId as string}
            initialValues={{
              name: spot.name,
              address: spot.address,
              city: spot.city,
              country: spot.country,
              lat: spot.lat,
              lng: spot.lng,
              category_id: spot.category_id,
              price_level: spot.price_level,
              website: spot.website,
              phone: spot.phone,
              email: spot.email,
              header_photo_path: spot.header_photo_path,
              status: spot.status,
              // @ts-ignore
              opening_hours: (spot as any).opening_hours ?? [],
            }}
            onSaved={() => {
              // optional: reload after save
              // void loadSpot(spotId as string);
            }}
          />
        )}
      </div>
    </div>
  );
}
