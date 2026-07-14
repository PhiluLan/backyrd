"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerSpotCard } from "@/components/owner/owner-spot-card";
import { getOwnerSpots, requireOwnerSession, type OwnerSpotListItem } from "@/lib/owner-api";

export default function OwnerHomePage() {
  const [spots, setSpots] = useState<OwnerSpotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const session = await requireOwnerSession();
        if (!session) return;
        const data = await getOwnerSpots(6);
        if (active) setSpots(data);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Owner Dashboard konnte nicht geladen werden.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <OwnerShell
      eyebrow="OWNER COCKPIT"
      title="Owner Dashboard"
      subtitle="Pflege deine Spots, verstehe ihre Performance und verbessere, wann Backyrd sie empfiehlt."
      actions={<Link href="/owner/analytics" className="owner-primary-button">Performance öffnen</Link>}
    >
      <section className="owner-briefing-card">
        <div>
          <div className="owner-briefing-label">DEIN OWNER BRIEFING</div>
          <h2>{spots.length} verbundene {spots.length === 1 ? "Location" : "Locations"}.</h2>
          <p>Dein nächster Hebel: Spot-Qualität erhöhen und echte Business-Intent-Signale beobachten.</p>
        </div>
        <div className="owner-online"><span className="owner-live-dot" /> Intelligence online</div>
      </section>

      <section className="owner-kpi-grid owner-kpi-grid-3">
        <div className="owner-kpi-card"><div className="owner-kpi-label">Verbundene Spots</div><div className="owner-kpi-value">{spots.length}</div><div className="owner-kpi-detail">offiziell deinem Account zugeordnet</div></div>
        <div className="owner-kpi-card"><div className="owner-kpi-label">Nächster Fokus</div><div className="owner-kpi-value owner-kpi-value-text">Spot Qualität</div><div className="owner-kpi-detail">bessere Daten → passendere Empfehlungen</div></div>
        <div className="owner-kpi-card"><div className="owner-kpi-label">Relevanz-Prinzip</div><div className="owner-kpi-value owner-kpi-value-text">Earned, not paid</div><div className="owner-kpi-detail">Paid kann Reichweite kaufen, nicht Relevanz</div></div>
      </section>

      <section className="owner-panel owner-section-panel">
        <div className="owner-section-heading">
          <div><div className="owner-section-kicker">SPOT MANAGEMENT</div><h2>Meine Spots</h2><p>Pflege Qualität, Content und Kontext deiner Locations.</p></div>
          <Link href="/owner/spots" className="owner-secondary-button">Alle Spots</Link>
        </div>
        {loading ? <div className="owner-empty-state">Lädt…</div> : message ? <div className="owner-error-state">{message}</div> : spots.length === 0 ? <div className="owner-empty-state">Noch keine Spots verbunden.</div> : <div className="owner-spot-grid">{spots.map((spot) => <OwnerSpotCard key={spot.spot_id} spot={spot} />)}</div>}
      </section>
    </OwnerShell>
  );
}
