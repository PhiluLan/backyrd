// admin-dashboard/app/spots/[id]/edit/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Spot } from "@/types/spots";
import { SpotForm } from "../../SpotForm";
import { sessionRecoveringAuthoringClient, WorldProductCorrection, preparePublicDiscovery } from "@backyrd/world-knowledge-authoring-ui";
import type { ProductAdminSpotSearch } from "@backyrd/world-knowledge-authoring-ui";
import "@backyrd/world-knowledge-authoring-ui/styles.css";
import { authorizedWorldKnowledgePost, authorizedWorldKnowledgeSpotSearch } from "@/lib/worldKnowledgeSession";
import { WorldAddressPicker } from "../../../world-knowledge/WorldAddressPicker";

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

const worldAuthoringClient = sessionRecoveringAuthoringClient(supabase, supabase.auth);

export default function EditSpotPage({ params }: EditSpotPageProps) {
  const router = useRouter();
  const { id: spotId } = React.use(params);

  const [editorView,setEditorView]=useState<"profile"|"media">("profile");
  const [spot, setSpot] = useState<Spot | null>(null);
  const [openingHours, setOpeningHours] = useState<OpeningHourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [archiveConfirmation, setArchiveConfirmation] = useState(false);
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
      router.push("/spots?status=archived&archiviert=1");
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
          <div className="spot-editor-eyebrow">Spot bearbeiten</div>
          <h1>{spot.name || "Spot bearbeiten"}</h1>

        </div>

        <div className="spot-editor-actions">
          <Link href={`/spots/${spotId}`} className="spot-editor-back">
            <span>←</span>
            Spot-Detail
          </Link>
          <button
            type="button"
            className="spot-editor-delete"
            hidden={editorView!=="media"}
            onClick={() => setArchiveConfirmation(true)}
            disabled={deleting}
          >
            {deleting ? "Wird archiviert …" : "Spot archivieren"}
          </button>
        </div>
      </header>

      <div className="spot-editor-meta">
        <span className={`spot-status spot-status-${spot.status ?? "pending"}`}>
          {({approved:"Veröffentlicht",pending:"In Prüfung",rejected:"Abgelehnt",hidden:"Ausgeblendet",archived:"Archiviert"} as Record<string,string>)[spot.status??"pending"]??spot.status}
        </span>

      </div>

      <nav className="spot-editor-tabs" aria-label="Spot-Bereiche">
        <button type="button" aria-pressed={editorView==="profile"} onClick={()=>setEditorView("profile")}>Profil & Angebote</button>
        <button type="button" aria-pressed={editorView==="media"} onClick={()=>setEditorView("media")}>Bilder & Verwaltung</button>
        <details className="spot-editor-more"><summary>Weitere Aktionen</summary><div><Link href="/spots/presentation">App-Darstellung verwalten</Link><Link href={`/spots/${spotId}`}>Spot-Übersicht öffnen</Link><Link href={`/spots/${spotId}/owner`}>Owner-Zugang verwalten</Link></div></details>
      </nav>

      {error ? <div className="by-alert by-alertError">{error}</div> : null}

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

      <div id="spot-understanding" className="spot-editor-anchor" hidden={editorView!=="profile"}>
        <WorldProductCorrection
          initialSpotId={spotId}
          client={worldAuthoringClient}
          prepareDiscovery={async(id,text)=>{const {data}=await supabase.auth.getSession();if(!data.session?.access_token)throw new Error("authentication_required");return preparePublicDiscovery(worldAuthoringClient,data.session.access_token,id,text,(spotId,idempotencyKey)=>authorizedWorldKnowledgePost({auth:supabase.auth,body:{action:"product-rebuild",spotId,idempotencyKey}}));}}
          search={(query) => authorizedWorldKnowledgeSpotSearch({ auth: supabase.auth, query }) as Promise<ProductAdminSpotSearch>}
          addressPicker={WorldAddressPicker}
          rebuild={(id, idempotencyKey) => authorizedWorldKnowledgePost({ auth: supabase.auth, body: { action: "product-rebuild", spotId: id, idempotencyKey } })}
        />
      </div>
      <div id="spot-information" className="spot-editor-anchor" hidden={editorView!=="media"}><SpotForm
        mode="edit"
        spotId={spotId}
        initialValues={{
          ...spot,
          opening_hours: openingHours,
        }}
        canonicalKnowledgeManaged
        onSaved={() => router.refresh()}
      /></div>
    </div>
  );
}
