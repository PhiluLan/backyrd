import { canonicalJson, hashBody } from "./canonical.js";
import {
  CONSUMPTION_POLICIES, CURRENT_STATE_KINDS, getAttributeDefinition, PET_ACCESS_STATES,
  REGISTRY_VERSION, RESERVATION_MODES, type AttributeDefinition,
} from "./registry.js";
import { array, boolean, ContractValidationError, date, enumValue, hash, identifier, number, object, required, string, timestamp } from "./schema.js";

export const CLAIM_CONTRACT_VERSION = "backyrd.world-knowledge.claim@1.0" as const;
export const RESOLUTION_CONTRACT_VERSION = "backyrd.world-knowledge.resolution@1.0" as const;
export const WORLD_KNOWLEDGE_PORT_VERSION = "backyrd.world-knowledge.port@1.0" as const;

export const KNOWLEDGE_STATES = ["KNOWN_TRUE", "KNOWN_FALSE", "KNOWN_VALUE", "UNKNOWN"] as const;
export const RESOLUTION_STATES = [...KNOWLEDGE_STATES, "DISPUTED"] as const;
export const FRESHNESS_STATES = ["CURRENT", "STALE", "EXPIRED"] as const;
export const TRUST_STATES = ["ASSERTED", "REFERENCED", "VERIFIED", "CONFLICTING"] as const;
export const ACTOR_TYPES = ["ADMIN", "VERIFIED_OWNER", "SYSTEM", "PUBLIC_CONTRIBUTOR"] as const;
export const SOURCE_TYPES = ["OWNER_ASSERTION", "ADMIN_OBSERVATION", "OFFICIAL_SOURCE", "PUBLIC_SOURCE", "USER_REPORT", "SYSTEM_DERIVATION", "AI_INFERENCE"] as const;
export const VERIFICATION_STATES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;
export const STANCES = ["SUPPORTS", "CONTRADICTS"] as const;
export const VISIBILITIES = ["PUBLIC", "INTERNAL", "PRIVATE"] as const;
export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

export type KnowledgeState = typeof KNOWLEDGE_STATES[number];
export type ResolutionState = typeof RESOLUTION_STATES[number];
export type FreshnessState = typeof FRESHNESS_STATES[number];
export type TrustState = typeof TRUST_STATES[number];
export type ActorType = typeof ACTOR_TYPES[number];
export type SourceType = typeof SOURCE_TYPES[number];
export type VerificationState = typeof VERIFICATION_STATES[number];
export type Stance = typeof STANCES[number];
export type Visibility = typeof VISIBILITIES[number];
export type Weekday = typeof WEEKDAYS[number];

export interface TimeInterval { readonly start: string; readonly end: string }
export interface WeeklyScheduleDay { readonly day: Weekday; readonly intervals: readonly TimeInterval[] }
export interface SpecialHoursDay { readonly date: string; readonly status: "OPEN" | "CLOSED"; readonly intervals: readonly TimeInterval[] }
export interface MoneyRange { readonly currency: string; readonly min: number; readonly max: number }
export interface IntegerRange { readonly min: number; readonly max: number }
export interface ReservationRule { readonly mode: typeof RESERVATION_MODES[number]; readonly minimumPartySize: number | null; readonly days: readonly Weekday[]; readonly fromTime: string | null; readonly toTime: string | null }
export interface ConsumptionRule { readonly policy: typeof CONSUMPTION_POLICIES[number]; readonly exceptions: readonly string[] }
export interface PetAccessRule { readonly indoor: typeof PET_ACCESS_STATES[number]; readonly outdoor: typeof PET_ACCESS_STATES[number]; readonly assistanceAnimals: typeof PET_ACCESS_STATES[number]; readonly notes: string | null }
export interface CurrentStateValue { readonly kind: typeof CURRENT_STATE_KINDS[number]; readonly scope: string }
export type ClaimValue = string | number | boolean | null | readonly string[] | MoneyRange | IntegerRange | ReservationRule | ConsumptionRule | PetAccessRule | readonly WeeklyScheduleDay[] | readonly SpecialHoursDay[] | CurrentStateValue;

export interface WorldKnowledgeClaim {
  readonly contractVersion: typeof CLAIM_CONTRACT_VERSION;
  readonly claimId: string;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly attributeKey: string;
  readonly scope: { readonly spotId: string; readonly area: string };
  readonly knowledgeState: KnowledgeState;
  readonly value: ClaimValue;
  readonly actorType: ActorType;
  readonly sourceType: SourceType;
  readonly sourceReferenceId: string | null;
  readonly provenanceSessionId: string | null;
  readonly verificationState: VerificationState;
  readonly observedAt: string;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly stance: Stance;
  readonly visibility: Visibility;
  readonly supersedesClaimId: string | null;
  readonly contentHash: string;
}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const parseTime = (value: unknown, path: string) => string(value, path, { pattern: timePattern });
const sortedUnique = (values: readonly string[]) => [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));

function parseInterval(value: unknown, path: string): TimeInterval {
  const input = object(value, path, ["start", "end"]);
  const start = parseTime(required(input, "start", path), `${path}.start`);
  const end = parseTime(required(input, "end", path), `${path}.end`);
  if (start === end) throw new ContractValidationError(path, "interval start and end must differ");
  return { start, end };
}

function parseWeeklySchedule(value: unknown, path: string): readonly WeeklyScheduleDay[] {
  const days = array(value, path, { max: 7 }).map((entry, index) => {
    const itemPath = `${path}[${index}]`; const input = object(entry, itemPath, ["day", "intervals"]);
    const day = enumValue(required(input, "day", itemPath), WEEKDAYS, `${itemPath}.day`);
    const intervals = array(required(input, "intervals", itemPath), `${itemPath}.intervals`, { max: 8 }).map((interval, intervalIndex) => parseInterval(interval, `${itemPath}.intervals[${intervalIndex}]`));
    return { day, intervals };
  });
  if (new Set(days.map((item) => item.day)).size !== days.length) throw new ContractValidationError(path, "duplicate weekday");
  return [...days].sort((left, right) => WEEKDAYS.indexOf(left.day) - WEEKDAYS.indexOf(right.day));
}

function parseSpecialHours(value: unknown, path: string): readonly SpecialHoursDay[] {
  const days = array(value, path, { max: 366 }).map((entry, index) => {
    const itemPath = `${path}[${index}]`; const input = object(entry, itemPath, ["date", "status", "intervals"]);
    const status = enumValue(required(input, "status", itemPath), ["OPEN", "CLOSED"] as const, `${itemPath}.status`);
    const intervals = array(required(input, "intervals", itemPath), `${itemPath}.intervals`, { max: 8 }).map((interval, intervalIndex) => parseInterval(interval, `${itemPath}.intervals[${intervalIndex}]`));
    if (status === "CLOSED" && intervals.length) throw new ContractValidationError(itemPath, "closed special day cannot contain intervals");
    if (status === "OPEN" && !intervals.length) throw new ContractValidationError(itemPath, "open special day requires an interval");
    return { date: date(required(input, "date", itemPath), `${itemPath}.date`), status, intervals };
  });
  if (new Set(days.map((item) => item.date)).size !== days.length) throw new ContractValidationError(path, "duplicate special date");
  return [...days].sort((left, right) => left.date.localeCompare(right.date));
}

function parseEnumSet(value: unknown, definition: AttributeDefinition, path: string): readonly string[] {
  const allowed = definition.allowedValues ?? [];
  const values = array(value, path, { max: allowed.length }).map((entry, index) => enumValue(entry, allowed, `${path}[${index}]`));
  if (new Set(values).size !== values.length) throw new ContractValidationError(path, "duplicate enum value");
  return sortedUnique(values);
}

export function parseAttributeValue(definition: AttributeDefinition, value: unknown, path = "$.value"): ClaimValue {
  const numericBounds = { ...(definition.min !== undefined ? { min: definition.min } : {}), ...(definition.max !== undefined ? { max: definition.max } : {}) };
  switch (definition.valueType) {
    case "TEXT": return string(value, path, numericBounds);
    case "URL": {
      const parsed = string(value, path, { min: 1, max: 500 });
      let url: URL; try { url = new URL(parsed); } catch { throw new ContractValidationError(path, "expected absolute URL"); }
      if (!["http:", "https:"].includes(url.protocol)) throw new ContractValidationError(path, "expected http or https URL");
      return url.toString();
    }
    case "PHONE": return string(value, path, { pattern: /^\+[1-9]\d{6,14}$/ });
    case "COUNTRY_CODE": return string(value, path, { pattern: /^[A-Z]{2}$/ });
    case "IANA_TIMEZONE": {
      const zone = string(value, path, { min: 3, max: 80 });
      try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); } catch { throw new ContractValidationError(path, "expected IANA time zone"); }
      return zone;
    }
    case "DECIMAL": return number(value, path, numericBounds);
    case "INTEGER": return number(value, path, { ...numericBounds, integer: true });
    case "BOOLEAN": return boolean(value, path);
    case "ENUM": return enumValue(value, definition.allowedValues ?? [], path);
    case "ENUM_SET": return parseEnumSet(value, definition, path);
    case "MONEY_RANGE": {
      const input = object(value, path, ["currency", "min", "max"]);
      const result = { currency: string(required(input, "currency", path), `${path}.currency`, { pattern: /^[A-Z]{3}$/ }), min: number(required(input, "min", path), `${path}.min`, numericBounds), max: number(required(input, "max", path), `${path}.max`, numericBounds) };
      if (result.min > result.max) throw new ContractValidationError(path, "min exceeds max"); return result;
    }
    case "INTEGER_RANGE": {
      const input = object(value, path, ["min", "max"]); const result = { min: number(required(input, "min", path), `${path}.min`, { ...numericBounds, integer: true }), max: number(required(input, "max", path), `${path}.max`, { ...numericBounds, integer: true }) };
      if (result.min > result.max) throw new ContractValidationError(path, "min exceeds max"); return result;
    }
    case "RESERVATION_RULE": {
      const input = object(value, path, ["mode", "minimumPartySize", "days", "fromTime", "toTime"]);
      const minimumPartySizeValue = required(input, "minimumPartySize", path); const from = required(input, "fromTime", path); const to = required(input, "toTime", path);
      const result: ReservationRule = {
        mode: enumValue(required(input, "mode", path), RESERVATION_MODES, `${path}.mode`),
        minimumPartySize: minimumPartySizeValue === null ? null : number(minimumPartySizeValue, `${path}.minimumPartySize`, { min: 1, max: 100000, integer: true }),
        days: sortedUnique(array(required(input, "days", path), `${path}.days`, { max: 7 }).map((entry, index) => enumValue(entry, WEEKDAYS, `${path}.days[${index}]`))) as readonly Weekday[],
        fromTime: from === null ? null : parseTime(from, `${path}.fromTime`), toTime: to === null ? null : parseTime(to, `${path}.toTime`),
      };
      if ((result.fromTime === null) !== (result.toTime === null)) throw new ContractValidationError(path, "time window requires fromTime and toTime");
      if (result.mode === "CONDITIONAL" && result.minimumPartySize === null && !result.days.length && result.fromTime === null) throw new ContractValidationError(path, "conditional rule requires a condition");
      return result;
    }
    case "CONSUMPTION_RULE": {
      const input = object(value, path, ["policy", "exceptions"]);
      return { policy: enumValue(required(input, "policy", path), CONSUMPTION_POLICIES, `${path}.policy`), exceptions: sortedUnique(array(required(input, "exceptions", path), `${path}.exceptions`, { max: 20 }).map((entry, index) => string(entry, `${path}.exceptions[${index}]`, { min: 1, max: 160 }))) };
    }
    case "PET_ACCESS_RULE": {
      const input = object(value, path, ["indoor", "outdoor", "assistanceAnimals", "notes"]); const notes = required(input, "notes", path);
      return { indoor: enumValue(required(input, "indoor", path), PET_ACCESS_STATES, `${path}.indoor`), outdoor: enumValue(required(input, "outdoor", path), PET_ACCESS_STATES, `${path}.outdoor`), assistanceAnimals: enumValue(required(input, "assistanceAnimals", path), PET_ACCESS_STATES, `${path}.assistanceAnimals`), notes: notes === null ? null : string(notes, `${path}.notes`, { min: 1, max: 500 }) };
    }
    case "WEEKLY_SCHEDULE": return parseWeeklySchedule(value, path);
    case "SPECIAL_HOURS": return parseSpecialHours(value, path);
    case "CURRENT_STATE": {
      const input = object(value, path, ["kind", "scope"]);
      return { kind: enumValue(required(input, "kind", path), CURRENT_STATE_KINDS, `${path}.kind`), scope: identifier(required(input, "scope", path), `${path}.scope`) };
    }
  }
}

export type ClaimDraft = Omit<WorldKnowledgeClaim, "contractVersion" | "registryVersion" | "contentHash">;

function normalizeDraft(draft: ClaimDraft): Omit<WorldKnowledgeClaim, "contentHash"> {
  const definition = getAttributeDefinition(draft.attributeKey);
  if (draft.sourceType === "AI_INFERENCE" && draft.verificationState === "VERIFIED") throw new ContractValidationError("$.verificationState", "AI inference cannot be a verified source");
  if (draft.sourceReferenceId !== null && !draft.sourceReferenceId.startsWith("source:")) throw new ContractValidationError("$.sourceReferenceId", "bound evidence reference must use source namespace");
  if (draft.verificationState === "VERIFIED" && draft.sourceReferenceId === null) throw new ContractValidationError("$.sourceReferenceId", "verified claim requires a bound verification source");
  const value = draft.knowledgeState === "UNKNOWN" ? null : parseAttributeValue(definition, draft.value);
  if (draft.knowledgeState === "KNOWN_TRUE" && value !== true) throw new ContractValidationError("$.value", "KNOWN_TRUE requires true");
  if (draft.knowledgeState === "KNOWN_FALSE" && value !== false) throw new ContractValidationError("$.value", "KNOWN_FALSE requires false");
  if (["KNOWN_TRUE", "KNOWN_FALSE"].includes(draft.knowledgeState) && definition.valueType !== "BOOLEAN") throw new ContractValidationError("$.knowledgeState", "boolean knowledge state requires BOOLEAN attribute");
  if (draft.knowledgeState === "KNOWN_VALUE" && value === null) throw new ContractValidationError("$.value", "KNOWN_VALUE requires value");
  if (draft.validFrom && draft.validUntil && draft.validFrom > draft.validUntil) throw new ContractValidationError("$.validUntil", "precedes validFrom");
  return { ...draft, contractVersion: CLAIM_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, value };
}

export function createClaim(draft: ClaimDraft): WorldKnowledgeClaim {
  const body = normalizeDraft(draft);
  return { ...body, contentHash: hashBody(body, []) };
}

export function parseClaim(value: unknown): WorldKnowledgeClaim {
  const path = "$"; const input = object(value, path, ["contractVersion", "claimId", "registryVersion", "attributeKey", "scope", "knowledgeState", "value", "actorType", "sourceType", "sourceReferenceId", "provenanceSessionId", "verificationState", "observedAt", "validFrom", "validUntil", "stance", "visibility", "supersedesClaimId", "contentHash"]);
  if (required(input, "contractVersion", path) !== CLAIM_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown contract version");
  if (required(input, "registryVersion", path) !== REGISTRY_VERSION) throw new ContractValidationError("$.registryVersion", "unknown registry version");
  const scopeInput = object(required(input, "scope", path), "$.scope", ["spotId", "area"]);
  const nullableIdentifier = (key: string) => { const item = required(input, key, path); return item === null ? null : identifier(item, `$.${key}`); };
  const nullableTimestamp = (key: string) => { const item = required(input, key, path); return item === null ? null : timestamp(item, `$.${key}`); };
  const base: ClaimDraft = {
    claimId: identifier(required(input, "claimId", path), "$.claimId"), attributeKey: identifier(required(input, "attributeKey", path), "$.attributeKey"),
    scope: { spotId: identifier(required(scopeInput, "spotId", "$.scope"), "$.scope.spotId"), area: identifier(required(scopeInput, "area", "$.scope"), "$.scope.area") },
    knowledgeState: enumValue(required(input, "knowledgeState", path), KNOWLEDGE_STATES, "$.knowledgeState"), value: required(input, "value", path) as ClaimValue,
    actorType: enumValue(required(input, "actorType", path), ACTOR_TYPES, "$.actorType"), sourceType: enumValue(required(input, "sourceType", path), SOURCE_TYPES, "$.sourceType"),
    sourceReferenceId: nullableIdentifier("sourceReferenceId"), provenanceSessionId: nullableIdentifier("provenanceSessionId"), verificationState: enumValue(required(input, "verificationState", path), VERIFICATION_STATES, "$.verificationState"),
    observedAt: timestamp(required(input, "observedAt", path), "$.observedAt"), validFrom: nullableTimestamp("validFrom"), validUntil: nullableTimestamp("validUntil"), stance: enumValue(required(input, "stance", path), STANCES, "$.stance"), visibility: enumValue(required(input, "visibility", path), VISIBILITIES, "$.visibility"), supersedesClaimId: nullableIdentifier("supersedesClaimId"),
  };
  const parsed = createClaim(base); const suppliedHash = hash(required(input, "contentHash", path), "$.contentHash");
  if (parsed.contentHash !== suppliedHash) throw new ContractValidationError("$.contentHash", "claim content hash mismatch");
  if (canonicalJson(parsed.value) !== canonicalJson(input.value)) throw new ContractValidationError("$.value", "value is not canonical");
  return parsed;
}

export function appendClaim(history: readonly WorldKnowledgeClaim[], candidate: WorldKnowledgeClaim): readonly WorldKnowledgeClaim[] {
  const parsedHistory = history.map(parseClaim); const parsedCandidate = parseClaim(candidate);
  if (parsedHistory.some((claim) => claim.claimId === parsedCandidate.claimId)) throw new ContractValidationError("$.claimId", "duplicate claim id");
  if (parsedCandidate.supersedesClaimId) {
    const prior = parsedHistory.find((claim) => claim.claimId === parsedCandidate.supersedesClaimId);
    if (!prior) throw new ContractValidationError("$.supersedesClaimId", "prior claim not found");
    if (prior.attributeKey !== parsedCandidate.attributeKey || prior.scope.spotId !== parsedCandidate.scope.spotId || prior.scope.area !== parsedCandidate.scope.area) throw new ContractValidationError("$.supersedesClaimId", "correction target has different attribute or scope");
  }
  return Object.freeze([...parsedHistory, parsedCandidate]);
}
