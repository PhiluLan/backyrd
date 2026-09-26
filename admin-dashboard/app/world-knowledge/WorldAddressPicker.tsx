"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductAddressSelection } from "@backyrd/world-knowledge-authoring-ui";

type GooglePlace = {
  formatted_address?: string;
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
  geometry?: { location?: { lat(): number; lng(): number } };
};

const part = (place: GooglePlace, type: string, short = false) => {
  const component = place.address_components?.find((item) => item.types.includes(type));
  return component ? short ? component.short_name : component.long_name : "";
};

const loadPlaces = (apiKey: string): Promise<void> => new Promise((resolve, reject) => {
  const googleWindow = window as typeof window & { google?: { maps?: { places?: unknown } } };
  if (googleWindow.google?.maps?.places) { resolve(); return; }
  let script = document.querySelector<HTMLScriptElement>("#google-maps-script");
  if (!script) {
    script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    document.head.appendChild(script);
  }
  const timer = setTimeout(() => reject(new Error("Die Adresssuche ist nicht erreichbar.")), 10000);
  script.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
  script.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Die Adresssuche ist nicht erreichbar.")); }, { once: true });
});

export type ResearchPlace = { placeId: string; name: string; address: string; latitude: number; longitude: number };
/** Same Google SDK as manual authoring; proposals require explicit Admin confirmation. */
export async function findResearchPlaces(query: string): Promise<ResearchPlace[]> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!key) throw new Error("Die bestehende Google-Adresssuche ist nicht konfiguriert.");
  await loadPlaces(key);
  type Result = GooglePlace & { place_id?: string; name?: string };
  const sdk = window as typeof window & { google?: { maps?: { places?: { PlacesService: new (element: HTMLDivElement) => {
    textSearch(request: { query: string }, callback: (results: Result[] | null, status: string) => void): void;
  } } } } };
  const Service = sdk.google?.maps?.places?.PlacesService;
  if (!Service) throw new Error("Google-Standortsuche ist nicht verfügbar.");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Google-Standortsuche hat zu lange gedauert.")), 10000);
    new Service(document.createElement("div")).textSearch({ query }, (results, status) => {
      clearTimeout(timer);
      if (status === "ZERO_RESULTS") { resolve([]); return; }
      if (status !== "OK") { reject(new Error("Google-Standortsuche derzeit nicht verfügbar.")); return; }
      resolve((results ?? []).flatMap((result) => {
        const latitude = result.geometry?.location?.lat(), longitude = result.geometry?.location?.lng();
        return typeof result.place_id === "string" && typeof result.name === "string" && typeof result.formatted_address === "string" && Number.isFinite(latitude) && Number.isFinite(longitude)
          ? [{ placeId: result.place_id, name: result.name, address: result.formatted_address, latitude: latitude!, longitude: longitude! }] : [];
      }).slice(0, 5));
    });
  });
}

export function WorldAddressPicker({ disabled, onSelect }: { disabled: boolean; onSelect(value: ProductAddressSelection | null): void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState("");
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
      if (!apiKey) { setError("Die Adresssuche ist nicht konfiguriert. Die Ortsfelder darunter bleiben bearbeitbar."); return; }
      try {
        await loadPlaces(apiKey);
        if (!active || !inputRef.current) return;
        // Same Google Places source and Swiss address restriction as the existing Spot form.
        const googleWindow = window as typeof window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, options: unknown) => { addListener(event: string, callback: () => void): { remove(): void }; getPlace(): GooglePlace } } } } };
        const Autocomplete = googleWindow.google?.maps?.places?.Autocomplete;
        if (!Autocomplete) throw new Error("Die Adresssuche ist nicht erreichbar.");
        const autocomplete = new Autocomplete(inputRef.current, { types: ["address"], componentRestrictions: { country: "ch" } });
        const listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const latitude = place.geometry?.location?.lat();
          const longitude = place.geometry?.location?.lng();
          const locality = part(place, "locality") || part(place, "postal_town");
          const street = [part(place, "route"), part(place, "street_number")].filter(Boolean).join(" ") || place.formatted_address?.split(",")[0] || "";
          const countryCode = part(place, "country", true);
          if (!street || !locality || countryCode !== "CH" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            setError("Bitte eine vollständige Schweizer Adresse mit Ort und Position auswählen.");
            return;
          }
          setError("");
          onSelectRef.current({ addressLine1: street, locality, countryCode, latitude: latitude!, longitude: longitude! });
        });
        return () => listener.remove();
      } catch {
        if (active) setError("Die Adresssuche ist nicht erreichbar. Die Ortsfelder darunter bleiben bearbeitbar.");
      }
    };
    let cleanup: (() => void) | undefined;
    void init().then((result) => { cleanup = result; if (!active) cleanup?.(); });
    return () => { active = false; cleanup?.(); };
  }, []);

  return <div className="wk-address-picker"><label>Adresse suchen<input ref={inputRef} type="search" disabled={disabled || !!error} placeholder="Straße und Hausnummer eingeben" autoComplete="off" onChange={() => onSelectRef.current(null)} /></label>{error && <p role="status">{error}</p>}</div>;
}
