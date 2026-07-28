"use client";

import { useMemo, useState } from "react";
import type {
  OwnerSpotTaxonomyItem,
  OwnerTaxonomyCatalogItem,
  OwnerTaxonomyNodeType,
} from "@/lib/owner-api";

type Props = {
  catalog: OwnerTaxonomyCatalogItem[];
  selectedIds: string[];
  existingAssignments: OwnerSpotTaxonomyItem[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

const TYPE_LABELS: Record<OwnerTaxonomyNodeType, string> = {
  subcategory: "Was für ein Spot seid ihr?",
  feature: "Ausstattung & Merkmale",
  offering: "Angebot",
  service: "Services",
};

const TYPE_HELP: Record<OwnerTaxonomyNodeType, string> = {
  subcategory: "Wähle die treffendsten Unterkategorien.",
  feature: "Was finden Gäste bei euch vor?",
  offering: "Was bietet ihr konkret an?",
  service: "Welche Services sind verfügbar?",
};

const TYPES: OwnerTaxonomyNodeType[] = [
  "subcategory",
  "feature",
  "offering",
  "service",
];

export function OwnerTaxonomyPicker({
  catalog,
  selectedIds,
  existingAssignments,
  onChange,
  disabled = false,
}: Props) {
  const [search, setSearch] = useState("");

  const verifiedIds = useMemo(
    () =>
      new Set(
        existingAssignments
          .filter((item) => item.is_verified)
          .map((item) => item.taxonomy_node_id),
      ),
    [existingAssignments],
  );

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();

    return TYPES.map((type) => ({
      type,
      items: catalog.filter((item) => {
        if (item.node_type !== type) return false;
        if (!query) return true;
        return `${item.label} ${item.slug}`.toLowerCase().includes(query);
      }),
    })).filter((group) => group.items.length > 0);
  }, [catalog, search]);

  function toggle(id: string) {
    if (disabled || verifiedIds.has(id)) return;

    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-pink-400">
            Spot Profil
          </div>
          <h2 className="mt-2 text-2xl font-semibold">Eigenschaften & Angebot</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            Wähle nur Angaben, die Gäste bei euch tatsächlich erwarten können.
            Diese Signale fliessen direkt in Suche, Decision und Empfehlungen ein.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm">
          <strong className="text-white">{selectedIds.length}</strong>
          <span className="ml-2 text-white/45">ausgewählt</span>
        </div>
      </div>

      <div className="mt-6">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Eigenschaft suchen …"
          className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
        />
      </div>

      {catalog.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-6 text-sm text-white/45">
          Für die Hauptkategorie dieses Spots sind aktuell keine Owner-Taxonomien freigegeben.
        </div>
      ) : grouped.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-6 text-sm text-white/45">
          Keine passende Eigenschaft gefunden.
        </div>
      ) : (
        <div className="mt-7 space-y-8">
          {grouped.map(({ type, items }) => (
            <div key={type}>
              <div className="mb-3">
                <h3 className="text-base font-semibold">{TYPE_LABELS[type]}</h3>
                <p className="mt-1 text-xs text-white/40">{TYPE_HELP[type]}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {items.map((item) => {
                  const selected = selectedIds.includes(item.id);
                  const verified = verifiedIds.has(item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={disabled || verified}
                      onClick={() => toggle(item.id)}
                      title={
                        verified
                          ? "Diese Angabe wurde von Backyrd verifiziert und kann hier nicht entfernt werden."
                          : item.label
                      }
                      className={[
                        "group inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition",
                        selected
                          ? "border-pink-400/45 bg-pink-500/15 text-pink-100"
                          : "border-white/10 bg-black/25 text-white/60 hover:border-white/20 hover:bg-white/[0.07] hover:text-white",
                        verified ? "cursor-not-allowed ring-1 ring-emerald-400/25" : "",
                        disabled ? "opacity-60" : "",
                      ].join(" ")}
                    >
                      <span
                        className="grid h-6 w-6 place-items-center rounded-full bg-white/[0.07] text-xs"
                        style={
                          item.color
                            ? { color: item.color, backgroundColor: `${item.color}18` }
                            : undefined
                        }
                      >
                        {item.icon || "◇"}
                      </span>
                      <span>{item.label}</span>
                      {selected && <span className="text-pink-300">✓</span>}
                      {verified && (
                        <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                          Verifiziert
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-7 rounded-2xl border border-white/8 bg-black/20 p-4 text-xs leading-5 text-white/40">
        Verifizierte Angaben wurden durch Backyrd bestätigt und bleiben geschützt.
        Eigene Auswahlen kannst du jederzeit anpassen.
      </div>
    </section>
  );
}
