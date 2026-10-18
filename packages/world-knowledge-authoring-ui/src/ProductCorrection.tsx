"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  AUTHORING_FIELDS, formatPriceOptionsSummary, AUTHORING_STEPS, getAuthoringFieldsForContext,
  validateAuthoringSubmission, parseDiscoveryProfile, parseExperienceProfile, evaluateAuthoringReadiness, type DiscoveryProfile, type AuthoringField,
} from "@backyrd/world-knowledge-core/browser";
import { sectionStatus } from "./section-status";
import type { ExperienceWorkspace } from "./experience-authoring";
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
  actor: { role: "ADMIN" | "VERIFIED_OWNER"; entitlement?: "ADMIN" | "OWNER_BASIC" | "OWNER_PRO"; allowedAttributeKeys: string[] };
  answers: Record<string, Answer>;
  openConflicts: Array<{ class: string; attributeKey: string | null; reasonCodes: string[] }>;
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
function ProfileStatus({detail, onOpen}: {detail: Detail; onOpen(key: string): void}) {
  const category = detail.answers["classification.primary_category"]?.value;
  const guidance = {placeTypes: detail.answers["classification.place_types"]?.value, onsiteOfferings: detail.answers["offering.onsite"]?.value};
  const relevant = AUTHORING_STEPS.flatMap(step => getAuthoringFieldsForContext(step.id, category, guidance))
    .filter(field => detail.actor.allowedAttributeKeys.includes(field.attributeKey) && field.control !== "DISCOVERY_PROFILE");
  const allowed = new Set(relevant.map(field => field.attributeKey));
  const required = evaluateAuthoringReadiness({answers: detail.answers}).blocking.filter(issue => allowed.has(issue.attributeKey));
  const missing = relevant.filter(field => !detail.answers[field.attributeKey] && !required.some(issue => issue.attributeKey === field.attributeKey));
  const unknown = relevant.filter(field => detail.answers[field.attributeKey]?.knowledgeState === "UNKNOWN");
  const conflicts = snapshotConflicts(detail);
  const groups = new Map<string, {attributeKey: string; reason: string; count: number}>();
  for (const note of detail.openConflicts) {
    const reason = note.reasonCodes.includes("CONCURRENT_AUTHORITATIVE_CONFLICT")
      ? "Unterschiedliche bestätigte Fassungen wurden innerhalb von fünf Minuten gespeichert. Dadurch wurde eine Prüfung angelegt; das ist kein Hinweis auf ein leeres Feld."
      : note.class === "CONTENT_SAFETY" ? "Eine gespeicherte Angabe wartet auf eine Inhaltsprüfung."
      : note.class === "CONFIRMATION_DUE" ? "Eine Angabe soll erneut bestätigt werden."
      : "Zu dieser Angabe liegt ein separater Prüfauftrag vor. Die genaue Ursache ist hier nicht verfügbar.";
    const id = JSON.stringify([note.attributeKey, note.class, [...note.reasonCodes].sort()]);
    const group = groups.get(id);
    if (group) group.count += 1;
    else groups.set(id, {attributeKey: note.attributeKey ?? "", reason, count: 1});
  }
  return <section className="wk-profile-status" aria-label="Profilstatus und offene Angaben">
    <h2>Was ist noch offen?</h2>
    <p><strong>{required.length ? `${required.length} ${required.length === 1 ? "Pflichtangabe oder Zuordnung" : "Pflichtangaben oder Zuordnungen"} prüfen` : "Grundlegende Pflichtangaben vorhanden"}</strong></p>
    <p>{detail.manifest ? conflicts.length ? `${conflicts.length} ${conflicts.length === 1 ? "Widerspruch" : "Widersprüche"} in der aktuellen Datenansicht.` : "Die aktuelle Datenansicht enthält keine Widersprüche." : "Die aktuelle Datenansicht wurde noch nicht erstellt."} Das bestätigt keine vollständige inhaltliche Prüfung aller Angebote und Bereiche.</p>
    {required.length > 0 && <ul>{required.map(issue => <li key={issue.id}><strong>{issue.label}</strong>: {issue.explanation} <button type="button" className="wk-secondary" onClick={() => onOpen(issue.attributeKey)}>Angabe prüfen: {issue.label}</button></li>)}</ul>}
    <details><summary>{missing.length} optionale Felder ohne allgemeinen Eintrag · {unknown.length} bewusst unbekannt</summary>
      <p>Optionale Felder sind keine Speicherfehler. Angaben können bereits bei einem Angebot oder Bereich vorhanden sein; du musst sie hier nicht wiederholen. Ergänze nur, was für den gesamten Spot gilt und verlässlich bekannt ist. Preise, Zeiten und Regeln einzelner Angebote prüfst du in deren Bearbeitung.</p>
      <ul>{[...missing, ...unknown].map(field => <li key={field.attributeKey}><span>{field.label} — {detail.answers[field.attributeKey]?.knowledgeState === "UNKNOWN" ? "bewusst unbekannt" : "kein allgemeiner Eintrag"}</span><button type="button" className="wk-secondary" onClick={() => onOpen(field.attributeKey)}>Öffnen: {field.label}</button></li>)}</ul>
    </details>
    {groups.size > 0 && <details className="wk-review-notices" open><summary>{detail.openConflicts.length} {detail.openConflicts.length === 1 ? "separate Prüfnotiz" : "separate Prüfnotizen"} zu {new Set(detail.openConflicts.map(note => note.attributeKey)).size} {new Set(detail.openConflicts.map(note => note.attributeKey)).size === 1 ? "Angabe" : "Angaben"}</summary>
      <p>Prüfnotizen sind keine Liste fehlender Antworten und verhindern das Speichern nicht. Sie bleiben bis zur gesonderten Prüfung offen, auch wenn die aktuelle Datenansicht keinen Widerspruch mehr enthält.</p>
      <ul>{[...groups.entries()].map(([id, group]) => <li key={id}><strong>{fieldLabel(group.attributeKey)}{group.count > 1 ? ` · ${group.count} Prüfnotizen` : ""}</strong><p>{group.reason}</p>{allowed.has(group.attributeKey) ? <button type="button" className="wk-secondary" onClick={() => onOpen(group.attributeKey)}>Angabe prüfen: {fieldLabel(group.attributeKey)}</button> : <span>Diese Angabe ist mit deinem Zugriff nicht bearbeitbar.</span>}</li>)}</ul>
    </details>}
  </section>;
}

export type ProductFieldInputProps = {
  field: AuthoringField;
  answer?: Answer;
  candidate?: { candidateId: string; value: unknown };
  applicability?: string;
  referenceValue?: unknown;
  existingAnswers?: Readonly<Record<string,unknown>>;
  onDraftChange?(dirty:boolean):void;
  onContinue?():void;
  experienceWorkspace?:ExperienceWorkspace;
  onPrepareDiscovery?(sourceText:string):Promise<DiscoveryProfile>;
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
  prepareDiscovery?(spotId:string,sourceText:string):Promise<DiscoveryProfile>;
  rebuild(spotId: string, idempotencyKey: string): Promise<unknown>;
  search?: (query: string) => Promise<ProductAdminSpotSearch>;
  addressPicker?: ComponentType<{ disabled: boolean; onSelect(value: ProductAddressSelection | null): void }>;
  initialSpotId?: string;
  surface?: "ADMIN" | "OWNER";
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
  return code.startsWith("Bitte ") || code.startsWith("Der ") || code.startsWith("Die ") || code.startsWith("Du ") || code.startsWith("Für ") || code.startsWith("World ")
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
  if (field.attributeKey === "operation.price_options") return formatPriceOptionsSummary(value);
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "string") return field.allowedValues.find((option) => option.value === value)?.label ?? value;
  if (typeof value === "number") return new Intl.NumberFormat("de-CH").format(value);
  if (Array.isArray(value)) return value.length ? value.map((entry) => typeof entry === "string"
    ? field.allowedValues.find((option) => option.value === entry)?.label ?? entry : "strukturierte Angabe").join(", ") : "Keine Einträge";
  return "Strukturierte Angabe";
};

const sectionCopy: Record<string, {title:string;description:string;icon:string}> = {
    basics:{title:"Grunddaten & Kontakt",description:"Name, Adresse, Website und öffentliche Kontaktangaben.",icon:"01"},
    classification:{title:"Spottyp & Kategorie",description:"Restaurant, Hotel, Zoo oder mehrere passende Ortstypen auswählen.",icon:"02"},
    discovery:{title:"Angebote",description:"Leistungen wie Essen, Übernachten oder Aktivitäten – mit eigenen Preisen und Zeiten.",icon:"03"},
    areas:{title:"Räume & Bereiche",description:"Innenräume und Aussenflächen beschreiben und den Angeboten zuordnen.",icon:"04"},
    shared:{title:"Gemeinsame Ausstattung & Anreise",description:"Anreise, Parkplätze und Einrichtungen, die für den gesamten Spot gelten.",icon:"05"},
    hours:{title:"Öffnungszeiten",description:"Reguläre Öffnung, Feiertage und abweichende Küchenzeiten.",icon:"06"},
    offering:{title:"Küche & Service",description:"Küchenrichtungen, Spezialitäten, Bedienung und Take-away.",icon:"07"},
    context:{title:"Atmosphäre & Besuch",description:"Stimmung des Spots, Besuchsanlässe und typische Tageszeiten.",icon:"08"},
    price:{title:"Allgemeine Preise & Zahlung",description:"Akzeptierte Zahlungsmittel und allgemeine Preisangaben.",icon:"09"},
    objective:{title:"Platz & Reservierung",description:"Sitzplätze, Gruppengrössen, Reservierungen und Aufenthaltsregeln.",icon:"10"},
    amenities:{title:"Ausstattung & Zugang",description:"Stufenloser Zugang, barrierefreie Einrichtungen, Haustiere und Altersregeln.",icon:"11"},
    review:{title:"Gespeichertes Profil prüfen",description:"Gespeicherte Angaben ansehen und konkrete Prüfhinweise bearbeiten.",icon:"12"},
  };

/** Product authoring uses the same typed editors as the local Founder workflow,
 * but only server-authorized keys and the Product append-only RPCs. */
export function WorldProductCorrection({ client, rebuild, prepareDiscovery, search, addressPicker: AddressPicker, initialSpotId, surface = "ADMIN", FieldEditor }: ProductCorrectionProps & {
  FieldEditor: ComponentType<ProductFieldInputProps>;
}) {
  const [spotId, setSpotId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [step, setStep] = useState(0);
  const [overview,setOverview] = useState(true);
  const [fieldTarget,setFieldTarget] = useState<{key:string}|null>(null);
  useEffect(() => {
    if (!fieldTarget || overview) return;
    const element = document.getElementById(`wk-editor-${fieldTarget.key}`);
    if (!element) return;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    element.focus({preventScroll:true});
    element.scrollIntoView({block:"start"});
  }, [fieldTarget,overview,step]);
  const scopedDraftDirty = useRef(false);
  const fieldDrafts = useRef<Record<string,boolean>>({});
  useEffect(() => {
    const guard=(event:BeforeUnloadEvent)=>{if(scopedDraftDirty.current){event.preventDefault();}};
    window.addEventListener("beforeunload",guard);
    return ()=>window.removeEventListener("beforeunload",guard);
  }, []);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (successTimer.current) clearTimeout(successTimer.current); }, []);
  const showSaveSuccess = (text: string) => {
    if (successTimer.current) clearTimeout(successTimer.current);
    setMessage(text); setMessageIsError(false);
    successTimer.current = setTimeout(() => { setMessage(current => current === text ? "" : current); }, 2000);
  };
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
    if (!search || initialSpotId) return;
    const timer = window.setTimeout(() => { void findSpots(query.trim()); }, query.trim() ? 300 : 0);
    return () => { window.clearTimeout(timer); searchSequence.current += 1; };
  }, [findSpots, query, search, initialSpotId]);

  const refreshCoverage = useCallback(async () => {
    if (!search || initialSpotId || surface === "OWNER") return;
    const { data, error } = await client.rpc<CatalogCoverage>("world_product_admin_catalog_coverage_v1");
    if (error || !data || data.contractVersion !== "backyrd.world-knowledge.approved-catalog-coverage@1.0") {
      setCatalogError(error ? safeRpcMessage(error) : "Der Bestandsstatus konnte nicht geprüft werden.");
      return;
    }
    setCoverage(data);
    setCatalogError("");
  }, [client, search, surface, initialSpotId]);
  useEffect(() => { void refreshCoverage(); }, [refreshCoverage]);
  useEffect(() => {
    let active = true;
    if (surface === "OWNER") return;
    void client.rpc<{fields:PresentationUse[]}>("admin_spot_presentation_policy_v1").then(({data,error}) => {
      if (!active || error || !data || !Array.isArray(data.fields)) return;
      setPresentationUse(Object.fromEntries(data.fields.map((field) => [field.attributeKey,field])));
    });
    return () => { active = false; };
  }, [client, surface]);

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
      || !data.answers || !Array.isArray(data.openConflicts)
      || data.openConflicts.some(note => !note || typeof note.class !== "string"
        || (note.attributeKey !== null && typeof note.attributeKey !== "string")
        || !Array.isArray(note.reasonCodes) || note.reasonCodes.some(code => typeof code !== "string"))) {
      throw new Error(error ? safeRpcMessage(error) : "Der freigegebene Spot ist nicht verfügbar oder du bist nicht berechtigt.");
    }
    return data;
  };
  const selectSpot = async (id: string) => {
    if(scopedDraftDirty.current){setMessage("Bitte speichere den Angebotsentwurf oder verwirf ihn bewusst, bevor du den Spot wechselst.");setMessageIsError(false);return;}
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
      setOverview(true);
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
    if (field.attributeKey === "experience.profile") {
      const persisted = refreshed.answers[field.attributeKey];
      const stable = (input: unknown) => JSON.stringify(input, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
      if (persisted?.knowledgeState !== knowledgeState || stable(persisted.value) !== stable(validated.value)) {
        throw new Error("Die gespeicherten Angebote konnten nicht vollständig zurückgelesen werden. Dein Entwurf bleibt erhalten. Bitte lade den Spot vor einem erneuten Versuch neu.");
      }
    }
    setDetail(refreshed);
    window.dispatchEvent(new Event("backyrd:spot-profile-updated"));
    const blocking = snapshotConflicts(refreshed).some((conflict) =>
      conflict.severity === "BLOCKING" && conflict.attributeKeys?.includes(field.attributeKey));
    const saveMessage = blocking
      ? surface === "OWNER"
        ? "Angabe gespeichert. Es gibt noch einen Widerspruch; bitte prüfe die Angaben und Belege."
        : "Angabe gespeichert. Der World-Reader zeigt für dieses Feld weiterhin einen echten Widerspruch; bitte prüfe die Belege."
      : surface === "OWNER"
        ? "Deine Angabe wurde gespeichert und mit dem aktuellen Spot-Wissen abgeglichen."
        : "Gespeichert. Das Spotprofil wurde aktualisiert.";
    if (blocking) { setMessage(saveMessage); setMessageIsError(true); } else showSaveSuccess(saveMessage);
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
      showSaveSuccess("Adresse und Koordinaten gespeichert und im World-Reader geprüft.");
    } catch (error) {
      setMessage(`${messageOf(error)} Bereits gespeicherte Ortsangaben bleiben erhalten; bitte den Spot neu laden und prüfen.`);
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  };
  const primaryCategory = detail?.answers["classification.primary_category"]?.value;
  const guidance = {placeTypes: detail?.answers["classification.place_types"]?.value, onsiteOfferings: detail?.answers["context.onsite_offerings"]?.value};
  const profileSummary = (id:string):string|null => {
    if (!["discovery","areas","shared"].includes(id)) return null;
    const saved=detail?.answers["experience.profile"];
    if (!saved || saved.knowledgeState === "UNKNOWN") return "Noch nicht erfasst";
    try {
      const profile=parseExperienceProfile(saved.value,false);
      if(id === "discovery")return `${profile.offers.length} ${profile.offers.length === 1 ? "Angebot" : "Angebote"} gespeichert`;
      if(id === "areas")return `${profile.areas.length} ${profile.areas.length === 1 ? "Raum / Bereich" : "Räume / Bereiche"} gespeichert`;
      return `${new Set(profile.properties.map(property=>property.key)).size} gemeinsame Angaben gespeichert`;
    } catch { return "Gespeichertes Profil prüfen"; }
  };
  const fieldsForStep = (id: string) => getAuthoringFieldsForContext(id === "areas" || id === "shared" ? "discovery" : id, typeof primaryCategory === "string" ? primaryCategory : undefined, guidance).filter(field => !["areas","shared"].includes(id) || field.attributeKey === "experience.profile");
  const visibleSteps = AUTHORING_STEPS.filter(item=>["review","objective","amenities"].includes(item.id)||!detail||fieldsForStep(item.id).length>0)
    .flatMap(item => item.id === "discovery" ? [item, {...item,id:"areas",attributeKeys:["experience.profile"]}, {...item,id:"shared",attributeKeys:["experience.profile"]}] : [item])
    .sort((a,b)=>Number(sectionCopy[a.id]?.icon)-Number(sectionCopy[b.id]?.icon));
  const current = visibleSteps[Math.min(step,visibleSteps.length-1)]!;
  const experienceWorkspace:ExperienceWorkspace = current.id === "areas" ? "AREAS" : current.id === "shared" ? "SPOT" : "OFFERS";
  const proLocked = surface === "OWNER" && detail?.actor.role === "VERIFIED_OWNER" && detail.actor.entitlement === "OWNER_BASIC" && (current.id === "objective" || current.id === "amenities");
  const fields = fieldsForStep(current.id)
    .filter((field) => detail?.actor.allowedAttributeKeys.includes(field.attributeKey))
    .map((field) => ({ ...field, allowedValues: field.allowedValues.filter((option) => option.state !== "NOT_CONFIGURED") }));
  const known = Object.values(detail?.answers ?? {}).filter((answer) => answer.knowledgeState !== "UNKNOWN").length;
  const unknown = Object.values(detail?.answers ?? {}).filter((answer) => answer.knowledgeState === "UNKNOWN").length;
  const unresolved = snapshotConflicts(detail).filter((conflict) => conflict.severity === "BLOCKING").length;
  const reviewNotices = detail?.openConflicts.length ?? 0;
  const goToStep = (index: number) => {
    const sameProfile = ["discovery","areas","shared"].includes(current.id) && ["discovery","areas","shared"].includes(visibleSteps[index]?.id ?? "");
    const onlyProfileDraft = Object.entries(fieldDrafts.current).every(([key,dirty]) => !dirty || key === "experience.profile");
    if(scopedDraftDirty.current && !(sameProfile && onlyProfileDraft)){setMessage("Du hast noch ungespeicherte Änderungen. Speichere die bearbeitete Angabe zuerst. Nutze im Angebotsbereich „Änderungen speichern“.");setMessageIsError(false);return;}
    setFieldTarget(null);
    setOverview(false);
    setStep(Math.max(0, Math.min(visibleSteps.length - 1, index)));
    document.querySelector(".wk-product-app .wk-main")?.scrollIntoView({ behavior: surface === "OWNER" ? "auto" : "smooth", block: "start" });
  };
  const openField = (key:string) => {
    if(scopedDraftDirty.current){setMessage("Dein Entwurf ist noch nicht gespeichert. Speichere ihn zuerst oder verwirf ihn bewusst.");setMessageIsError(false);return;}
    const index=visibleSteps.findIndex(item=>item.attributeKeys.includes(key));
    if(index<0)return;
    goToStep(index);
    setFieldTarget({key});
  };
  const showOverview = () => {
    if(scopedDraftDirty.current){setMessage("Dein Entwurf ist noch nicht gespeichert. Speichere ihn zuerst oder verwirf ihn bewusst.");setMessageIsError(false);return;}
    setOverview(true);
    document.querySelector(".wk-product-app")?.scrollIntoView({block:"start"});
  };
  const renderFieldGroups = (items: AuthoringField[]) => [...new Set(items.map((field) => field.group))].map((group) =>
    <section className="wk-group" key={group}><h3>{group}</h3>{items.filter((field) => field.group === group).map((field) => {
      const editor = <FieldEditor field={field} answer={detail?.answers[field.attributeKey]}
        existingAnswers={detail?.answers}
        onDraftChange={dirty=>{fieldDrafts.current[field.attributeKey]=dirty;scopedDraftDirty.current=Object.values(fieldDrafts.current).some(Boolean);}}
        onContinue={()=>goToStep(step+1)}
        experienceWorkspace={experienceWorkspace}
        referenceValue={field.attributeKey === "hours.kitchen" ? detail?.answers["hours.regular"]?.value : undefined}
        disabled={busy}
        disabledReason={busy ? "Ein anderer Spot wird gerade geladen." : undefined}
        onPrepareDiscovery={prepareDiscovery && detail ? (sourceText) => prepareDiscovery(detail.spotId, sourceText).then(draft => parseDiscoveryProfile(draft, false)) : undefined}
        onSave={(state, value, until) => saveField(field, state, value, until)}
        onError={(error) => { if (error) { setMessage(error); setMessageIsError(true); } }} />;
      if(field.control==="DISCOVERY_PROFILE" && experienceWorkspace!=="OFFERS")return null;
      return <div className="wk-field-with-usage" id={`wk-editor-${field.attributeKey}`} tabIndex={-1} key={`${detail?.spotId}:${field.attributeKey}`}>
        {surface === "ADMIN" && <details className="wk-field-usage-details"><summary>Verwendung in Backyrd</summary><div className="wk-field-usage" aria-label="Verwendung dieser Angabe">
          <span className="decision">{presentationUse[field.attributeKey]?.engineAuthorization === "EXPLANATION_ONLY" ? "vNext: Erklärung" : "vNext: fachlich nutzbar"}</span>
          <span className={presentationUse[field.attributeKey]?.mobileVisible ? "visible" : "hidden"}>App: {presentationUse[field.attributeKey]?.mobileVisible ? "sichtbar" : "ausgeblendet"}</span>
          <span className={presentationUse[field.attributeKey]?.webVisible ? "visible" : "hidden"}>Browser: {presentationUse[field.attributeKey]?.webVisible ? "sichtbar" : "ausgeblendet"}</span>
        </div></details>}
        {field.control === "DISCOVERY_PROFILE" ? <section className="wk-source-preparation" aria-label="KI-Ausfüllhilfe">{editor}</section> : editor}
      </div>;
    })}</section>);


  return <div className={`wk-app wk-product-app wk-studio${overview?" is-overview":""}`}>
    <header className="wk-header">
      <div><span className="wk-eyebrow">SPOT STUDIO</span><h1>{detail?.name ?? "Spots pflegen"}</h1>
        <p>{detail ? surface === "OWNER" ? `${known} Angaben vorhanden · ${unknown} bewusst offen · ${unresolved} Widersprüche` : `${known} gespeicherte Angaben · ${unresolved} Widersprüche` : "Wähle einen Spot und pflege seine Angaben Schritt für Schritt."}</p>
        {surface === "OWNER" && detail?.actor.role === "ADMIN" && <p className="wk-admin-access-note">Admin-Zugriff: Alle Bereiche sind für dich freigeschaltet. Für Betreiber:innen gelten die Basis- und Pro-Grenzen.</p>}</div>
      <div className="wk-header-actions">{detail && !overview && <button type="button" className="wk-secondary" onClick={showOverview}>Alle Bereiche</button>}<span className="wk-status">{surface === "OWNER" ? detail?.manifest ? "● Spot-Ansicht aktuell" : "● Spot-Ansicht noch offen" : detail?.manifest ? "● Datenvorschau vorhanden" : "● Noch keine Datenvorschau"}</span></div>
    </header>
    {search && !initialSpotId && surface === "ADMIN" && <details className="wk-panel wk-catalog-details" aria-label="World-Bestandsabgleich">
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
      {!initialSpotId && <details className="wk-spot-picker" open={spotPickerOpen} onToggle={(event) => setSpotPickerOpen(event.currentTarget.open)}><summary><span>Spot auswählen</span><strong>{detail?.name ?? "Suche öffnen"}</strong></summary><div className="wk-spot-picker-content">
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
        <button type="button" disabled={busy} onClick={() => void selectSpot(spotId)}>Spot laden</button></div>}</div></details>}
      {detail && <label className="wk-owner-step-picker">Bereich auswählen
        <select aria-label="Bereich auswählen" value={step} onChange={(event) => goToStep(Number(event.target.value))}>
          {visibleSteps.map((item, index) => <option key={item.id} value={index}>{sectionCopy[item.id]?.icon} {sectionCopy[item.id]?.title??item.title}</option>)}
        </select>
      </label>}
      {detail && <nav aria-label="Bereiche der Spot-Pflege">{[...visibleSteps].sort((a,b)=>Number(sectionCopy[a.id]?.icon)-Number(sectionCopy[b.id]?.icon)).map((item) => {
        const index=visibleSteps.indexOf(item);
        const sectionFields = fieldsForStep(item.id).map(field=>field.attributeKey).filter((key) => detail.actor.allowedAttributeKeys.includes(key));
        const status=sectionStatus(fieldsForStep(item.id).filter(field=>sectionFields.includes(field.attributeKey)),detail.answers,primaryCategory);
        const proLocked = surface === "OWNER" && detail.actor.role === "VERIFIED_OWNER" && detail.actor.entitlement === "OWNER_BASIC" && (item.id === "objective" || item.id === "amenities");
        return <button type="button" className={!overview && step === index ? "selected" : ""} aria-current={!overview && step===index?"page":undefined} key={item.id} onClick={() => goToStep(index)}>
          <b>{sectionCopy[item.id]?.icon}</b><span>{sectionCopy[item.id]?.title??item.title}<small>{proLocked ? "Mit Owner Pro verfügbar" : item.id === "review" ? "Zusammenfassung" : profileSummary(item.id) ?? `${status.primary} · ${status.secondary}`}</small></span>
        </button>;
      })}</nav>}
    </aside>
    <main className="wk-main">{detail && !overview && (current.id === "review" ? <ProfileStatus detail={detail} onOpen={openField} /> : <details className="wk-profile-status-toggle"><summary>Profilstatus ansehen{reviewNotices > 0 ? ` · ${reviewNotices} separate Prüfnotizen` : ""}</summary><ProfileStatus detail={detail} onOpen={openField} /></details>)}{detail && overview ? <section className="wk-studio-home">
      {(() => {
        const required=evaluateAuthoringReadiness({answers:detail.answers}).blocking.filter(issue=>detail.actor.allowedAttributeKeys.includes(issue.attributeKey)).sort((a,b)=>visibleSteps.findIndex(item=>item.id===a.stepId)-visibleSteps.findIndex(item=>item.id===b.stepId));
        let profile=null, profileInvalid=false;
        if(detail.answers["experience.profile"]?.knowledgeState==="KNOWN_VALUE"){try{profile=parseExperienceProfile(detail.answers["experience.profile"].value,false);}catch{profileInvalid=true;}}
        const offers=profile?.offers.length??0, areas=profile?.areas.length??0;
        const first=required[0];
        const taskLabel=(label:string)=>label==="Art des Ortes"?"Spottyp":label;
        const next=()=>first?openField(first.attributeKey):goToStep(Math.max(0,visibleSteps.findIndex(item=>item.id==="discovery")));
        const started=offers>0 || required.length===0;
        return <>
          <section className="wk-entry-lead" aria-labelledby="wk-entry-title">
            <div><span className="wk-entry-kicker">SPOTPROFIL</span><h2 id="wk-entry-title">Dein Spotprofil</h2>
            <p>{first?`Als Nächstes: ${taskLabel(first.label)} ergänzen oder prüfen.`:profileInvalid?"Das gespeicherte Angebotsprofil konnte nicht gelesen werden. Öffne die Angebote zur Prüfung.":offers?"Deine Angebote sind gespeichert. Ergänze als Nächstes die passenden Details zu Preisen, Zeiten und Besuchsregeln.":"Beginne mit deinen Angeboten. Lege fest, was Gäste bei dir erleben oder nutzen können."}</p>
            <button type="button" className="wk-entry-primary" onClick={next}>{started?"Profil weiterbearbeiten":"Profil einrichten"}<span aria-hidden="true"> →</span></button></div>
            <dl className="wk-entry-facts"><div><dt>Grundprofil</dt><dd>{required.length?`${required.length} ${required.length===1?"Angabe":"Angaben"} prüfen`:"Pflichtangaben vorhanden"}</dd></div><div><dt>Angebote</dt><dd>{profileInvalid?"Bitte prüfen":offers?`${offers} erfasst`:"Noch keine erfasst"}</dd></div><div><dt>Räume & Bereiche</dt><dd>{areas?`${areas} erfasst`:"Noch keine erfasst"}</dd></div></dl>
          </section>
          {required.length>0&&<section className="wk-entry-tasks" aria-label="Nächste Aufgaben"><h3>Nächste Aufgaben</h3>{required.slice(0,3).map(issue=><button type="button" className="wk-secondary" key={issue.id} onClick={()=>openField(issue.attributeKey)}>{taskLabel(issue.label)}<span aria-hidden="true"> →</span></button>)}{required.length>3&&<p>Weitere Hinweise findest du unter „Gespeichertes Profil prüfen“.</p>}</section>}
          {unresolved>0&&<p className="wk-entry-warning" role="status">{unresolved} {unresolved===1?"Widerspruch muss":"Widersprüche müssen"} geprüft werden. <button type="button" className="wk-secondary" onClick={()=>goToStep(visibleSteps.findIndex(item=>item.id==="review"))}>Hinweise öffnen</button></p>}
        </>;
      })()}
      <div className="wk-section-heading"><h3>Alle Profilbereiche</h3><p>Öffne einen Abschnitt oder nutze den geführten Ablauf oben.</p></div>
      <div className="wk-task-grid">{visibleSteps.map(item=>{
        const keys=fieldsForStep(item.id).filter(f=>detail.actor.allowedAttributeKeys.includes(f.attributeKey));
        const status=sectionStatus(keys,detail.answers,primaryCategory);
        const copy=sectionCopy[item.id];
        const locked=surface==="OWNER"&&detail.actor.role==="VERIFIED_OWNER"&&detail.actor.entitlement==="OWNER_BASIC"&&["objective","amenities"].includes(item.id);
        return <button type="button" className="wk-task-card" key={item.id} onClick={()=>goToStep(visibleSteps.indexOf(item))}>
          <span className="wk-task-number">{copy?.icon}</span><span className="wk-task-content"><strong>{copy?.title??item.title}</strong><span>{copy?.description??item.explanation}</span></span><small className="wk-task-status">{locked?"Owner Pro":item.id==="review"?"Zusammenfassung":profileSummary(item.id)??<>{status.primary}<span>{status.secondary}</span></>}</small><span className="wk-task-arrow" aria-hidden="true">→</span>
        </button>;
      })}</div>
      <details className="wk-entry-audit"><summary>Alle Prüfhinweise{reviewNotices>0?` · ${reviewNotices} separate Prüfnotizen`:""}</summary><ProfileStatus detail={detail} onOpen={openField}/></details>
    </section> : !detail ? <section className="wk-panel"><h2>Spot auswählen</h2><p>{surface === "OWNER" ? "Suche deinen freigegebenen Spot nach Namen. Danach kannst du seine Angaben Schritt für Schritt ergänzen." : "Suche links nach einem freigegebenen Spot. Anschließend kannst du alle für deine Rolle freigegebenen Angaben direkt und ohne JSON-Eingabe pflegen."}</p></section>
      : <section className="wk-panel"><div className="wk-step-progress" aria-label={`Bereich ${step + 1} von ${visibleSteps.length}`}><span style={{ width: `${((step + 1) / visibleSteps.length) * 100}%` }} /></div><div className="wk-step-title"><span>Spotprofil bearbeiten · {surface === "OWNER" && detail.actor.entitlement === "OWNER_BASIC" && (current.id === "objective" || current.id === "amenities") ? "Owner Pro" : profileSummary(current.id) ?? sectionStatus(fields,detail.answers,primaryCategory).primary}</span><h2>{sectionCopy[current.id]?.title??current.title}</h2><p>{sectionCopy[current.id]?.description??current.explanation}</p>
        </div>
        {current.id!=="review" && !proLocked && !["discovery","areas","shared"].includes(current.id) && (()=>{
          const status=sectionStatus(fields,detail.answers,primaryCategory);
          return <section className="wk-section-status" aria-label="Stand dieses Abschnitts"><p><strong>{status.primary}</strong> · {status.secondary}</p>
            {status.issues.length>0&&<div><span>Bitte ergänzen oder prüfen:</span>{status.issues.map(issue=><button type="button" className="wk-secondary" key={issue.id} onClick={()=>openField(issue.attributeKey)}>{issue.label}</button>)}</div>}
            {status.optionalOpen.length>0&&<div><span>Optional ergänzbar:</span>{status.optionalOpen.map(field=><button type="button" className="wk-secondary" key={field.attributeKey} onClick={()=>openField(field.attributeKey)}>{field.label}</button>)}</div>}
            {status.unknown.length>0&&<div><span>Bewusst unbekannt:</span>{status.unknown.map(field=><button type="button" className="wk-secondary" key={field.attributeKey} onClick={()=>openField(field.attributeKey)}>{field.label}</button>)}</div>}
          </section>;
        })()}
        {unresolved > 0 && <div className="wk-error-summary" role="alert"><strong>{unresolved} {unresolved === 1 ? "Angabe" : "Angaben"} mit Widerspruch{surface === "ADMIN" ? " im World-Reader" : ""}</strong>
          <p>Die betroffenen Angaben können korrigiert werden; bis zur Klärung werden sie nicht als gesichert ausgegeben.</p></div>}
        {current.id === "basics" && AddressPicker && detail.actor.role === "ADMIN" && <div className="wk-address-assist"><h3>Adresse suchen statt Koordinaten eintippen</h3><p>Nutze die gleiche Adresssuche wie beim Anlegen eines Spots. Erst nach deiner Auswahl und Bestätigung werden Adresse, Ort und Position als World-Angaben gespeichert.</p><AddressPicker disabled={busy} onSelect={setAddressSelection} />{addressSelection && <div className="wk-address-selection"><strong>{addressSelection.addressLine1}, {addressSelection.locality}</strong><span>Position: {addressSelection.latitude.toFixed(6)}, {addressSelection.longitude.toFixed(6)}</span><button type="button" disabled={busy} onClick={() => void saveSelectedAddress()}>{busy ? "Adresse wird geprüft …" : "Adresse und Position speichern"}</button><button type="button" className="wk-secondary" disabled={busy} onClick={() => setAddressSelection(null)}>Auswahl verwerfen</button></div>}</div>}
        {proLocked ? <section className="wk-pro-preview" aria-labelledby="wk-pro-preview-title">
          <div className="wk-pro-preview-backdrop" aria-hidden="true"><span>{current.id === "objective" ? "Nutzungsmöglichkeiten" : "Ausstattung"}</span><i /><i /><i /></div>
          <div className="wk-pro-preview-card"><span className="wk-pro-kicker">backyrd · Owner Pro</span>
            <h3 id="wk-pro-preview-title">Mehr Tiefe für deinen Spot.</h3>
            <p>{current.id === "objective" ? "Ergänze, was Gäste hier konkret unternehmen können und welche Möglichkeiten dein Spot bietet." : "Zeige Ausstattung, Zugänglichkeit und Einschränkungen so klar, wie Gäste sie vor dem Besuch brauchen."}</p>
            <div className="wk-pro-price"><strong>CHF 39.–</strong><span>pro Monat · pro Spot · inkl. MWST</span></div>
            <a className="wk-pro-cta" href={`/owner/billing?spot=${encodeURIComponent(detail.spotId)}`}>Owner Pro entdecken</a>
            <small>Angaben werden weiterhin geprüft. Pro garantiert keine Platzierung in Empfehlungen.</small>
          </div>
        </section>
        : current.id === "review" ? <div className="wk-review">
          <article><b>Bestätigt</b><strong>{known}</strong><span>gespeicherte Angaben</span></article>
          <article><b>Bewusst unbekannt</b><strong>{unknown}</strong><span>weder Ja noch Nein</span></article>
          <article><b>{surface === "OWNER" ? "Widersprüche" : "Reader-Konflikte"}</b><strong>{unresolved}</strong><span>fachlich zu prüfen</span></article>
          <article><b>Prüfnotizen</b><strong>{reviewNotices}</strong><span>blockieren die Bearbeitung nicht</span></article>
          <article><b>{surface === "OWNER" ? "Spot-Ansicht" : "Datenvorschau"}</b><strong>{detail.manifest ? "✓" : "—"}</strong><span>{detail.manifest ? "aktuell" : "noch nicht bestätigt"}</span></article>
          <section className="wk-preview"><span className="wk-eyebrow">SPOT-PROFIL</span><h2>{detail.name}</h2>
            <p>{typeof detail.answers["description.highlight"]?.value === "string" ? String(detail.answers["description.highlight"].value) : "Noch keine öffentliche Beschreibung."}</p>
            <div className="wk-preview-grid">{["classification.primary_category", "purpose.primary_visit", "operation.price_level"].map((key) => {
              const field = AUTHORING_FIELDS.find((item) => item.attributeKey === key);
              return field ? <div key={key}><small>{field.label}</small><b>{detail.answers[key] ? valueLabel(field, detail.answers[key].value) : "Noch offen"}</b></div> : null;
            })}</div></section>
          <section className="wk-note"><strong>{detail.manifest ? "Spot-Ansicht aktuell" : "Spot-Ansicht noch nicht aktualisiert"}</strong>
            <p>{detail.manifest ? "Jede gespeicherte Änderung wird mit dem aktuellen Spot-Wissen abgeglichen." : "Speichere eine Angabe. Danach wird die Spot-Ansicht geprüft."}</p></section>
        </div> : fields.length ? <div className="wk-fields">{["offering","context","price","objective","amenities"].includes(current.id)&&<aside className="wk-scope-notice"><strong>Diese Angaben gelten für den gesamten Spot</strong><p>Gilt etwas nur für eine bestimmte Leistung oder einen Raum? Pflege es unter „Angebote“ oder „Räume & Bereiche“. Hier bleiben deine allgemeinen Angaben erhalten.</p></aside>}{renderFieldGroups(fields)}</div>
          : <div className="wk-note"><strong>Für diesen Spot keine bearbeitbaren Angaben in diesem Bereich.</strong><p>Du kannst zum nächsten Bereich wechseln.</p></div>}
        {!fields.some(field=>field.control==="EXPERIENCE_PROFILE")&&<footer className="wk-footer"><button type="button" className="wk-secondary" disabled={step === 0} onClick={() => goToStep(step - 1)}>Zurück</button>
          <span>{surface === "OWNER" ? "Jede Änderung wird einzeln gespeichert und geprüft." : "Jede Änderung wird einzeln gespeichert und danach im World-Reader geprüft."}</span>
          <button type="button" disabled={step >= visibleSteps.length - 1} onClick={() => goToStep(step + 1)}>Weiter</button></footer>}
      </section>}</main></div>
    {message && <div className={`wk-toast ${messageIsError ? "error" : "success"}`} role={messageIsError ? "alert" : "status"}>{message}
      <button type="button" aria-label="Meldung schließen" onClick={() => setMessage("")}>×</button></div>}
  </div>;
}
