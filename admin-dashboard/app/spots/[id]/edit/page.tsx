// admin-dashboard/app/spots/[id]/edit/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Spot } from "@/types/spots";
import { SpotForm } from "../../SpotForm";
import { GoldAuthoringPanel } from "../../GoldAuthoringPanel";

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

export default function EditSpotPage({ params }: EditSpotPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id: spotId } = React.use(params);
  const returnParam = searchParams.get("returnTo");
  const returnTo = returnParam?.startsWith("/") && !returnParam.startsWith("//") ? returnParam : `/spots/${spotId}`;

  const [spot, setSpot] = useState<Spot | null>(null);
  const [openingHours, setOpeningHours] = useState<OpeningHourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [archiveConfirmation, setArchiveConfirmation] = useState(false);
  const [goldRefresh, setGoldRefresh] = useState(0);
  const [saved, setSaved] = useState(false);
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
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Fehler beim Laden.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [spotId]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const { data, error: archiveError } = await supabase.rpc("backyrd_admin_archive_spot_v1", {
        p_spot_id: spotId,
        p_request_id: crypto.randomUUID(),
      });
      if (archiveError) throw archiveError;
      if (!data || data.spotId !== spotId || data.archived !== true || data.status !== "archived") {
        throw new Error("Die Archivierung konnte nicht bestätigt werden.");
      }
      setArchiveConfirmation(false);
      router.push("/spots?archiviert=1");
      router.refresh();
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Fehler beim Archivieren.";
      setError(message.includes("admin_or_founder_required") ? "Dir fehlt die Berechtigung, diesen Spot zu archivieren." : message);
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
          <Link href={returnTo} className="spot-editor-back">
            <span>←</span>
            {returnTo.startsWith("/spot-quality") ? "Zur Qualitätsliste" : "Spot-Übersicht"}
          </Link>
          <button
            type="button"
            className="spot-editor-delete"
            onClick={() => setArchiveConfirmation(true)}
            disabled={deleting}
          >
            {deleting ? "Wird archiviert …" : "Spot archivieren"}
          </button>
        </div>
      </header>

      <div className="spot-editor-meta">
        <span className={`spot-status spot-status-${spot.status ?? "pending"}`}>
          {spot.status ?? "pending"}
        </span>
        <code>{spotId}</code>
      </div>

      <nav className="spot-editor-tabs" aria-label="Spot-Bereiche">
        <a href="#spot-information">Informationen</a>
        <a href="#spot-understanding">Backyrd versteht den Spot</a>
        <a href="#human-sources">Quellen & Prüfung</a>
        <Link href={`/spots/${spotId}`}>Übersicht</Link>
        <Link href={`/spots/${spotId}/owner`}>Owner</Link>
      </nav>

      {error ? <div className="by-alert by-alertError">{error}</div> : null}
      {saved ? <div className="admin-saveReturn" role="status"><span>Änderungen sind gespeichert und werden in der Spot-Qualität live berücksichtigt.</span><Link href={returnTo}>Zur Arbeitsliste zurück →</Link></div> : null}

      {archiveConfirmation ? (
        <div className="admin-confirmOverlay" role="presentation">
          <section className="admin-confirmDialog" role="dialog" aria-modal="true" aria-labelledby="archive-spot-title">
            <h2 id="archive-spot-title">Spot archivieren?</h2>
            <p>Der Spot verschwindet aus Backyrd und aktiven Empfehlungen. Reviews, Entscheidungen und Qualitätsdaten bleiben für die Historie erhalten.</p>
            <p>Die Daten werden nicht gelöscht. Founder/Admin können den Spot später wieder freigeben.</p>
            <div className="admin-confirmActions">
              <button type="button" className="bi-actionButton" onClick={() => setArchiveConfirmation(false)} disabled={deleting}>Abbrechen</button>
              <button type="button" className="spot-editor-delete" onClick={() => void handleDelete()} disabled={deleting}>{deleting ? "Wird archiviert …" : "Spot jetzt archivieren"}</button>
            </div>
          </section>
        </div>
      ) : null}

      <div id="spot-information" className="spot-editor-anchor"><SpotForm
        mode="edit"
        spotId={spotId}
        initialValues={{
          ...spot,
          opening_hours: openingHours,
        }}
        onSaved={() => { setGoldRefresh((value) => value + 1); setSaved(true); }}
      /></div>
      <div id="spot-understanding" className="spot-editor-anchor"><GoldAuthoringPanel spotId={spotId} refreshToken={goldRefresh} /></div>
    </div>
  );
}
