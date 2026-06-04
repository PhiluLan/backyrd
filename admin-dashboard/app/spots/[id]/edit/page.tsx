//admin-dashboard/app/spots/[id]/edit/page.tsx

"use client";

import React, { useEffect, useState } from "react";
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

  // 👇 FIX FÜR NEXT.JS 15 PARAMS
  const { id: spotId } = React.use(params);

  const [spot, setSpot] = useState<Spot | null>(null);
  const [openingHours, setOpeningHours] = useState<OpeningHourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* -------------------------------------------------
     Spot + Öffnungszeiten laden
  -------------------------------------------------- */
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
        setError(err.message ?? "Fehler beim Laden.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [spotId]);

  /* -------------------------------------------------
     Spot löschen
  -------------------------------------------------- */
  async function handleDelete() {
    if (!window.confirm("Diesen Spot inklusive Fotos löschen?")) return;

    setDeleting(true);
    setError(null);

    try {
      // Lade Fotos
      const { data: photos } = await supabase
        .from("spot_photos")
        .select("url")
        .eq("spot_id", spotId);

      const toDelete: string[] = [];

      (photos ?? []).forEach((p) => {
        const path = storagePathFromPublicUrl(p.url);
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

      const { error: delErr } = await supabase
        .from("spots")
        .delete()
        .eq("id", spotId);

      if (delErr) throw delErr;

      router.push("/spots");
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Fehler beim Löschen.");
    } finally {
      setDeleting(false);
    }
  }

  /* -------------------------------------------------
     Render
  -------------------------------------------------- */
  if (loading)
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--muted)" }}>Lade Spot…</p>
      </div>
    );

  if (!spot)
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--muted)" }}>Spot nicht gefunden.</p>
        {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      </div>
    );

  return (
    <>
      <div className="edit-page">
        <div className="edit-header">
          <div>
            <h1 className="edit-title">Spot bearbeiten</h1>
            <p className="edit-subtitle">
              Ändere alle Angaben, Fotos und Öffnungszeiten.
            </p>
          </div>

          <button
            type="button"
            className="btn-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Lösche…" : "Spot löschen"}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <SpotForm
          mode="edit"
          spotId={spotId}
          initialValues={{
            ...spot,
            opening_hours: openingHours,
          }}
        />
      </div>

      <style jsx>{`
        .edit-page {
          padding: 2rem;
          max-width: 960px;
        }

        .edit-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .edit-title {
          font-size: 1.6rem;
          font-weight: 600;
        }

        .edit-subtitle {
          color: var(--muted);
          font-size: 0.9rem;
        }

        .btn-danger {
          background: #b91c1c;
          color: #fff;
          padding: 0.6rem 1rem;
          border-radius: 8px;
          border: none;
          font-weight: 600;
        }

        .btn-danger:disabled {
          opacity: 0.6;
        }

        .error {
          color: #ff6b6b;
        }
      `}</style>
    </>
  );
}
