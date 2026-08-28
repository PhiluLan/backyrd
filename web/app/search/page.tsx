"use client";
import { FormEvent, useState } from "react";
import { getCatalog, type CatalogSpot } from "@/lib/consumer-api";
import { SearchIcon } from "@/components/consumer/icons";
import { Button, StateView } from "@/components/consumer/ui";
import { ConsumerSpotCard } from "@/components/consumer/spot-card";
export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [spots, setSpots] = useState<CatalogSpot[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(false);
    setSearched(true);
    try {
      setSpots(
        await getCatalog({ query: query.trim(), city: null, limit: 100 }),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="b-container b-main">
      <p className="b-kicker">Backyrd Suche</p>
      <h1 className="b-display b-display-lg" style={{ marginTop: 10 }}>
        FIND DEINEN ORT.
      </h1>
      <form className="b-decision-entry" onSubmit={submit}>
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Orte suchen"
          placeholder="Spot, Kategorie oder Adresse"
          autoFocus
        />
        <Button type="submit" disabled={loading || query.trim().length < 2}>
          Suchen
        </Button>
      </form>
      <div style={{ marginTop: 44 }}>
        {loading ? (
          <div
            className="b-skeleton"
            style={{ height: 420, borderRadius: 22 }}
          />
        ) : error ? (
          <StateView
            title="Suche nicht verfügbar"
            message="Versuch es gleich nochmals."
          />
        ) : searched && spots.length === 0 ? (
          <StateView
            title="Kein Ort gefunden"
            message="Probiere einen anderen Namen oder eine breitere Kategorie."
          />
        ) : (
          <div className="b-grid b-grid-4">
            {spots.map((spot) => (
              <ConsumerSpotCard
                key={spot.id}
                spot={{
                  id: spot.id,
                  name: spot.name,
                  address: spot.address,
                  category: spot.category_name,
                  image: spot.header_photo_url,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
