// admin-dashboard/app/spots/[id]/edit/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Spot } from "@/types/spots";
import { SpotForm } from "../../SpotForm";

type EditSpotPageProps = {
  params: Promise<{ id: string }>;
};

interface OpeningHourRow {
  id: string;
  spot_id: string;
  day_of_week: string;
  open_time: string | null;
  close_time: string | null;
  idx: number;
}

function storagePathFromPublicUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const marker = "/spot-photos/";
    const pos = u.pathname.indexOf(marker);
    if (pos === -1) return null;
    return u.pathname.substring(pos + marker.length);
  } catch {
    return null;
  }
}

export default function EditSpotPage({ params }: EditSpotPageProps) {
  const router = useRouter();
  const { id: spotId } = React.use(params);

  const [spot, setSpot] = useState<Spot | null>(null);
  const [openingHours, setOpeningHours] = useState<OpeningHourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data: spotData, error: spotError } = await supabase
          .from("spots")
          .select("*")
          .eq("id", spotId)
          .single();

        if (spotError || !spotData) throw spotError;

        const { data: hoursData, error: hoursError } = await supabase
          .from("spot_hours")
          .select("*")
          .eq("spot_id", spotId)
          .order("idx");

        if (hoursError) throw hoursError;

        setSpot(spotData as Spot);
        setOpeningHours((hoursData ?? []) as OpeningHourRow[]);
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? "Fehler beim Laden.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [spotId]);

  async function handleDelete() {
    if (!window.confirm("Diesen Spot inklusive Fotos endgültig löschen?")) return;

    setDeleting(true);
    setError(null);

    try {
      const { data: photos } = await supabase
        .from("spot_photos")
        .select("url")
        .eq("spot_id", spotId);

      const toDelete: string[] = [];

      (photos ?? []).forEach((photo) => {
        const path = storagePathFromPublicUrl(photo.url);
        if (path) toDelete.push(path);
      });

      if (spot?.header_photo_path?.startsWith("http")) {
        const header = storagePathFromPublicUrl(spot.header_photo_path);
        if (header) toDelete.push(header);
      }

      if (toDelete.length > 0) {
        await supabase.storage.from("spot-photos").remove(toDelete);
      }

      await supabase.from("spot_photos").delete().eq("spot_id", spotId);
      await supabase.from("spot_hours").delete().eq("spot_id", spotId);

      const { error: deleteError } = await supabase
        .from("spots")
        .delete()
        .eq("id", spotId);

      if (deleteError) throw deleteError;
      router.push("/spots");
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Fehler beim Löschen.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="spot-editor-page">
        <div className="spot-editor-loading">
          <span className="spot-editor-spinner" />
          Spot wird geladen …
        </div>
      </div>
    );
  }

  if (!spot) {
    return (
      <div className="spot-editor-page">
        <div className="spot-editor-empty">
          <strong>Spot nicht gefunden</strong>
          <span>{error ?? "Der Datensatz ist nicht mehr verfügbar."}</span>
          <Link href="/spots">Zur Spot-Übersicht</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="spot-editor-page">
      <header className="spot-editor-hero">
        <div>
          <div className="spot-editor-eyebrow">Spot Management</div>
          <h1>{spot.name || "Spot bearbeiten"}</h1>
          <p>Stammdaten, Intelligence, Fotos und Öffnungszeiten aktualisieren.</p>
        </div>

        <div className="spot-editor-actions">
          <Link href={`/spots/${spotId}`} className="spot-editor-back">
            <span>←</span>
            Spot-Detail
          </Link>
          <button
            type="button"
            className="spot-editor-delete"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Wird gelöscht …" : "Spot löschen"}
          </button>
        </div>
      </header>

      <div className="spot-editor-meta">
        <span className={`spot-status spot-status-${spot.status ?? "pending"}`}>
          {spot.status ?? "pending"}
        </span>
        <code>{spotId}</code>
      </div>

      {error ? <div className="by-alert by-alertError">{error}</div> : null}

      <SpotForm
        mode="edit"
        spotId={spotId}
        initialValues={{
          ...spot,
          opening_hours: openingHours,
        }}
      />
    </div>
  );
}
