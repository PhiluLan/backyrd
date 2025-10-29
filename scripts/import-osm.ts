// scripts/import-osm.ts
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// Supabase Client initialisieren
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

async function importOSM() {
  // Bounding Box für Basel Innenstadt
  const bbox = "47.54,7.55,47.59,7.60";

  // Overpass Query
  const query = `
    [out:json];
    (
      node["amenity"~"^(restaurant|bar|cafe)$"](${bbox});
      way["amenity"~"^(restaurant|bar|cafe)$"](${bbox});
      relation["amenity"~"^(restaurant|bar|cafe)$"](${bbox});
    );
    out center;
  `;

  console.log("Hole Daten aus Overpass API …");
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });
  const data: any = await res.json();

  console.log(`Gefundene Spots: ${data.elements.length}`);

  // Jeden Spot vorbereiten
  for (const el of data.elements) {
    const tags = el.tags || {};
    if (!tags.name) continue; // nur mit Namen importieren

    const spot = {
      id: crypto.randomUUID(), // deine Tabelle hat uuid
      name: tags.name,
      address: [
        tags["addr:street"],
        tags["addr:housenumber"],
        tags["addr:postcode"],
        tags["addr:city"],
      ]
        .filter(Boolean)
        .join(" "),
      lat: el.lat || el.center?.lat,
      lng: el.lon || el.center?.lon,
      category: tags.amenity,
      status: "approved",
      city: tags["addr:city"] ?? null,
    };

    // Insert in Supabase
    const { error } = await supabase.from("spots").insert(spot);
    if (error) {
      console.error("❌ Fehler beim Insert:", error.message);
    } else {
      console.log("✅ Importiert:", spot.name);
    }
  }
}

importOSM().catch(console.error);
