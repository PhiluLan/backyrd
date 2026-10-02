"use client";

import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerSpotCard } from "@/components/owner/owner-spot-card";
import { getOwnerSpots, requireOwnerSession, type OwnerSpotListItem } from "@/lib/owner-api";

export default function OwnerSpotsPage() {
  const [spots, setSpots] = useState<OwnerSpotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setMessage(null);

        const session = await requireOwnerSession();
        if (!session) return;

        const data = await getOwnerSpots(100);

        if (!active) return;
        setSpots(data);
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Spots konnten nicht geladen werden.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <OwnerShell
      title="Meine Spots"
      subtitle="Wähle einen deiner Orte. Du kannst seine Angaben Schritt für Schritt pflegen – ohne technische Spot-ID."
    >
      {loading ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-white/55">
          Lädt…
        </div>
      ) : message ? (
        <div className="rounded-[2rem] border border-red-500/20 bg-red-500/10 p-8 text-red-100/80">
          {message}
        </div>
      ) : spots.length === 0 ? (
        <div className="owner-home-empty">
          <div className="owner-home-empty-icon" aria-hidden="true">⌖</div>
          <div><h2>Noch kein Spot verbunden.</h2><p>Du betreibst einen Ort auf backyrd? Schreib uns – wir prüfen die Zuordnung persönlich.</p></div>
          <a className="owner-secondary-button" href="mailto:hello@backyrd.ch?subject=Owner-Zugang%20f%C3%BCr%20meinen%20Spot">Zugang anfragen</a>
        </div>
      ) : (
        <div className="owner-spot-grid">
          {spots.map((spot) => (
            <OwnerSpotCard key={spot.spot_id} spot={spot} />
          ))}
        </div>
      )}
    </OwnerShell>
  );
}
