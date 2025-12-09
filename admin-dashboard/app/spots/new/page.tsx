import Link from "next/link";
import { SpotForm } from "../SpotForm";

export default function NewSpotPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Neuer Spot</h1>
          <p className="page-subtitle">
            Lege einen neuen Spot im Backyrd-Universum an.
          </p>
        </div>

        <Link href="/spots" className="page-backlink">
          Zurück zur Übersicht
        </Link>
      </div>

      <SpotForm mode="create" />
    </div>
  );
}
