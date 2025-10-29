"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import usePlacesAutocomplete, { getGeocode, getLatLng } from "use-places-autocomplete";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NewSpotPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<{
    description: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: "ch" }, // Optional: auf Schweiz begrenzen
    },
    debounce: 300,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert("Name erforderlich");
    if (!selectedAddress) return alert("Adresse auswählen");

    setSaving(true);
    const { error } = await supabase.from("spots").insert({
      name,
      category: category || null,
      address: selectedAddress.description,
      lat: selectedAddress.lat,
      lng: selectedAddress.lng,
      status: "approved",
    });

    if (error) {
      alert("Fehler beim Speichern: " + error.message);
    } else {
      router.push("/spots");
    }
    setSaving(false);
  }

  async function handleSelect(suggestion: any) {
    setValue(suggestion.description, false);
    clearSuggestions();

    try {
      const results = await getGeocode({ address: suggestion.description });
      const { lat, lng } = await getLatLng(results[0]);
      setSelectedAddress({ description: suggestion.description, lat, lng });
    } catch (e) {
      console.error("Geocoding error:", e);
    }
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-white">📝 Spot hinzufügen</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded bg-gray-900 text-white px-3 py-2 border border-gray-700"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1">Kategorie</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded bg-gray-900 text-white px-3 py-2 border border-gray-700"
          />
        </div>

        {/* 📍 Google Autocomplete */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Adresse *</label>
          <input
            value={value}
            disabled={!ready}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Adresse eingeben"
            className="w-full rounded bg-gray-900 text-white px-3 py-2 border border-gray-700"
          />
          {status === "OK" && (
            <div className="mt-2 bg-gray-800 rounded shadow-lg max-h-60 overflow-y-auto">
              {data.map((sug) => (
                <div
                  key={sug.place_id}
                  onClick={() => handleSelect(sug)}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-700"
                >
                  {sug.description}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedAddress && (
          <p className="text-sm text-green-400">
            📍 {selectedAddress.description} ({selectedAddress.lat.toFixed(4)}, {selectedAddress.lng.toFixed(4)})
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
        >
          {saving ? "Speichern..." : "Spot speichern"}
        </button>
      </form>
    </div>
  );
}
