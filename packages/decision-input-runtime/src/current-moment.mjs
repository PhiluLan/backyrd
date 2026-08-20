import { buildCurrentMoment, N3_CONTRACT_HASH, N3_VERSIONS } from "../../../decision-lab/src/n3-moment-intelligence.mjs";

export const PRODUCT_MOMENT_INPUT_VERSION = "backyrd-product-moment-input-v1";

const TIME_ZONES = new Map([
  ["basel", "Europe/Zurich"],
  ["zurich", "Europe/Zurich"],
  ["zürich", "Europe/Zurich"],
  ["copenhagen", "Europe/Copenhagen"],
  ["kopenhagen", "Europe/Copenhagen"],
]);
const SOCIAL = new Map([
  ["solo", "solo"], ["alone", "solo"], ["date", "date"],
  ["friends", "friends"], ["freunde", "friends"],
  ["family", "family"], ["familie", "family"],
  ["family_with_kids", "family_with_kids"], ["work", "work"], ["group", "group"],
]);
const VIBES = new Map([
  ["cozy", "cozy"], ["gemütlich", "cozy"], ["gemuetlich", "cozy"],
  ["quiet", "quiet"], ["ruhig", "quiet"], ["relaxed", "relaxed"], ["entspannt", "relaxed"],
  ["lively", "lively"], ["lebendig", "lively"], ["social", "social"], ["gesellig", "social"],
  ["romantic", "romantic"], ["romantisch", "romantic"], ["elegant", "elegant"],
  ["authentic", "authentic"], ["authentisch", "authentic"], ["exploratory", "exploratory"],
]);
const OCCASIONS = new Set(["breakfast","lunch","afterwork","dinner","late_night","celebration","tourist","business","casual"]);
const clean = (value) => typeof value === "string" ? value.trim() : "";
const first = (value) => Array.isArray(value) ? value[0] : value;
const normalized = (value) => clean(value).toLowerCase();
const unique = (values) => [...new Set(values.filter(Boolean))];

function timeZoneFor(source) {
  const explicit = clean(source.requestContext?.timeZone);
  if (explicit) return explicit;
  const zone = TIME_ZONES.get(normalized(source.decision.city));
  if (!zone) throw new Error("decision_city_timezone_unavailable");
  return zone;
}

export function mapProductDecisionToN3Input(source) {
  const context = source.requestContext ?? {};
  const intent = context.intent ?? {};
  const audience = unique([...(context.audience ?? []), ...(context.selectedAudiences ?? []), ...(intent.audience ?? [])].map((value) => SOCIAL.get(normalized(value))));
  const moods = unique([source.decision.moodA, source.decision.moodB, ...(context.selectedMoods ?? [])].map((value) => VIBES.get(normalized(value))));
  const explicit = {};
  if (audience.length === 1) explicit.social_context = audience[0];
  if (moods.length) explicit.vibe = moods;
  const occasion = normalized(first(context.occasions ?? context.occasion ?? intent.occasions));
  if (OCCASIONS.has(occasion)) explicit.occasion = occasion;
  const preferred = unique([...(context.preferredPlaceTypes ?? []), ...(intent.primaryPlaceTypes ?? [])].map(normalized));
  const excluded = unique([...(context.excludedPlaceTypes ?? []), ...(intent.excludedPlaceTypes ?? [])].map(normalized));
  const strict = context.strictCategoryIntent === true || intent.mustRespectCategory === true;
  const requestText = clean(context.rawFreeText) || clean(context.query) || clean(source.requestQuery) || [source.decision.moodA, source.decision.moodB].filter(Boolean).join(" ");
  return {
    decisionId: source.decision.id,
    userId: source.decision.userId,
    request: { requestId:`product:${source.decision.id}`,query:requestText,rawFreeText:clean(context.rawFreeText) || undefined },
    explicit,
    structuredIntent: {
      version: "decision-v13-current-intent-v1",
      hardConstraints: {
        requiredPlaceTypes: strict ? preferred : [],
        excludedPlaceTypes: excluded,
        openNow: context.openNow === true || intent.openNow === true,
      },
    },
    context: {
      now: source.decision.createdAt,
      timeZone: timeZoneFor(source),
      location: { city:source.decision.city,source:"explicit_selected",id:`decision-city:${source.decision.id}` },
    },
    memoryPatterns: [],
    memoryConsentState: source.memoryConsentState ?? "missing",
    observedAt: source.decision.createdAt,
  };
}

export function buildProductCurrentMoment(source) {
  const input = mapProductDecisionToN3Input(source);
  const result = buildCurrentMoment(input);
  return { inputVersion:PRODUCT_MOMENT_INPUT_VERSION,n3ContractHash:N3_CONTRACT_HASH,n3Versions:N3_VERSIONS,input,result };
}
