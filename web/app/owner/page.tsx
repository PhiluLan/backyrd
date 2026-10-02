"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OwnerLanding } from "@/components/owner/owner-landing";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerSpotCard } from "@/components/owner/owner-spot-card";
import { getOwnerSpots, requireOwnerSession, type OwnerSpotListItem } from "@/lib/owner-api";

type EntryState = "loading" | "guest" | "signed-in" | "error";
const ownerContact = "mailto:hello@backyrd.ch?subject=Owner-Zugang%20f%C3%BCr%20meinen%20Spot";

export default function OwnerHomePage() {
  const [spots, setSpots] = useState<OwnerSpotListItem[]>([]);
  const [state, setState] = useState<EntryState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const session = await requireOwnerSession();
        if (!active) return;
        if (!session) {
          setState("guest");
          return;
        }
        const data = await getOwnerSpots(100);
        if (active) {
          setSpots(data);
          setState("signed-in");
        }
      } catch {
        if (active) {
          setState("error");
          setMessage("Dein Owner-Bereich konnte gerade nicht geladen werden.");
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [attempt]);

  if (state === "loading") return <main className="owner-entry-loading"><div className="owner-loader" aria-label="Owner-Bereich lädt" /></main>;
  if (state === "guest") return <OwnerLanding />;
  if (state === "error") return <main className="owner-entry-error"><p>{message}</p><button type="button" onClick={() => { setState("loading"); setAttempt((value) => value + 1); }}>Erneut versuchen</button><Link href="/">Zur Website</Link></main>;

  return (
    <OwnerShell
      eyebrow="DEIN BEREICH"
      title="Dein Ort. Dein Auftritt."
      subtitle="Halte deine Orte aktuell und zeig, was sie besonders macht. Neue Angaben werden mit dem bestehenden Spot-Wissen abgeglichen."
      actions={<Link href="/owner/spots" className="owner-primary-button">Meine Spots öffnen <span aria-hidden="true">↗</span></Link>}
    >
      <section className="owner-home-intro">
        <p className="owner-section-kicker">WILLKOMMEN ZURÜCK</p>
        <h2>{spots.length ? `${spots.length} ${spots.length === 1 ? "Ort" : "Orte"} mit dir verbunden.` : "Hier beginnt dein Owner-Bereich."}</h2>
        <p>{spots.length ? "Wähle einen Spot aus, um seine Angaben und seinen Auftritt zu prüfen." : "Sobald dein Ort zugeordnet ist, kannst du ihn hier pflegen und die verfügbaren Einblicke ansehen."}</p>
      </section>

      <section className="owner-home-shortcuts" aria-label="Schnellzugriff">
        <Link href="/owner/spots"><span>01 / PFLEGEN</span><strong>Meine Spots</strong><small>Orte auswählen und Angaben pflegen</small><b aria-hidden="true">↗</b></Link>
        <Link href="/owner/world-knowledge"><span>02 / ERGÄNZEN</span><strong>Spot-Angaben</strong><small>Dein Wissen Schritt für Schritt ergänzen</small><b aria-hidden="true">↗</b></Link>
        <Link href="/owner/analytics"><span>03 / VERSTEHEN</span><strong>Einblicke</strong><small>Erfasste Besuche und Interaktionen</small><b aria-hidden="true">↗</b></Link>
      </section>

      <section className="owner-home-spots">
        <div className="owner-home-section-title"><div><p className="owner-section-kicker">DEINE ORTE</p><h2>Meine Spots</h2></div>{spots.length ? <Link href="/owner/spots">Alle anzeigen <span aria-hidden="true">↗</span></Link> : null}</div>
        {spots.length ? (
          <div className="owner-spot-grid">{spots.slice(0, 6).map((spot) => <OwnerSpotCard key={spot.spot_id} spot={spot} />)}</div>
        ) : (
          <div className="owner-home-empty">
            <div className="owner-home-empty-icon" aria-hidden="true">⌖</div>
            <div><h3>Noch kein Spot verbunden.</h3><p>Du betreibst einen Ort, der auf backyrd erscheinen soll? Schreib uns – wir prüfen die Zuordnung persönlich.</p></div>
            <a href={ownerContact} className="owner-secondary-button">Zugang anfragen</a>
          </div>
        )}
      </section>
    </OwnerShell>
  );
}
