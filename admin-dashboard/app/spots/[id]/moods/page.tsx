"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type MappingRow = {
  concept_id: number;
  strength: number;
  source: string | null;
  // joined
  concept_label: string;
  concept_cluster: string | null;
};

type ConceptOption = {
  id: number;
  label: string;
  primary_cluster_id: number | null;
  cluster_name: string | null;
};

export default function SpotMoodsPage() {
  const params = useParams<{ id: string }>();
  const spotId = params?.id as string;

  const [spotName, setSpotName] = useState<string>("");
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [concepts, setConcepts] = useState<ConceptOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState<number | "">("");
  const [strength, setStrength] = useState<number>(1);

  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!spotId) return;
    loadAll();
  }, [spotId]);

  async function loadAll() {
    setLoading(true);
    setMsg(null);

    const { data: spot } = await supabase
      .from("spots")
      .select("name")
      .eq("id", spotId)
      .single();

    setSpotName(spot?.name ?? "");

    // mappings + concept labels
    const { data: mapData, error: mapErr } = await supabase
      .from("spot_mood_concepts")
      .select(`
        concept_id,
        strength,
        source,
        mood_concepts:concept_id (
          label,
          primary_cluster_id,
          mood_clusters:primary_cluster_id ( name )
        )
      `)
      .eq("spot_id", spotId);

    if (mapErr) console.error(mapErr);

    const mapped: MappingRow[] = (mapData ?? []).map((r: any) => ({
      concept_id: r.concept_id,
      strength: Number(r.strength ?? 0),
      source: r.source ?? null,
      concept_label: r.mood_concepts?.label ?? String(r.concept_id),
      concept_cluster: r.mood_concepts?.mood_clusters?.name ?? null,
    }));

    mapped.sort((a, b) => b.strength - a.strength);
    setMappings(mapped);

    // all concepts for add-dropdown
    const { data: conceptData, error: conceptErr } = await supabase
      .from("mood_concepts")
      .select(`
        id,
        label,
        primary_cluster_id,
        mood_clusters:primary_cluster_id ( name )
      `)
      .order("label", { ascending: true });

    if (conceptErr) console.error(conceptErr);

    const opts: ConceptOption[] = (conceptData ?? []).map((c: any) => ({
      id: Number(c.id),
      label: c.label,
      primary_cluster_id: c.primary_cluster_id ?? null,
      cluster_name: c.mood_clusters?.name ?? null,
    }));

    setConcepts(opts);

    setLoading(false);
  }

  const filteredMappings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter((m) => {
      const hay = `${m.concept_label} ${m.concept_cluster ?? ""} ${m.concept_id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [mappings, search]);

  async function upsertMapping() {
    if (selectedConceptId === "") return;

    setSaving(true);
    setMsg(null);

    const payload = {
      spot_id: spotId,
      concept_id: selectedConceptId,
      strength,
      source: "manual",
    };

    // PK(spot_id, concept_id) => upsert works perfectly
    const { error } = await supabase
      .from("spot_mood_concepts")
      .upsert(payload, { onConflict: "spot_id,concept_id" });

    if (error) {
      setMsg(error.message);
      setSaving(false);
      return;
    }

    setSelectedConceptId("");
    setStrength(1);
    await loadAll();
    setMsg("Gespeichert.");
    setSaving(false);
  }

  async function updateStrength(conceptId: number, newStrength: number) {
    setSaving(true);
    setMsg(null);

    const { error } = await supabase
      .from("spot_mood_concepts")
      .update({ strength: newStrength, source: "manual" })
      .eq("spot_id", spotId)
      .eq("concept_id", conceptId);

    if (error) setMsg(error.message);
    else {
      setMappings((prev) =>
        prev
          .map((m) => (m.concept_id === conceptId ? { ...m, strength: newStrength, source: "manual" } : m))
          .sort((a, b) => b.strength - a.strength)
      );
    }

    setSaving(false);
  }

  async function removeMapping(conceptId: number) {
    if (!confirm("Mapping wirklich entfernen?")) return;

    setSaving(true);
    setMsg(null);

    const { error } = await supabase
      .from("spot_mood_concepts")
      .delete()
      .eq("spot_id", spotId)
      .eq("concept_id", conceptId);

    if (error) setMsg(error.message);
    else setMappings((prev) => prev.filter((m) => m.concept_id !== conceptId));

    setSaving(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Spot Moods</h1>
          <p className="text-sm text-gray-500">
            Spot: <span className="font-medium">{spotName || spotId}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/spots/${spotId}`} className="text-sm text-gray-500 hover:underline">
            Zurück
          </Link>
          <button
            onClick={loadAll}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Neu laden
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-gray-700">{msg}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Lade…</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Add mapping */}
          <div className="rounded-lg border border-gray-100 p-4 space-y-3">
            <h2 className="font-medium">Concept hinzufügen</h2>

            <select
              value={selectedConceptId}
              onChange={(e) => setSelectedConceptId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none"
            >
              <option value="">– Concept wählen –</option>
              {concepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}{c.cluster_name ? ` · ${c.cluster_name}` : ""}
                </option>
              ))}
            </select>

            <div className="space-y-1">
              <div className="text-sm text-gray-600">Strength</div>
              <input
                type="number"
                step="0.05"
                min="0"
                max="2"
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none"
              />
              <div className="text-xs text-gray-500">
                Tipp: 0.2–0.6 subtil, 1.0 normal, 1.5+ sehr stark
              </div>
            </div>

            <button
              disabled={saving || selectedConceptId === ""}
              onClick={upsertMapping}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {saving ? "Speichere…" : "Hinzufügen"}
            </button>
          </div>

          {/* Right: mappings */}
          <div className="lg:col-span-2 rounded-lg border border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">Aktive Concepts</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche Concept…"
                className="w-full max-w-sm rounded-md border border-gray-200 px-3 py-2 text-sm outline-none"
              />
            </div>

            {filteredMappings.length === 0 ? (
              <p className="text-sm text-gray-500">Noch keine Concepts zugeordnet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-100">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 font-medium">Concept</th>
                      <th className="px-4 py-2 font-medium">Cluster</th>
                      <th className="px-4 py-2 font-medium">Strength</th>
                      <th className="px-4 py-2 font-medium">Source</th>
                      <th className="px-4 py-2 font-medium text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMappings.map((m) => (
                      <tr key={m.concept_id} className="border-t border-gray-100">
                        <td className="px-4 py-2">
                          <div className="font-medium">{m.concept_label}</div>
                          <div className="text-xs text-gray-400 font-mono">{m.concept_id}</div>
                        </td>
                        <td className="px-4 py-2">{m.concept_cluster ?? "—"}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="2"
                            value={m.strength}
                            onChange={(e) => updateStrength(m.concept_id, Number(e.target.value))}
                            className="w-28 rounded-md border border-gray-200 px-2 py-1 text-sm outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">{m.source ?? "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            disabled={saving}
                            onClick={() => removeMapping(m.concept_id)}
                            className="text-sm text-red-600 hover:underline disabled:opacity-60"
                          >
                            Entfernen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
