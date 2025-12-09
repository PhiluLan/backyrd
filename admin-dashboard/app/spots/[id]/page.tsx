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
    loadSpot(spotId as string);
  }, [spotId]);

  async function loadSpot(id: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("spots")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Fehler beim Laden des Spots:", error);
      setSpot(null);
    } else {
      setSpot(data as Spot);
    }
    setLoading(false);
  }

  if (!spotId) {
    return <p className="p-6 text-sm text-red-600">Kein Spot ID in URL.</p>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Spot bearbeiten
          </h1>
          <p className="text-sm text-gray-500">
            ID: <span className="font-mono text-xs">{spotId}</span>
          </p>
        </div>
        <Link
          href="/spots"
          className="text-sm text-gray-500 hover:underline"
        >
          Zurück zur Übersicht
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Lade Spot…</p>
      ) : !spot ? (
        <p className="text-sm text-red-600">Spot nicht gefunden.</p>
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
          }}
          onSaved={() => {
            // optional: Toast / Reload
          }}
        />
      )}
    </div>
  );
}
