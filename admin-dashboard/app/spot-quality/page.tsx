"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type QualityIssue = {
  key: string;
  label: string;
  severity: "critical" | "high" | "medium" | "low";
  points: number;
};

type QualityRow = {
  spot_id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  status: string | null;
  quality_score: number;
  photo_count: number;
  opening_slot_count: number;
  has_description: boolean;
  has_keywords: boolean;
  taxonomy_count: number;
  verified_taxonomy_count: number;
  google_place_id: string | null;
  google_photo_enabled: boolean;
  duplicate_google_place_id: boolean;
  duplicate_name_address: boolean;
  issues: QualityIssue[];
  created_at: string;
};

type QualitySummary = {
  total: number;
  excellent: number;
  good: number;
  needs_work: number;
  critical: number;
  missing_google_place_id: number;
  missing_photo: number;
  missing_description: number;
  missing_opening_hours: number;
  missing_taxonomies: number;
  possible_duplicates: number;
  average_score: number;
};

type QualityResponse = {
  summary: QualitySummary;
  filtered_total: number;
  population: {
    contract: "ACTIVE_PRODUCT_SPOTS_V2";
    statuses: string[];
    origins: string[];
    calculated_at: string;
  };
  rows: QualityRow[];
};

type QualityRpcResponse = {
  summary: QualitySummary;
  rows: QualityRow[];
};

type ActiveProductSpot = {
  id: string;
  name: string | null;
  address: string | null;
  google_place_id: string | null;
};

const PAGE_SIZE = 1000;
const ACTIVE_PRODUCT_STATUSES = ["approved", "pending"] as const;
const PRODUCT_ORIGINS = ["REAL", "IMPORT", "LEGACY"] as const;

const ISSUE_FILTERS = [
  { value: "all", label: "Alle Spots" },
  { value: "low_quality", label: "Unter 70 %" },
  { value: "possible_duplicate", label: "Mögliche Duplikate" },
  { value: "missing_google_place_id", label: "Ohne Google Place ID" },
  { value: "missing_photo", label: "Ohne Bild" },
  { value: "missing_description", label: "Ohne Beschreibung" },
  { value: "missing_opening_hours", label: "Ohne Öffnungszeiten" },
  { value: "missing_taxonomies", label: "Taxonomie unvollständig" },
];

function scoreTone(score: number) {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

function scoreLabel(score: number) {
  if (score >= 90) return "Launch-ready";
  if (score >= 75) return "Gute Basis";
  if (score >= 50) return "Ausbaufähig";
  return "Kritisch";
}

function issueClass(severity: QualityIssue["severity"]) {
  return `sq-issue sq-issue-${severity}`;
}

function normalizeDuplicateKey(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function reconcileDuplicates(
  rows: QualityRow[],
  activeSpots: ActiveProductSpot[],
) {
  const googleCounts = new Map<string, number>();
  const nameAddressCounts = new Map<string, number>();

  for (const spot of activeSpots) {
    const googlePlaceId = spot.google_place_id?.trim();
    if (googlePlaceId) {
      googleCounts.set(googlePlaceId, (googleCounts.get(googlePlaceId) ?? 0) + 1);
    }

    const name = normalizeDuplicateKey(spot.name);
    const address = normalizeDuplicateKey(spot.address);
    if (name && address) {
      const key = `${name}:${address}`;
      nameAddressCounts.set(key, (nameAddressCounts.get(key) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    const googlePlaceId = row.google_place_id?.trim();
    const duplicateGooglePlaceId = Boolean(
      googlePlaceId && (googleCounts.get(googlePlaceId) ?? 0) > 1,
    );
    const name = normalizeDuplicateKey(row.name);
    const address = normalizeDuplicateKey(row.address);
    const duplicateNameAddress = Boolean(
      name && address && (nameAddressCounts.get(`${name}:${address}`) ?? 0) > 1,
    );
    const issues = row.issues.filter((item) => item.key !== "possible_duplicate");

    if (duplicateGooglePlaceId || duplicateNameAddress) {
      issues.push({
        key: "possible_duplicate",
        label: "Mögliches Duplikat",
        severity: "critical",
        points: 0,
      });
    }

    return {
      ...row,
      duplicate_google_place_id: duplicateGooglePlaceId,
      duplicate_name_address: duplicateNameAddress,
      issues,
    };
  });
}

function summarize(rows: QualityRow[]): QualitySummary {
  const issueCount = (key: string) =>
    rows.filter((row) => row.issues.some((item) => item.key === key)).length;
  const scoreTotal = rows.reduce((total, row) => total + row.quality_score, 0);

  return {
    total: rows.length,
    excellent: rows.filter((row) => row.quality_score >= 90).length,
    good: rows.filter(
      (row) => row.quality_score >= 75 && row.quality_score <= 89,
    ).length,
    needs_work: rows.filter(
      (row) => row.quality_score >= 50 && row.quality_score <= 74,
    ).length,
    critical: rows.filter((row) => row.quality_score < 50).length,
    missing_google_place_id: issueCount("missing_google_place_id"),
    missing_photo: issueCount("missing_photo"),
    missing_description: issueCount("missing_description"),
    missing_opening_hours: issueCount("missing_opening_hours"),
    missing_taxonomies: issueCount("missing_taxonomies"),
    possible_duplicates: issueCount("possible_duplicate"),
    average_score: rows.length
      ? Math.round((scoreTotal / rows.length) * 10) / 10
      : 0,
  };
}

function matchesFilter(row: QualityRow, search: string, issue: string) {
  const term = search.trim().toLocaleLowerCase("de-CH");
  const matchesSearch =
    !term ||
    [row.name, row.address, row.city].some((value) =>
      (value ?? "").toLocaleLowerCase("de-CH").includes(term),
    );
  const matchesIssue =
    !issue ||
    issue === "all" ||
    (issue === "low_quality"
      ? row.quality_score < 70
      : row.issues.some((item) => item.key === issue));

  return matchesSearch && matchesIssue;
}

export default function SpotQualityPage() {
  const [data, setData] = useState<QualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [issue, setIssue] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadQuality = useCallback(async () => {
    setLoading(true);

    try {
      const qualityRows: QualityRow[] = [];
      const activeSpots: ActiveProductSpot[] = [];

      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data: result, error: rpcError } = await supabase.rpc(
          "admin_spot_quality_v1",
          {
            p_limit: PAGE_SIZE,
            p_offset: offset,
            p_search: null,
            p_issue: "all",
          },
        );
        if (rpcError) throw rpcError;

        const page = result as QualityRpcResponse;
        qualityRows.push(...page.rows);
        if (page.rows.length < PAGE_SIZE) break;
      }

      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data: result, error: spotError } = await supabase
          .from("spots")
          .select("id,name,address,google_place_id")
          .in("status", [...ACTIVE_PRODUCT_STATUSES])
          .in("data_origin", [...PRODUCT_ORIGINS])
          .order("id")
          .range(offset, offset + PAGE_SIZE - 1);
        if (spotError) throw spotError;

        const page = result as ActiveProductSpot[];
        activeSpots.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      const activeIds = new Set(activeSpots.map((spot) => spot.id));
      const productRows = reconcileDuplicates(
        qualityRows.filter((row) => activeIds.has(row.spot_id)),
        activeSpots,
      );
      const filteredRows = productRows.filter((row) =>
        matchesFilter(row, search, issue),
      );

      setError("");
      setData({
        summary: summarize(productRows),
        filtered_total: filteredRows.length,
        population: {
          contract: "ACTIVE_PRODUCT_SPOTS_V2",
          statuses: [...ACTIVE_PRODUCT_STATUSES],
          origins: [...PRODUCT_ORIGINS],
          calculated_at: new Date().toISOString(),
        },
        rows: filteredRows,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Spot-Qualität konnte nicht geladen werden.",
      );
      setData(null);
    }

    setLoading(false);
  }, [issue, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQuality();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [loadQuality, refreshKey]);

  const visibleRows = useMemo(() => data?.rows ?? [], [data]);

  return (
    <div className="bi-page sq-page">
      <header className="bi-header sq-header">
        <div>
          <div className="bi-eyebrow">Spot Operations</div>
          <h1>Spot Quality Engine</h1>
          <p>
            Datenqualität, offene Aufgaben und mögliche Duplikate für aktive
            Product-Spots. Archivierte und interne Test-Spots bleiben außerhalb
            dieser Arbeitsliste.
          </p>
        </div>

        <div className="sq-headerActions">
          <button
            type="button"
            className="bi-actionButton"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            Neu berechnen
          </button>

          <Link href="/spots/new" className="bi-primaryButton">
            + Neuer Spot
          </Link>
        </div>
      </header>

      {error ? <div className="bi-error">{error}</div> : null}

      {data ? (
        <>
          <section className="sq-heroGrid">
            <article className="sq-scoreHero">
              <div className="sq-scoreHeroTop">
                <div>
                  <span className="bi-kicker">Gesamtqualität</span>
                  <strong>{data.summary.average_score}%</strong>
                </div>

                <div className="sq-scoreHeroBadge">
                  {data.summary.total} Spots
                </div>
              </div>

              <div className="sq-scoreTrack">
                <div
                  className="sq-scoreFill"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(100, data.summary.average_score),
                    )}%`,
                  }}
                />
              </div>

              <p>
                {data.summary.excellent} Spots sind launch-ready.{" "}
                {data.summary.critical} benötigen dringend Aufmerksamkeit.
              </p>
            </article>

            <div className="sq-statusGrid">
              <SummaryCard
                label="Launch-ready"
                value={data.summary.excellent}
                tone="excellent"
              />
              <SummaryCard
                label="Gute Basis"
                value={data.summary.good}
                tone="good"
              />
              <SummaryCard
                label="Ausbaufähig"
                value={data.summary.needs_work}
                tone="warning"
              />
              <SummaryCard
                label="Kritisch"
                value={data.summary.critical}
                tone="critical"
              />
            </div>
          </section>

          <section className="sq-queueGrid">
            <QueueCard
              label="Ohne Google Place ID"
              value={data.summary.missing_google_place_id}
              filter="missing_google_place_id"
              active={issue === "missing_google_place_id"}
              onSelect={setIssue}
            />
            <QueueCard
              label="Ohne Bild"
              value={data.summary.missing_photo}
              filter="missing_photo"
              active={issue === "missing_photo"}
              onSelect={setIssue}
            />
            <QueueCard
              label="Ohne Beschreibung"
              value={data.summary.missing_description}
              filter="missing_description"
              active={issue === "missing_description"}
              onSelect={setIssue}
            />
            <QueueCard
              label="Ohne Öffnungszeiten"
              value={data.summary.missing_opening_hours}
              filter="missing_opening_hours"
              active={issue === "missing_opening_hours"}
              onSelect={setIssue}
            />
            <QueueCard
              label="Taxonomie unvollständig"
              value={data.summary.missing_taxonomies}
              filter="missing_taxonomies"
              active={issue === "missing_taxonomies"}
              onSelect={setIssue}
            />
            <QueueCard
              label="Mögliche Duplikate"
              value={data.summary.possible_duplicates}
              filter="possible_duplicate"
              active={issue === "possible_duplicate"}
              onSelect={setIssue}
              danger
            />
          </section>

          <section className="bi-card sq-worklist">
            <div className="sq-worklistHead">
              <div>
                <span className="bi-kicker">Founder Queue</span>
                <h3>Spot-Arbeitsliste</h3>
                <p>{data.filtered_total} passende aktive Product-Spots</p>
              </div>

              <div className="sq-toolbar">
                <input
                  className="bi-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Spot, Adresse oder Stadt suchen …"
                />

                <select
                  className="bi-select"
                  value={issue}
                  onChange={(event) => setIssue(event.target.value)}
                >
                  {ISSUE_FILTERS.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="bi-state">Spot-Qualität wird berechnet …</div>
            ) : visibleRows.length === 0 ? (
              <div className="bi-empty">
                Für diesen Filter gibt es keine offenen Spots.
              </div>
            ) : (
              <div className="sq-list">
                {visibleRows.map((spot) => (
                  <article className="sq-spotCard" key={spot.spot_id}>
                    <div
                      className={`sq-scoreCircle sq-score-${scoreTone(
                        spot.quality_score,
                      )}`}
                    >
                      <strong>{spot.quality_score}</strong>
                      <span>%</span>
                    </div>

                    <div className="sq-spotMain">
                      <div className="sq-spotTitleRow">
                        <div>
                          <h4>{spot.name}</h4>
                          <p>
                            {spot.address || spot.city || "Adresse unbekannt"}
                          </p>
                        </div>

                        <span
                          className={`sq-qualityLabel sq-label-${scoreTone(
                            spot.quality_score,
                          )}`}
                        >
                          {scoreLabel(spot.quality_score)}
                        </span>
                      </div>

                      <div className="sq-facts">
                        <span>{spot.photo_count} eigene Bilder</span>
                        <span>{spot.opening_slot_count} Zeitfenster</span>
                        <span>{spot.taxonomy_count} Taxonomien</span>
                        <span>
                          {spot.google_place_id
                            ? "Google verknüpft"
                            : "Google nicht verknüpft"}
                        </span>
                      </div>

                      <div className="sq-issues">
                        {spot.issues.slice(0, 5).map((item) => (
                          <span className={issueClass(item.severity)} key={item.key}>
                            {item.label}
                          </span>
                        ))}

                        {spot.issues.length > 5 ? (
                          <span className="sq-issue sq-issue-more">
                            +{spot.issues.length - 5} weitere
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="sq-spotActions">
                      {!spot.google_place_id ? (
                        <Link
                          className="bi-primaryButton"
                          href={`/spot-quality/${spot.spot_id}/google-backfill`}
                        >
                          Google finden
                        </Link>
                      ) : (
                        <Link
                          className="bi-primaryButton"
                          href={`/spot-quality/${spot.spot_id}/enrichment`}
                        >
                          Google-Daten
                        </Link>
                      )}

                      <Link
                        className={spot.google_place_id ? "bi-primaryButton" : "bi-actionButton"}
                        href={`/spots/${spot.spot_id}/edit`}
                      >
                        Verbessern
                      </Link>

                      <Link
                        className="bi-action"
                        href={`/spots/${spot.spot_id}`}
                      >
                        Performance →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : loading ? (
        <div className="bi-state">Spot-Qualität wird berechnet …</div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <article className={`sq-summaryCard sq-summary-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function QueueCard({
  label,
  value,
  filter,
  active,
  danger = false,
  onSelect,
}: {
  label: string;
  value: number;
  filter: string;
  active: boolean;
  danger?: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      className={[
        "sq-queueCard",
        active ? "active" : "",
        danger ? "danger" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(active ? "all" : filter)}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>Queue öffnen →</small>
    </button>
  );
}
