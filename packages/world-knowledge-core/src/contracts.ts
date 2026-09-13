import { canonicalJson, hashBody } from "./canonical.js";
import {
  CONSUMPTION_POLICIES, CURRENT_STATE_KINDS, getAttributeDefinition, PET_ACCESS_STATES,
  REGISTRY_VERSION, RESERVATION_MODES,
} from "./registry.js";
import { array, boolean, ContractValidationError, date, enumValue, hash, identifier, number, object, required, string, timestamp } from "./schema.js";

export const CLAIM_CONTRACT_VERSION = "backyrd.world-knowledge.claim@1.0" as const;
export const RESOLUTION_CONTRACT_VERSION = "backyrd.world-knowledge.resolution@2.0" as const;
export const WORLD_KNOWLEDGE_PORT_VERSION = "backyrd.world-knowledge.port@1.0" as const;

export const KNOWLEDGE_STATES = ["KNOWN_TRUE", "KNOWN_FALSE", "KNOWN_VALUE", "UNKNOWN"] as const;
export const RESOLUTION_STATES = [...KNOWLEDGE_STATES, "DISPUTED"] as const;
export const FRESHNESS_STATES = ["CURRENT", "STALE", "EXPIRED"] as const;
export const TRUST_STATES = ["ASSERTED", "REFERENCED", "VERIFIED", "CONFLICTING"] as const;
export const ACTOR_TYPES = ["ADMIN", "VERIFIED_OWNER", "SYSTEM", "PUBLIC_CONTRIBUTOR"] as const;
export const SOURCE_TYPES = ["OWNER_ASSERTION", "ADMIN_OBSERVATION", "OFFICIAL_SOURCE", "PUBLIC_SOURCE", "USER_REPORT", "SYSTEM_DERIVATION", "AI_INFERENCE", "LEGACY_IMPORT"] as const;
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
export interface AgeAccessRule { readonly policy: "ALL_AGES" | "MINIMUM_AGE"; readonly minimumAge: number | null; readonly appliesFromTime: string | null }
export interface AgeAccessCondition { readonly mode: "NO_MINIMUM" | "GENERAL_MINIMUM" | "UNACCOMPANIED_MINIMUM"; readonly minimumAge: number | null; readonly accompaniment: "NONE" | "ADULT" | "LEGAL_GUARDIAN"; readonly appliesFromTime: string | null; readonly days: readonly Weekday[]; readonly area: string | null; readonly event: string | null }
export interface AgeAccessRuleV2 { readonly rules: readonly AgeAccessCondition[] }
export interface CurrentStateValue { readonly kind: typeof CURRENT_STATE_KINDS[number]; readonly scope: string }
export type ClaimValue = string | number | boolean | null | readonly string[] | MoneyRange | IntegerRange | ReservationRule | ConsumptionRule | PetAccessRule | AgeAccessRule | AgeAccessRuleV2 | readonly WeeklyScheduleDay[] | readonly SpecialHoursDay[] | CurrentStateValue;

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

function parseEnumSet(value: unknown, definition: ReturnType<typeof getAttributeDefinition>, path: string): readonly string[] {
  const allowed = definition.allowedValues ?? [];
  const values = array(value, path, { max: allowed.length }).map((entry, index) => enumValue(entry, allowed, `${path}[${index}]`));
  if (new Set(values).size !== values.length) throw new ContractValidationError(path, "duplicate enum value");
  return sortedUnique(values);
}

export function parseAttributeValue(attributeKeyValue: unknown, value: unknown, path = "$.value"): ClaimValue {
  const attributeKey = identifier(attributeKeyValue, `${path}.attributeKey`);
  const definition = getAttributeDefinition(attributeKey);
  const numericBounds = { ...(definition.min !== undefined ? { min: definition.min } : {}), ...(definition.max !== undefined ? { max: definition.max } : {}) };
  switch (definition.valueType) {
    case "TEXT": return string(value, path, numericBounds);
    case "EMAIL": return string(value, path, { min: 3, max: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ });
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
    case "AGE_ACCESS_RULE": {
      const input = object(value, path, ["policy", "minimumAge", "appliesFromTime"]);
      const policy = enumValue(required(input, "policy", path), ["ALL_AGES", "MINIMUM_AGE"] as const, `${path}.policy`);
      const minimumAgeValue = required(input, "minimumAge", path); const appliesFromTimeValue = required(input, "appliesFromTime", path);
      const minimumAge = minimumAgeValue === null ? null : number(minimumAgeValue, `${path}.minimumAge`, { min: 0, max: 120, integer: true });
      const appliesFromTime = appliesFromTimeValue === null ? null : parseTime(appliesFromTimeValue, `${path}.appliesFromTime`);
      if (policy === "ALL_AGES" && (minimumAge !== null || appliesFromTime !== null)) throw new ContractValidationError(path, "ALL_AGES cannot contain a minimum age or time restriction");
      if (policy === "MINIMUM_AGE" && minimumAge === null) throw new ContractValidationError(path, "MINIMUM_AGE requires minimumAge");
      return { policy, minimumAge, appliesFromTime };
    }
    case "AGE_ACCESS_RULE_V2": {
      const root = object(value, path, ["rules"]);
      const rules = array(required(root, "rules", path), `${path}.rules`, { min: 1, max: 12 }).map((entry, index) => {
        const itemPath = `${path}.rules[${index}]`; const input = object(entry, itemPath, ["mode", "minimumAge", "accompaniment", "appliesFromTime", "days", "area", "event"]);
        const mode = enumValue(required(input, "mode", itemPath), ["NO_MINIMUM", "GENERAL_MINIMUM", "UNACCOMPANIED_MINIMUM"] as const, `${itemPath}.mode`);
        const rawAge = required(input, "minimumAge", itemPath); const minimumAge = rawAge === null ? null : number(rawAge, `${itemPath}.minimumAge`, { min: 0, max: 120, integer: true });
        const accompaniment = enumValue(required(input, "accompaniment", itemPath), ["NONE", "ADULT", "LEGAL_GUARDIAN"] as const, `${itemPath}.accompaniment`);
        const rawTime = required(input, "appliesFromTime", itemPath); const appliesFromTime = rawTime === null ? null : parseTime(rawTime, `${itemPath}.appliesFromTime`);
        const days = sortedUnique(array(required(input, "days", itemPath), `${itemPath}.days`, { max: 7 }).map((day, dayIndex) => enumValue(day, WEEKDAYS, `${itemPath}.days[${dayIndex}]`))) as readonly Weekday[];
        const nullableText = (key: "area" | "event") => { const item = required(input, key, itemPath); return item === null ? null : string(item, `${itemPath}.${key}`, { min: 1, max: 160 }); };
        if (mode === "NO_MINIMUM" && (minimumAge !== null || accompaniment !== "NONE")) throw new ContractValidationError(itemPath, "NO_MINIMUM cannot contain age or accompaniment requirements");
        if (mode !== "NO_MINIMUM" && minimumAge === null) throw new ContractValidationError(`${itemPath}.minimumAge`, "age restriction requires minimumAge");
        if (mode === "GENERAL_MINIMUM" && accompaniment !== "NONE") throw new ContractValidationError(`${itemPath}.accompaniment`, "general minimum does not allow an accompaniment exception");
        if (mode === "UNACCOMPANIED_MINIMUM" && accompaniment === "NONE") throw new ContractValidationError(`${itemPath}.accompaniment`, "unaccompanied minimum requires the allowed accompanying person");
        return { mode, minimumAge, accompaniment, appliesFromTime, days, area: nullableText("area"), event: nullableText("event") };
      });
      return { rules };
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

function normalizeDraft(draftValue: unknown): Omit<WorldKnowledgeClaim, "contentHash"> {
  const path = "$";
  const draft = object(draftValue, path, ["claimId", "attributeKey", "scope", "knowledgeState", "value", "actorType", "sourceType", "sourceReferenceId", "provenanceSessionId", "verificationState", "observedAt", "validFrom", "validUntil", "stance", "visibility", "supersedesClaimId"]);
  const nullableIdentifier = (key: string) => { const item = required(draft, key, path); return item === null ? null : identifier(item, `$.${key}`); };
  const nullableTimestamp = (key: string) => { const item = required(draft, key, path); return item === null ? null : timestamp(item, `$.${key}`); };
  const claimId = identifier(required(draft, "claimId", path), "$.claimId");
  const attributeKey = identifier(required(draft, "attributeKey", path), "$.attributeKey"); const definition = getAttributeDefinition(attributeKey);
  const scopeInput = object(required(draft, "scope", path), "$.scope", ["spotId", "area"]);
  const knowledgeState = enumValue(required(draft, "knowledgeState", path), KNOWLEDGE_STATES, "$.knowledgeState");
  const actorType = enumValue(required(draft, "actorType", path), ACTOR_TYPES, "$.actorType");
  const sourceType = enumValue(required(draft, "sourceType", path), SOURCE_TYPES, "$.sourceType");
  const sourceReferenceId = nullableIdentifier("sourceReferenceId"); const provenanceSessionId = nullableIdentifier("provenanceSessionId");
  const verificationState = enumValue(required(draft, "verificationState", path), VERIFICATION_STATES, "$.verificationState");
  const observedAt = timestamp(required(draft, "observedAt", path), "$.observedAt"); const validFrom = nullableTimestamp("validFrom"); const validUntil = nullableTimestamp("validUntil");
  const stance = enumValue(required(draft, "stance", path), STANCES, "$.stance"); const visibility = enumValue(required(draft, "visibility", path), VISIBILITIES, "$.visibility"); const supersedesClaimId = nullableIdentifier("supersedesClaimId");
  if (sourceType === "AI_INFERENCE" && verificationState === "VERIFIED") throw new ContractValidationError("$.verificationState", "AI inference cannot be a verified source");
  if (sourceReferenceId !== null && !sourceReferenceId.startsWith("source:")) throw new ContractValidationError("$.sourceReferenceId", "bound evidence reference must use source namespace");
  if (verificationState === "VERIFIED" && sourceReferenceId === null) throw new ContractValidationError("$.sourceReferenceId", "verified claim requires a bound verification source");
  if (supersedesClaimId === claimId) throw new ContractValidationError("$.supersedesClaimId", "claim cannot supersede itself");
  const value = knowledgeState === "UNKNOWN" ? (required(draft, "value", path) === null ? null : (() => { throw new ContractValidationError("$.value", "UNKNOWN requires null"); })()) : parseAttributeValue(attributeKey, required(draft, "value", path));
  if (knowledgeState === "KNOWN_TRUE" && value !== true) throw new ContractValidationError("$.value", "KNOWN_TRUE requires true");
  if (knowledgeState === "KNOWN_FALSE" && value !== false) throw new ContractValidationError("$.value", "KNOWN_FALSE requires false");
  if (["KNOWN_TRUE", "KNOWN_FALSE"].includes(knowledgeState) && definition.valueType !== "BOOLEAN") throw new ContractValidationError("$.knowledgeState", "boolean knowledge state requires BOOLEAN attribute");
  if (knowledgeState === "KNOWN_VALUE" && value === null) throw new ContractValidationError("$.value", "KNOWN_VALUE requires value");
  if (validFrom && validUntil && validFrom > validUntil) throw new ContractValidationError("$.validUntil", "precedes validFrom");
  return {
    contractVersion: CLAIM_CONTRACT_VERSION, claimId, registryVersion: REGISTRY_VERSION, attributeKey,
    scope: { spotId: identifier(required(scopeInput, "spotId", "$.scope"), "$.scope.spotId"), area: identifier(required(scopeInput, "area", "$.scope"), "$.scope.area") },
    knowledgeState, value, actorType, sourceType, sourceReferenceId, provenanceSessionId, verificationState, observedAt, validFrom, validUntil, stance, visibility, supersedesClaimId,
  };
}

export function createClaim(draft: ClaimDraft): WorldKnowledgeClaim;
export function createClaim(draft: unknown): WorldKnowledgeClaim {
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
