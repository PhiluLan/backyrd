"use client";

import Link from "next/link";
import { SpotForm } from "../SpotForm";

export default function NewSpotPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Neuer Spot</h1>
          <p className="text-sm text-gray-500">Spot anlegen inkl. Öffnungszeiten & Fotos.</p>
        </div>
        <Link href="/spots" className="text-sm text-gray-500 hover:underline">
          Zurück zur Übersicht
        </Link>
      </div>

      <SpotForm
        mode="create"
        onSaved={() => {
          // optional: redirect / toast
        }}
      />
    </div>
  );
}
