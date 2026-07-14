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
      subtitle="Bearbeite Basisdaten und Backyrd Intelligence. Je besser die Daten, desto besser kann Backyrd deinen Spot passend empfehlen."
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
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
          <h2 className="text-2xl font-semibold">Noch keine Spots verbunden</h2>
          <p className="mt-3 max-w-2xl leading-7 text-white/55">
            Für Sprint 1A ist die Ownership simpel: Ein Spot erscheint hier, wenn
            <code className="mx-1 text-white/80">spots.owner_id</code>
            deiner Supabase User-ID entspricht. Claim Flow und Teamrollen bauen wir später.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {spots.map((spot) => (
            <OwnerSpotCard key={spot.spot_id} spot={spot} />
          ))}
        </div>
      )}
    </OwnerShell>
  );
}
