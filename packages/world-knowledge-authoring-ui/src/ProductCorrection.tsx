"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  AUTHORING_FIELDS, AUTHORING_STEPS, getAuthoringFieldsForContext,
  validateAuthoringSubmission, type AuthoringField,
} from "@backyrd/world-knowledge-core";
import type { RpcResult, WorldAuthoringClient } from "./session";

type Answer = {
  claimId: string;
  knowledgeState: string;
  value: unknown;
  validUntil?: string | null;
  observedAt?: string;
  confirmationDueAt?: string;
};
type Detail = {
  contractVersion: string;
  spotId: string;
  name: string;
  status: string;
  actor: { role: "ADMIN" | "VERIFIED_OWNER"; allowedAttributeKeys: string[] };
  answers: Record<string, Answer>;
  openConflicts: Array<{ class: string; attributeKey: string; reasonCodes: string[] }>;
  manifest: null | { manifestHash: string; worldSnapshot: unknown };
};
type SnapshotConflict = { severity?: string; attributeKeys?: string[] };
const snapshotConflicts = (detail: Detail | null): SnapshotConflict[] => {
  const snapshot = detail?.manifest?.worldSnapshot;
  if (!snapshot || typeof snapshot !== "object" || !("conflicts" in snapshot)) return [];
  const conflicts = snapshot.conflicts;
  return Array.isArray(conflicts) ? conflicts.filter((item): item is SnapshotConflict =>
    item !== null && typeof item === "object" && Array.isArray(item.attributeKeys)) : [];
};
export type ProductFieldInputProps = {
  field: AuthoringField;
  answer?: Answer;
  candidate?: { candidateId: string; value: unknown };
  applicability?: string;
  referenceValue?: unknown;
  onSave(state: string, value: unknown, validUntil?: string): Promise<void>;
  onSaveCandidate?(value: readonly string[]): Promise<void>;
  onApplicability?(value: "NOT_APPLICABLE" | "APPLICABLE"): Promise<void>;
  onConfirm?(): Promise<void>;
  onError(error: string | null): void;
  disabled: boolean;
  disabledReason?: string;
};
export type ProductCorrectionProps = {
  client: WorldAuthoringClient;
  rebuild(spotId: string, idempotencyKey: string): Promise<unknown>;
  search?: (query: string) => Promise<ProductAdminSpotSearch>;
  addressPicker?: ComponentType<{ disabled: boolean; onSelect(value: ProductAddressSelection | null): void }>;
  initialSpotId?: string;
};
export type ProductAddressSelection = { addressLine1: string; locality: string; countryCode: string; latitude: number; longitude: number };
export type ProductAdminSpotSearch = {
  contractVersion: "backyrd.world-knowledge.product-admin-spot-search@1.0";
  spots: Array<{ spotId: string; name: string; city: string | null }>;
  hasMore: boolean;
};
type CatalogCoverage = {
  contractVersion: "backyrd.world-knowledge.approved-catalog-coverage@1.0";
  approved: number;
  withClaims: number;
  withSnapshots: number;
  missingCity: number;
  authoringActive: boolean;
};
type CatalogBatch = {
  contractVersion: "backyrd.world-knowledge.approved-catalog-bootstrap@1.0";
  processed: number;
  claimsCreated: number;
  snapshotsRebuilt: number;
  nextCursor: string | null;
  complete: boolean;
};
type SearchState = "LOADING" | "RESULTS" | "EMPTY" | "BACKEND_NOT_PUBLISHED" | "FORBIDDEN" | "UNAVAILABLE";
type PresentationUse = { attributeKey:string; mobileVisible:boolean; webVisible:boolean; publicAllowed:boolean; engineAuthorization:"AUTHORIZED"|"EXPLANATION_ONLY" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorCode = (error: unknown) => error instanceof Error ? error.message : "";
const messageOf = (error: unknown) => {
  const code = errorCode(error);
  if (code === "WORLD_BACKEND_NOT_PUBLISHED" || /PGRST202|Could not find the function|does not exist/i.test(code)) return "World Knowledge ist hier noch nicht vollständig verfügbar.";
  if (code.includes("world_product_authoring_authority_off") || code.includes("world_product_admin_authoring_off")) return "Die Spot-Pflege ist derzeit ausgeschaltet. Deine Eingaben bleiben erhalten.";
  if (code === "WORLD_ADMIN_FORBIDDEN" || code === "admin_required") return "Du bist für diesen Spot nicht berechtigt.";
  if (code === "WORLD_SERVICE_UNAVAILABLE" || code.startsWith("world_product_reader_")) return "World Knowledge ist derzeit nicht erreichbar. Deine Eingaben bleiben erhalten.";
  return code.startsWith("Bitte ") || code.startsWith("Der ") || code.startsWith("Die ") || code.startsWith("Für ") || code.startsWith("World ")
    ? code : "Die Aktion konnte nicht abgeschlossen werden. Deine Eingaben bleiben erhalten.";
};
const backendMissing = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST202" || error?.code === "42883" || error?.code === "42P01";
const safeRpcMessage = (error: { code?: string; message?: string } | null): string => {
  if (backendMissing(error)) return "World Knowledge ist hier noch nicht vollständig verfügbar.";
  if (error?.message?.includes("world_product_authoring_authority_off") || error?.message?.includes("world_product_admin_authoring_off")) return "Die Spot-Pflege ist derzeit ausgeschaltet. Deine Eingaben bleiben erhalten.";
  if (error?.code === "42501") return "Du bist für diesen Spot nicht berechtigt.";
  if (error?.code === "40001" || error?.code === "23505" || error?.message?.includes("conflict")) return "Die Angabe hat sich zwischenzeitlich geändert. Bitte lade den Spot erneut und prüfe den Konflikt.";
  return "World Knowledge ist derzeit nicht erreichbar. Deine Eingaben bleiben erhalten.";
};
const searchFailure = (error: unknown): SearchState => {
  const code = errorCode(error);
  return code === "WORLD_BACKEND_NOT_PUBLISHED" ? "BACKEND_NOT_PUBLISHED"
    : code === "WORLD_ADMIN_FORBIDDEN" || code === "admin_required" ? "FORBIDDEN" : "UNAVAILABLE";
};
const fieldLabel = (key: string) => AUTHORING_FIELDS.find((field) => field.attributeKey === key)?.label ?? "Betroffene Angabe";
const valueLabel = (field: AuthoringField, value: unknown): string => {
  if (value === null || value === undefined) return "Noch keine Angabe";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "string") return field.allowedValues.find((option) => option.value === value)?.label ?? value;
  if (typeof value === "number") return new Intl.NumberFormat("de-CH").format(value);
  if (Array.isArray(value)) return value.length ? value.map((entry) => typeof entry === "string"
    ? field.allowedValues.find((option) => option.value === entry)?.label ?? entry : "strukturierte Angabe").join(", ") : "Keine Einträge";
  return "Strukturierte Angabe";
};

/** Product authoring uses the same typed editors as the local Founder workflow,
 * but only server-authorized keys and the Product append-only RPCs. */
export function WorldProductCorrection({ client, rebuild, search, addressPicker: AddressPicker, initialSpotId, FieldEditor }: ProductCorrectionProps & {
  FieldEditor: ComponentType<ProductFieldInputProps>;
}) {
  const [spotId, setSpotId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ProductAdminSpotSearch["spots"]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("LOADING");
  const [coverage, setCoverage] = useState<CatalogCoverage | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogProgress, setCatalogProgress] = useState(0);
  const [catalogError, setCatalogError] = useState("");
  const [addressSelection, setAddressSelection] = useState<ProductAddressSelection | null>(null);
  const [spotPickerOpen, setSpotPickerOpen] = useState(true);
  const [presentationUse, setPresentationUse] = useState<Record<string,PresentationUse>>({});
  const searchSequence = useRef(0);
  const loadSequence = useRef(0);
  const initialSpotLoaded = useRef(false);

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
    const timer = window.setTimeout(() => { void findSpots(query.trim()); }, query.trim() ? 300 : 0);
    return () => { window.clearTimeout(timer); searchSequence.current += 1; };
  }, [findSpots, query, search]);

  const refreshCoverage = useCallback(async () => {
    if (!search) return;
    const { data, error } = await client.rpc<CatalogCoverage>("world_product_admin_catalog_coverage_v1");
    if (error || !data || data.contractVersion !== "backyrd.world-knowledge.approved-catalog-coverage@1.0") {
      setCatalogError(error ? safeRpcMessage(error) : "Der Bestandsstatus konnte nicht geprüft werden.");
      return;
    }
    setCoverage(data);
    setCatalogError("");
  }, [client, search]);
  useEffect(() => { void refreshCoverage(); }, [refreshCoverage]);
  useEffect(() => {
    let active = true;
    void client.rpc<{fields:PresentationUse[]}>("admin_spot_presentation_policy_v1").then(({data,error}) => {
      if (!active || error || !data || !Array.isArray(data.fields)) return;
      setPresentationUse(Object.fromEntries(data.fields.map((field) => [field.attributeKey,field])));
    });
    return () => { active = false; };
  }, [client]);

  const bootstrapCatalog = async () => {
    if (!coverage?.authoringActive || catalogBusy) return;
    setCatalogBusy(true);
    setCatalogError("");
    setCatalogProgress(0);
    let cursor: string | null = null;
    try {
      // Every batch commits independently. Restarting after an interruption is
      // safe: the backend skips existing claims and current snapshots.
      for (let batchNumber = 0; batchNumber < 1000; batchNumber += 1) {
        const response: RpcResult<CatalogBatch> = await client.rpc<CatalogBatch>("world_product_admin_bootstrap_catalog_v1", {
          p_cursor: cursor,
          p_limit: 10,
          p_acknowledgement: "APPROVED_CATALOG_BASELINE_ONLY",
        });
        const { data, error } = response;
        if (error || !data || data.contractVersion !== "backyrd.world-knowledge.approved-catalog-bootstrap@1.0"
          || typeof data.processed !== "number" || typeof data.complete !== "boolean"
          || (data.processed > 0 && (!data.nextCursor || data.nextCursor === cursor))) {
          throw new Error(error ? safeRpcMessage(error) : "Der Bestandsabgleich wurde unterbrochen. Du kannst ihn fortsetzen.");
        }
        setCatalogProgress((count) => count + data.processed);
        if (data.complete) break;
        cursor = data.nextCursor;
        if (batchNumber === 999) throw new Error("Der Bestandsabgleich erreichte seine Sicherheitsgrenze. Bitte Status prüfen.");
      }
      await refreshCoverage();
      if (detail) void selectSpot(detail.spotId);
    } catch (error) {
      const failure = messageOf(error);
      await refreshCoverage();
      setCatalogError(failure);
    } finally {
      setCatalogBusy(false);
    }
  };

  const readDetail = async (id: string) => {
    if (!uuid.test(id)) throw new Error("Bitte eine gültige Spot-ID eingeben.");
    const { data, error } = await client.rpc<Detail>("world_product_authoring_detail_v1", { p_spot_id: id });
    if (error || !data || data.contractVersion !== "backyrd.world-knowledge.product-authoring-detail@1.0"
      || data.spotId !== id || data.status !== "approved" || !Array.isArray(data.actor?.allowedAttributeKeys)
      || !data.answers || !Array.isArray(data.openConflicts)) {
      throw new Error(error ? safeRpcMessage(error) : "Der freigegebene Spot ist nicht verfügbar oder du bist nicht berechtigt.");
    }
    return data;
  };
  const selectSpot = async (id: string) => {
    const sequence = ++loadSequence.current;
    setBusy(true);
    setMessage("");
    setDetail(null);
    try {
      const loaded = await readDetail(id);
      if (sequence !== loadSequence.current) return;
      setDetail(loaded);
      setSpotId(id);
      setStep(0);
      setAddressSelection(null);
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      setMessage(messageOf(error));
      setMessageIsError(true);
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (!initialSpotId || initialSpotLoaded.current) return;
    initialSpotLoaded.current = true;
    setSpotPickerOpen(false);
    void selectSpot(initialSpotId);
  // The editor intentionally binds once to the route identity. Navigating to a
  // different spot creates a new page instance rather than silently switching
  // an in-progress draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSpotId]);
  const saveField = async (field: AuthoringField, knowledgeState: string, value: unknown, validUntil?: string) => {
    if (!detail || !detail.actor.allowedAttributeKeys.includes(field.attributeKey)) throw new Error("Dieses Feld ist nicht freigegeben.");
    const validated = validateAuthoringSubmission(field.attributeKey, knowledgeState, value);
    if (!validated.ok) throw new Error(validated.message);
    if (field.attributeKey === "state.current" && !validUntil) throw new Error("Der aktuelle Zustand benötigt ein Gültig-bis-Datum.");
    const key = `product-correction:${crypto.randomUUID()}`;
    const { error } = await client.rpc(detail.actor.role === "ADMIN" ? "world_product_admin_submit_claim_v1" : "world_product_owner_submit_claim_v1", {
      p_spot_id: detail.spotId,
      p_attribute_key: field.attributeKey,
      p_knowledge_state: knowledgeState,
      p_value: validated.value,
      p_observed_at: new Date().toISOString(),
      p_valid_from: null,
      p_valid_until: validUntil ?? null,
      p_visibility: "PUBLIC",
      p_supersedes_claim_id: detail.answers[field.attributeKey]?.claimId ?? null,
      p_idempotency_key: key,
    });
    if (error) throw new Error(safeRpcMessage(error));
    let result: { manifestHash?: string; readerSnapshot?: unknown; openConflicts?: unknown[] };
    try {
      result = await rebuild(detail.spotId, `${key}:rebuild`) as typeof result;
    } catch {
      throw new Error("Die Angabe wurde gespeichert, aber die Datenvorschau konnte nicht bestätigt werden. Bitte lade den Spot neu.");
    }
    if (!result?.manifestHash || !result.readerSnapshot) throw new Error("Die Angabe wurde gespeichert, aber der World-Reader hat die Datenvorschau nicht bestätigt. Bitte lade den Spot neu.");
    const refreshed = await readDetail(detail.spotId);
    if (refreshed.manifest?.manifestHash !== result.manifestHash) throw new Error("Die Angabe wurde gespeichert, aber Datenvorschau und Spot-Ansicht stimmen nicht überein. Bitte lade den Spot neu.");
    setDetail(refreshed);
    const blocking = snapshotConflicts(refreshed).some((conflict) =>
      conflict.severity === "BLOCKING" && conflict.attributeKeys?.includes(field.attributeKey));
    setMessage(blocking
      ? "Angabe gespeichert. Der World-Reader zeigt für dieses Feld weiterhin einen echten Widerspruch; bitte prüfe die Belege."
      : "Angabe gespeichert, für Decision vNext bestätigt und in das App-Lesemodell übernommen.");
    setMessageIsError(blocking);
  };
  const saveSelectedAddress = async () => {
    if (!detail || !addressSelection) return;
    const values: Array<[string, string | number]> = [
      ["location.address_line1", addressSelection.addressLine1],
      ["location.locality", addressSelection.locality],
      ["location.country_code", addressSelection.countryCode],
      ["location.latitude", addressSelection.latitude],
      ["location.longitude", addressSelection.longitude],
    ];
    if (!values.every(([key]) => detail.actor.allowedAttributeKeys.includes(key))) {
      setMessage("Für eine vollständige Adressübernahme fehlt die Berechtigung für mindestens ein Ortsfeld.");
      setMessageIsError(true);
      return;
    }
    setBusy(true);
    try {
      for (const [key, value] of values) {
        if (detail.answers[key]?.knowledgeState === "KNOWN_VALUE" && detail.answers[key]?.value === value) continue;
        const field = AUTHORING_FIELDS.find((item) => item.attributeKey === key);
        if (!field) throw new Error(`Das Ortsfeld ${key} ist nicht verfügbar.`);
        await saveField(field, "KNOWN_VALUE", value);
      }
      setAddressSelection(null);
      setMessage("Adresse und Koordinaten gespeichert und im World-Reader geprüft.");
      setMessageIsError(false);
    } catch (error) {
      setMessage(`${messageOf(error)} Bereits gespeicherte Ortsangaben bleiben erhalten; bitte den Spot neu laden und prüfen.`);
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  };
  const current = AUTHORING_STEPS[step]!;
  const primaryCategory = detail?.answers["classification.primary_category"]?.value;
  const fields = getAuthoringFieldsForContext(current.id, typeof primaryCategory === "string" ? primaryCategory : undefined)
    .filter((field) => detail?.actor.allowedAttributeKeys.includes(field.attributeKey))
    .map((field) => ({ ...field, allowedValues: field.allowedValues.filter((option) => option.state !== "NOT_CONFIGURED") }));
  const known = Object.values(detail?.answers ?? {}).filter((answer) => answer.knowledgeState !== "UNKNOWN").length;
  const unknown = Object.values(detail?.answers ?? {}).filter((answer) => answer.knowledgeState === "UNKNOWN").length;
  const unresolved = snapshotConflicts(detail).filter((conflict) => conflict.severity === "BLOCKING").length;
  const reviewNotices = detail?.openConflicts.length ?? 0;
  const goToStep = (index: number) => {
    setStep(Math.max(0, Math.min(AUTHORING_STEPS.length - 1, index)));
    document.querySelector(".wk-product-app .wk-main")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const priorityFields = fields.filter((field) => field.requirementClass !== "OPTIONAL");
  const optionalFields = fields.filter((field) => field.requirementClass === "OPTIONAL");
  const renderFieldGroups = (items: AuthoringField[]) => [...new Set(items.map((field) => field.group))].map((group) =>
    <section className="wk-group" key={group}><h3>{group}</h3>{items.filter((field) => field.group === group).map((field) =>
      <div className="wk-field-with-usage" key={`${detail?.spotId}:${field.attributeKey}`}><div className="wk-field-usage" aria-label="Verwendung dieser Angabe"><span className="decision">{presentationUse[field.attributeKey]?.engineAuthorization === "EXPLANATION_ONLY" ? "vNext: Erklärung" : "vNext: fachlich nutzbar"}</span><span className={presentationUse[field.attributeKey]?.mobileVisible ? "visible" : "hidden"}>App: {presentationUse[field.attributeKey]?.mobileVisible ? "sichtbar" : "ausgeblendet"}</span><span className={presentationUse[field.attributeKey]?.webVisible ? "visible" : "hidden"}>Browser: {presentationUse[field.attributeKey]?.webVisible ? "sichtbar" : "ausgeblendet"}</span></div><FieldEditor field={field} answer={detail?.answers[field.attributeKey]}
        referenceValue={field.attributeKey === "hours.kitchen" ? detail?.answers["hours.regular"]?.value : undefined}
        disabled={busy}
        disabledReason={busy ? "Ein anderer Spot wird gerade geladen." : undefined}
        onSave={(state, value, until) => saveField(field, state, value, until)}
        onError={(error) => { if (error) { setMessage(error); setMessageIsError(true); } }} /></div>)}</section>);

  return <div className="wk-app wk-product-app">
    <header className="wk-header">
      <div><span className="wk-eyebrow">WORLD KNOWLEDGE · SPOT-PFLEGE</span><h1>{detail?.name ?? "Spots pflegen"}</h1>
        <p>{detail ? `${known} bestätigte Angaben · ${unknown} bewusst unbekannt · ${unresolved} echte Konflikte · ${reviewNotices} Prüfhinweise` : "Wähle einen Spot und pflege seine Angaben Schritt für Schritt."}</p></div>
      <div className="wk-header-actions"><span className="wk-status">{detail?.manifest ? "● Datenvorschau vorhanden" : "● Noch keine Datenvorschau"}</span></div>
    </header>
    {search && <details className="wk-panel wk-catalog-details" aria-label="World-Bestandsabgleich">
      <summary><strong>Bestand im Wissensspeicher</strong><span>{coverage ? `${coverage.withClaims} von ${coverage.approved} Spots mit Claims · ${coverage.withSnapshots} Datenvorschauen` : "Bestandsstatus prüfen"}</span></summary>
      {coverage && <p>{coverage.withClaims} von {coverage.approved} freigegebenen Spots haben Claims; {coverage.withSnapshots} haben eine geprüfte Datenvorschau.</p>}
      <p>Der Erstabgleich übernimmt Namen und vorhandene Orte aus dem freigegebenen Spot-Bestand. Fehlende Orte sowie Hauptzweck und Kategorie bleiben ausdrücklich unbekannt. Bestehende Angaben werden nicht überschrieben; die übernommenen Angaben solltest du anschließend prüfen.</p>
      {coverage?.missingCity ? <p>{coverage.missingCity} Spots haben noch keinen Ort und benötigen eine manuelle Ergänzung.</p> : null}
      <button type="button" disabled={catalogBusy || !coverage?.authoringActive || (coverage.withClaims === coverage.approved && coverage.withSnapshots === coverage.approved)}
        onClick={() => void bootstrapCatalog()}>{catalogBusy ? `Abgleich läuft · ${catalogProgress} geprüft` : "Freigegebene Spots in World übernehmen"}</button>
      {coverage && !coverage.authoringActive && <p role="status">Die Spot-Pflege ist derzeit ausgeschaltet; der Bestand kann erst nach der separaten World-Freigabe übernommen werden.</p>}
      {catalogError && <p role="alert">{catalogError}</p>}
    </details>}
    <div className="wk-layout"><aside className="wk-sidebar">
      <details className="wk-spot-picker" open={spotPickerOpen} onToggle={(event) => setSpotPickerOpen(event.currentTarget.open)}><summary><span>Spot auswählen</span><strong>{detail?.name ?? "Suche öffnen"}</strong></summary><div className="wk-spot-picker-content">
      {search ? <div className="wk-product-search">
        <form onSubmit={(event) => { event.preventDefault(); void findSpots(query); }}>
          <label>Spot nach Namen suchen<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name oder Ort" aria-label="Spot nach Namen suchen" autoComplete="off" /></label>
          <button type="submit" disabled={searchState === "LOADING"}>Suchen</button>
        </form>
        <small>Die Suche aktualisiert sich beim Tippen.</small>
        {searchState === "LOADING" && <p role="status">Spots werden geladen …</p>}
        {searchState === "BACKEND_NOT_PUBLISHED" && <p role="alert">World Knowledge hier noch nicht verfügbar.</p>}
        {searchState === "FORBIDDEN" && <p role="alert">Du bist für die Spot-Suche nicht berechtigt.</p>}
        {searchState === "UNAVAILABLE" && <p role="alert">Die Spot-Suche ist derzeit nicht erreichbar. Deine Eingabe bleibt erhalten.</p>}
        {searchState === "EMPTY" && <p role="status">Keine freigegebenen Spots zu dieser Suche gefunden.</p>}
        {searchState === "RESULTS" && <div className="wk-spot-list" aria-label="Gefundene Spots">
          {matches.map((spot) => <button type="button" className={spot.spotId === spotId ? "selected" : ""} key={spot.spotId} disabled={busy}
            onClick={() => void selectSpot(spot.spotId)}><strong>{spot.name}</strong><span>{spot.city ?? "Ort nicht angegeben"}</span></button>)}
          {hasMore && <p>Weitere Spots vorhanden – bitte die Suche verfeinern.</p>}
        </div>}
      </div> : <div className="wk-product-search"><label>Spot-ID<input className="wk-input" value={spotId} onChange={(event) => setSpotId(event.target.value)} /></label>
        <button type="button" disabled={busy} onClick={() => void selectSpot(spotId)}>Spot laden</button></div>}</div></details>
      {detail && <nav aria-label="Bereiche der Spot-Pflege">{AUTHORING_STEPS.map((item, index) => {
        const sectionFields = item.attributeKeys.filter((key) => detail.actor.allowedAttributeKeys.includes(key));
        const completed = sectionFields.filter((key) => detail.answers[key]).length;
        return <button type="button" className={step === index ? "selected" : ""} key={item.id} onClick={() => goToStep(index)}>
          <b>{index + 1}</b><span>{item.title}<small>{item.id === "review" ? "Zusammenfassung" : `${completed} von ${sectionFields.length} Angaben erfasst`}</small></span>
        </button>;
      })}</nav>}
    </aside>
    <main className="wk-main">{!detail ? <section className="wk-panel"><h2>Spot auswählen</h2><p>Suche links nach einem freigegebenen Spot. Anschließend kannst du alle für deine Rolle freigegebenen Angaben direkt und ohne JSON-Eingabe pflegen.</p></section>
      : <section className="wk-panel"><div className="wk-step-progress" aria-label={`Bereich ${step + 1} von ${AUTHORING_STEPS.length}`}><span style={{ width: `${((step + 1) / AUTHORING_STEPS.length) * 100}%` }} /></div><div className="wk-step-title"><span>Bereich {step + 1} von {AUTHORING_STEPS.length} · {fields.filter((field) => detail.answers[field.attributeKey]).length} von {fields.length} Angaben gespeichert</span><h2>{current.title}</h2><p>{current.explanation}</p>
        {detail.actor.role === "ADMIN" && <p>Ein übernommenes Basisprofil ersetzt keine fachliche Prüfung. Ergänze insbesondere Hauptzweck, Kategorie, Besuchssituation, Öffnung und Zugänglichkeit nur mit belegten Angaben.</p>}</div>
        {reviewNotices > 0 && <div className="wk-note"><strong>{reviewNotices} offene {reviewNotices === 1 ? "Prüfnotiz" : "Prüfnotizen"}</strong>
          <p>Diese Notizen stammen aus der Claim-Prüfung und sperren die Spot-Pflege nicht. Du kannst eine Angabe korrigieren; maßgeblich ist der aktuelle World-Reader.</p>
          <ul>{detail.openConflicts.map((conflict, index) => <li key={index}>{fieldLabel(conflict.attributeKey)}</li>)}</ul></div>}
        {unresolved > 0 && <div className="wk-error-summary" role="alert"><strong>{unresolved} echte {unresolved === 1 ? "Angabe" : "Angaben"} mit Widerspruch im World-Reader</strong>
          <p>Die betroffenen Angaben können korrigiert werden; bis zur Klärung werden sie nicht als gesichert ausgegeben.</p></div>}
        {current.id === "basics" && AddressPicker && detail.actor.role === "ADMIN" && <div className="wk-address-assist"><h3>Adresse suchen statt Koordinaten eintippen</h3><p>Nutze die gleiche Adresssuche wie beim Anlegen eines Spots. Erst nach deiner Auswahl und Bestätigung werden Adresse, Ort und Position als World-Angaben gespeichert.</p><AddressPicker disabled={busy} onSelect={setAddressSelection} />{addressSelection && <div className="wk-address-selection"><strong>{addressSelection.addressLine1}, {addressSelection.locality}</strong><span>Position: {addressSelection.latitude.toFixed(6)}, {addressSelection.longitude.toFixed(6)}</span><button type="button" disabled={busy} onClick={() => void saveSelectedAddress()}>{busy ? "Adresse wird geprüft …" : "Adresse und Position speichern"}</button><button type="button" className="wk-secondary" disabled={busy} onClick={() => setAddressSelection(null)}>Auswahl verwerfen</button></div>}</div>}
        {current.id === "review" ? <div className="wk-review">
          <article><b>Bestätigt</b><strong>{known}</strong><span>gespeicherte Angaben</span></article>
          <article><b>Bewusst unbekannt</b><strong>{unknown}</strong><span>weder Ja noch Nein</span></article>
          <article><b>Reader-Konflikte</b><strong>{unresolved}</strong><span>fachlich zu prüfen</span></article>
          <article><b>Prüfnotizen</b><strong>{reviewNotices}</strong><span>blockieren die Bearbeitung nicht</span></article>
          <article><b>Datenvorschau</b><strong>{detail.manifest ? "✓" : "—"}</strong><span>{detail.manifest ? "kanonisch vorhanden" : "noch nicht bestätigt"}</span></article>
          <section className="wk-preview"><span className="wk-eyebrow">SPOT-PROFIL</span><h2>{detail.name}</h2>
            <p>{typeof detail.answers["description.highlight"]?.value === "string" ? String(detail.answers["description.highlight"].value) : "Noch keine öffentliche Beschreibung."}</p>
            <div className="wk-preview-grid">{["classification.primary_category", "purpose.primary_visit", "operation.price_level"].map((key) => {
              const field = AUTHORING_FIELDS.find((item) => item.attributeKey === key);
              return field ? <div key={key}><small>{field.label}</small><b>{detail.answers[key] ? valueLabel(field, detail.answers[key].value) : "Noch offen"}</b></div> : null;
            })}</div></section>
          <section className="wk-note"><strong>{detail.manifest ? "Datenvorschau vorhanden" : "Noch keine Datenvorschau"}</strong>
            <p>{detail.manifest ? "Gespeicherte Änderungen werden nach jedem Speichern über den kanonischen Reader geprüft." : "Speichere eine Angabe. Danach wird der Spot automatisch neu aufgebaut und geprüft."}</p></section>
        </div> : fields.length ? <div className="wk-fields">{renderFieldGroups(priorityFields)}{optionalFields.length > 0 && <details className="wk-optional-fields"><summary><span><strong>Weitere Angaben</strong><small>{optionalFields.filter((field) => detail.answers[field.attributeKey]).length} von {optionalFields.length} optionalen Angaben gespeichert</small></span><b>{optionalFields.length}</b></summary><div>{renderFieldGroups(optionalFields)}</div></details>}</div>
          : <div className="wk-note"><strong>Für diesen Spot keine bearbeitbaren Angaben in diesem Bereich.</strong><p>Du kannst zum nächsten Bereich wechseln.</p></div>}
        <footer className="wk-footer"><button type="button" className="wk-secondary" disabled={step === 0} onClick={() => goToStep(step - 1)}>Zurück</button>
          <span>Jede Änderung wird einzeln gespeichert und danach im World-Reader geprüft.</span>
          <button type="button" disabled={step === AUTHORING_STEPS.length - 1} onClick={() => goToStep(step + 1)}>Weiter →</button></footer>
      </section>}</main></div>
    {message && <div className={`wk-toast ${messageIsError ? "error" : "success"}`} role={messageIsError ? "alert" : "status"}>{message}
      <button type="button" aria-label="Meldung schließen" onClick={() => setMessage("")}>×</button></div>}
  </div>;
}
