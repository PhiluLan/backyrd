"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTHORING_FIELDS, validateAuthoringSubmission } from "@backyrd/world-knowledge-core";
import type { WorldAuthoringClient } from "./session";

type Detail = {
  contractVersion: string;
  spotId: string;
  name: string;
  status: string;
  actor: { role: "ADMIN" | "VERIFIED_OWNER"; allowedAttributeKeys: string[] };
  answers: Record<string, { claimId: string; knowledgeState: string; value: unknown }>;
  openConflicts: Array<{ class: string; attributeKey: string; reasonCodes: string[] }>;
  manifest: null | { manifestHash: string; worldSnapshot: unknown };
};

export type ProductAdminSpotSearch = {
  contractVersion: "backyrd.world-knowledge.product-admin-spot-search@1.0";
  spots: Array<{ spotId: string; name: string; city: string | null }>;
  hasMore: boolean;
};
type SearchState = "LOADING" | "RESULTS" | "EMPTY" | "BACKEND_NOT_PUBLISHED" | "FORBIDDEN" | "UNAVAILABLE";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codeOf = (error: unknown) => error instanceof Error ? error.message : "";
const messageOf = (error: unknown) => {
  const code = codeOf(error);
  if (code === "WORLD_BACKEND_NOT_PUBLISHED" || /PGRST202|Could not find the function|does not exist/i.test(code)) return "World Knowledge hier noch nicht verfügbar.";
  if (code.includes("world_product_authoring_authority_off")) return "World Knowledge ist derzeit ausgeschaltet. Deine Eingaben bleiben erhalten.";
  if (code === "WORLD_ADMIN_FORBIDDEN" || code === "admin_required") return "Du bist für diesen Spot nicht berechtigt.";
  if (code === "WORLD_SERVICE_UNAVAILABLE" || code.startsWith("world_product_reader_")) return "World Knowledge ist derzeit nicht erreichbar. Deine Eingaben bleiben erhalten.";
  return code.startsWith("Bitte ") || code.startsWith("Der ") || code.startsWith("Die ") || code.startsWith("Für ") || code.startsWith("World ") || code.startsWith("Korrektur ")
    ? code : "Die Korrektur konnte nicht abgeschlossen werden. Deine Eingaben bleiben erhalten.";
};
const backendMissing = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST202" || error?.code === "42883" || error?.code === "42P01";
const safeRpcMessage = (error: { code?: string; message?: string } | null): string => {
  if (backendMissing(error)) return "World Knowledge hier noch nicht verfügbar.";
  if (error?.message?.includes("world_product_authoring_authority_off")) return "World Knowledge ist derzeit ausgeschaltet. Deine Eingaben bleiben erhalten.";
  if (error?.code === "42501") return "Du bist für diesen Spot nicht berechtigt.";
  if (error?.code === "40001" || error?.code === "23505" || error?.message?.includes("conflict")) return "Die Angabe hat sich zwischenzeitlich geändert. Bitte lade den Spot erneut und prüfe den Konflikt.";
  return "World Knowledge ist derzeit nicht erreichbar. Deine Eingaben bleiben erhalten.";
};
const searchFailure = (error: unknown): SearchState => {
  const code = codeOf(error);
  return code === "WORLD_BACKEND_NOT_PUBLISHED" ? "BACKEND_NOT_PUBLISHED"
    : code === "WORLD_ADMIN_FORBIDDEN" || code === "admin_required" ? "FORBIDDEN" : "UNAVAILABLE";
};

/** Uses the existing append-only World claim RPCs and canonical rebuild path. */
export function WorldProductCorrection({ client, rebuild, search }: {
  client: WorldAuthoringClient;
  rebuild(spotId: string, idempotencyKey: string): Promise<unknown>;
  search?: (query: string) => Promise<ProductAdminSpotSearch>;
}) {
  const [spotId, setSpotId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [attributeKey, setAttributeKey] = useState("");
  const [knowledgeState, setKnowledgeState] = useState("KNOWN_VALUE");
  const [valueText, setValueText] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ProductAdminSpotSearch["spots"]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("LOADING");
  const searchSequence = useRef(0);

  const findSpots = useCallback(async (term: string) => {
    if (!search) return;
    const sequence = ++searchSequence.current;
    setSearchState("LOADING");
    try {
      const result = await search(term);
      if (sequence !== searchSequence.current) return;
      if (result.contractVersion !== "backyrd.world-knowledge.product-admin-spot-search@1.0"
        || !Array.isArray(result.spots) || typeof result.hasMore !== "boolean") throw new Error("WORLD_SEARCH_RESPONSE_INVALID");
      setMatches(result.spots);
      setHasMore(result.hasMore);
      setSearchState(result.spots.length ? "RESULTS" : "EMPTY");
    } catch (error) {
      if (sequence !== searchSequence.current) return;
      setMatches([]);
      setHasMore(false);
      setSearchState(searchFailure(error));
    }
  }, [search]);

  useEffect(() => {
    if (!search) return;
    void findSpots("");
    return () => { searchSequence.current += 1; };
  }, [findSpots, search]);

  const load = async (id: string) => {
    if (!uuid.test(id)) throw new Error("Bitte eine gültige Spot-ID eingeben.");
    const { data, error } = await client.rpc<Detail>("world_product_authoring_detail_v1", { p_spot_id: id });
    if (error || !data || data.contractVersion !== "backyrd.world-knowledge.product-authoring-detail@1.0" || data.spotId !== id || data.status !== "approved") {
      throw new Error(error ? safeRpcMessage(error) : "Der freigegebene Spot ist nicht verfügbar oder du bist nicht berechtigt.");
    }
    setDetail(data);
    setAttributeKey((current) => data.actor.allowedAttributeKeys.includes(current) ? current : data.actor.allowedAttributeKeys[0] ?? "");
    return data;
  };
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setMessage(""); setMessageIsError(false);
    try { await task(); } catch (error) { setMessage(messageOf(error)); setMessageIsError(true); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!detail || !attributeKey || !detail.actor.allowedAttributeKeys.includes(attributeKey)) throw new Error("Dieses Feld ist nicht freigegeben.");
    if (detail.openConflicts.some((item) => item.attributeKey === attributeKey)) throw new Error("Für dieses Feld ist eine offene Konfliktprüfung erforderlich.");
    let value: unknown = null;
    if (knowledgeState === "KNOWN_VALUE") {
      try { value = JSON.parse(valueText); } catch { throw new Error("Der Wert muss gültiges JSON sein; Text benötigt Anführungszeichen."); }
    }
    const validated = validateAuthoringSubmission(attributeKey, knowledgeState, value);
    if (!validated.ok) throw new Error(validated.message);
    if (attributeKey === "state.current" && !validUntil) throw new Error("Aktueller Zustand benötigt ein Gültig-bis-Datum.");
    const key = `product-correction:${crypto.randomUUID()}`;
    const { error } = await client.rpc(detail.actor.role === "ADMIN" ? "world_product_admin_submit_claim_v1" : "world_product_owner_submit_claim_v1", {
      p_spot_id: detail.spotId, p_attribute_key: attributeKey, p_knowledge_state: knowledgeState,
      p_value: validated.value, p_observed_at: new Date().toISOString(), p_valid_from: null,
      p_valid_until: validUntil ? new Date(validUntil).toISOString() : null, p_visibility: "PUBLIC",
      p_supersedes_claim_id: detail.answers[attributeKey]?.claimId ?? null,
      p_idempotency_key: key,
    });
    if (error) throw new Error(safeRpcMessage(error));
    const result = await rebuild(detail.spotId, `${key}:rebuild`) as { manifestHash?: string; readerSnapshot?: unknown; openConflicts?: unknown[] };
    if (!result?.manifestHash || !result.readerSnapshot) throw new Error("Der kanonische World-Reader hat die Korrektur nicht bestätigt.");
    const refreshed = await load(detail.spotId);
    if (refreshed.manifest?.manifestHash !== result.manifestHash) throw new Error("World-Reader und Admin-Ansicht widersprechen sich.");
    if (result.openConflicts?.length) throw new Error("Die Korrektur wurde gespeichert, aber offene Konflikte verhindern eine Freigabe.");
    setMessage("Korrektur append-only gespeichert; kanonischer World-Reader bestätigt den Rebuild.");
  };
  const fields = AUTHORING_FIELDS.filter((field) => detail?.actor.allowedAttributeKeys.includes(field.attributeKey));
  return <section className="wk-panel" aria-label="Product World-Korrektur">
    <h2>World-Spot korrigieren</h2>
    <p>Nur freigegebene Spots. Jede Änderung wird append-only gespeichert und anschließend im kanonischen Reader geprüft.</p>
    {search && <div className="wk-product-search">
      <form onSubmit={(event) => { event.preventDefault(); void findSpots(query); }}>
        <label>Spot nach Namen suchen<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name des Spots" aria-label="Spot nach Namen suchen" /></label>
        <button type="submit" disabled={searchState === "LOADING"}>Suchen</button>
      </form>
      {searchState === "LOADING" && <p role="status">Spots werden geladen …</p>}
      {searchState === "BACKEND_NOT_PUBLISHED" && <p role="alert">World Knowledge hier noch nicht verfügbar. Die benötigten Datenbankfunktionen sind noch nicht veröffentlicht.</p>}
      {searchState === "FORBIDDEN" && <p role="alert">Du bist für die World-Knowledge-Suche nicht berechtigt.</p>}
      {searchState === "UNAVAILABLE" && <p role="alert">Die World-Knowledge-Suche ist derzeit nicht erreichbar. Deine Eingabe bleibt erhalten.</p>}
      {searchState === "EMPTY" && <p role="status">Keine freigegebenen Spots zu dieser Suche gefunden.</p>}
      {searchState === "RESULTS" && <div className="wk-product-search-results" aria-label="Gefundene Spots">
        {matches.map((spot) => <button type="button" key={spot.spotId} disabled={busy} onClick={() => void run(async () => { await load(spot.spotId); setSpotId(spot.spotId); })}>
          <strong>{spot.name}</strong><span>{spot.city ?? "Ort nicht angegeben"}</span>
        </button>)}
        {hasMore && <p>Weitere Spots vorhanden – bitte die Suche verfeinern.</p>}
      </div>}
    </div>}
    {!search && <><label>Spot-ID<input value={spotId} onChange={(event) => { setSpotId(event.target.value); setDetail(null); }} aria-label="Spot-ID" /></label>
      <button type="button" disabled={busy} onClick={() => void run(async () => { await load(spotId); })}>Spot laden</button></>}
    {detail && <>
      <p>{detail.name} · {detail.status} · Reader {detail.manifest?.manifestHash ?? "noch kein Snapshot"}</p>
      {detail.openConflicts.length > 0 && <p role="alert">{detail.openConflicts.length} offene Konflikte; betroffene Felder bleiben gesperrt.</p>}
      <label>Angabe<select value={attributeKey} onChange={(event) => setAttributeKey(event.target.value)}>{fields.map((field) => <option key={field.attributeKey} value={field.attributeKey}>{field.label}</option>)}</select></label>
      <label>Wissensstand<select value={knowledgeState} onChange={(event) => setKnowledgeState(event.target.value)}><option value="KNOWN_VALUE">Bekannter Wert</option><option value="UNKNOWN">Unbekannt</option></select></label>
      {knowledgeState === "KNOWN_VALUE" && <label>Wert als JSON<textarea value={valueText} onChange={(event) => setValueText(event.target.value)} aria-label="Wert als JSON" /></label>}
      {attributeKey === "state.current" && <label>Gültig bis<input type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>}
      <button type="button" disabled={busy || !attributeKey} onClick={() => void run(save)}>Korrektur speichern und Reader prüfen</button>
    </>}
    {message && <p role={messageIsError ? "alert" : "status"}>{message}</p>}
  </section>;
}
