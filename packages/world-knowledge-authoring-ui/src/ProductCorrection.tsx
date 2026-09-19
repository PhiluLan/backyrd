"use client";

import { useState } from "react";
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

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const messageOf = (error: unknown) => error instanceof Error ? error.message : "Die Korrektur ist fehlgeschlagen.";

/** Uses the existing append-only World claim RPCs and canonical rebuild path. */
export function WorldProductCorrection({ client, rebuild }: {
  client: WorldAuthoringClient;
  rebuild(spotId: string, idempotencyKey: string): Promise<unknown>;
}) {
  const [spotId, setSpotId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [attributeKey, setAttributeKey] = useState("");
  const [knowledgeState, setKnowledgeState] = useState("KNOWN_VALUE");
  const [valueText, setValueText] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (id: string) => {
    if (!uuid.test(id)) throw new Error("Bitte eine gültige Spot-ID eingeben.");
    const { data, error } = await client.rpc<Detail>("world_product_authoring_detail_v1", { p_spot_id: id });
    if (error || !data || data.contractVersion !== "backyrd.world-knowledge.product-authoring-detail@1.0" || data.spotId !== id || data.status !== "approved") {
      throw new Error(error?.message ?? "Der freigegebene Spot ist nicht verfügbar oder du bist nicht berechtigt.");
    }
    setDetail(data);
    setAttributeKey((current) => data.actor.allowedAttributeKeys.includes(current) ? current : data.actor.allowedAttributeKeys[0] ?? "");
    return data;
  };
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await task(); } catch (error) { setMessage(messageOf(error)); }
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
    if (error) throw new Error(error.message);
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
    <label>Spot-ID<input value={spotId} onChange={(event) => { setSpotId(event.target.value); setDetail(null); }} aria-label="Spot-ID" /></label>
    <button type="button" disabled={busy} onClick={() => void run(async () => { await load(spotId); })}>Spot laden</button>
    {detail && <>
      <p>{detail.name} · {detail.status} · Reader {detail.manifest?.manifestHash ?? "noch kein Snapshot"}</p>
      {detail.openConflicts.length > 0 && <p role="alert">{detail.openConflicts.length} offene Konflikte; betroffene Felder bleiben gesperrt.</p>}
      <label>Angabe<select value={attributeKey} onChange={(event) => setAttributeKey(event.target.value)}>{fields.map((field) => <option key={field.attributeKey} value={field.attributeKey}>{field.label}</option>)}</select></label>
      <label>Wissensstand<select value={knowledgeState} onChange={(event) => setKnowledgeState(event.target.value)}><option value="KNOWN_VALUE">Bekannter Wert</option><option value="UNKNOWN">Unbekannt</option></select></label>
      {knowledgeState === "KNOWN_VALUE" && <label>Wert als JSON<textarea value={valueText} onChange={(event) => setValueText(event.target.value)} aria-label="Wert als JSON" /></label>}
      {attributeKey === "state.current" && <label>Gültig bis<input type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>}
      <button type="button" disabled={busy || !attributeKey} onClick={() => void run(save)}>Korrektur speichern und Reader prüfen</button>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
