"use client";

import Link from "next/link";
import { SpotForm } from "../SpotForm";

export default function NewSpotPage() {
  return (
    <div className="spot-editor-page">
      <header className="spot-editor-hero">
        <div>
          <div className="spot-editor-eyebrow">Spot Management</div>
          <h1>Neuen Spot anlegen</h1>
          <p>
            Stammdaten, Decision Intelligence, Öffnungszeiten und Medien an
            einem Ort pflegen.
          </p>
        </div>

        <Link href="/spots" className="spot-editor-back">
          <span>←</span>
          Zur Spot-Übersicht
        </Link>
      </header>

      <div className="spot-editor-hint">
        <div className="spot-editor-hintIcon">✦</div>
        <div>
          <strong>Intelligence-ready</strong>
          <span>
            Beschreibung, Keywords und strukturierte Angaben fliessen direkt
            in die Recommendation Engine ein.
          </span>
        </div>
      </div>

      <SpotForm mode="create" />
    </div>
  );
}
