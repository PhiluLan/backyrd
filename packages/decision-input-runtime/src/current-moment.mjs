import { buildCurrentMoment, N3_CONTRACT_HASH, N3_VERSIONS } from "../../../decision-lab/src/n3-moment-intelligence.mjs";
import { createHash } from "node:crypto";
import { CURRENT_MOMENT_VERSION,SEMANTIC_CONTRACT_VERSION,interpretCanonicalCurrentIntent } from "../../canonical-semantics/src/index.mjs";

export const PRODUCT_MOMENT_INPUT_VERSION = "backyrd-product-moment-input-v2";

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
  ["family_with_kids", "family_with_kids"], ["kids", "family_with_kids"], ["child", "family_with_kids"], ["kinder", "family_with_kids"], ["work", "work"], ["group", "group"],
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
const canonical=(value)=>value&&typeof value==="object"?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonical(value[key])]))):value;
const semanticHash=(value)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

export function extractCurrentRequestFacts(source,requestText){
  const context=source.requestContext??{},intent=context.intent??{};
  if(context.canonicalIntent?.semanticContractVersion===SEMANTIC_CONTRACT_VERSION&&context.canonicalIntent?.currentRequestFacts)return context.canonicalIntent.currentRequestFacts;
  return interpretCanonicalCurrentIntent({
    query:requestText,rawFreeText:context.rawFreeText,currentFacts:context.currentFacts,
    rain:context.rain??intent.rain,childAge:context.childAge??intent.childAge,
    activityTypes:[...(context.activityTypes??[]),...(intent.activityTypes??[])],
    audience:[...(context.audience??[]),...(intent.audience??[])],selectedAudiences:context.selectedAudiences,
    preferredPlaceTypes:[...(context.preferredPlaceTypes??[])],
    excludedPlaceTypes:[...(context.excludedPlaceTypes??[]),...(intent.excludedPlaceTypes??[])],
    strictCategoryIntent:context.strictCategoryIntent===true,openNow:context.openNow===true||intent.openNow===true,
  }).currentRequestFacts;
}

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
  const requestText = clean(context.rawFreeText) || clean(context.query) || clean(source.requestQuery) || [source.decision.moodA, source.decision.moodB].filter(Boolean).join(" ");
  const canonicalIntent=context.canonicalIntent?.semanticContractVersion===SEMANTIC_CONTRACT_VERSION?context.canonicalIntent:interpretCanonicalCurrentIntent({
    query:requestText,rawFreeText:context.rawFreeText,currentFacts:context.currentFacts,
    audience:[...(context.audience??[]),...(context.selectedAudiences??[]),...(intent.audience??[])],
    preferredPlaceTypes:[...(context.preferredPlaceTypes??[])],
    excludedPlaceTypes:[...(context.excludedPlaceTypes??[]),...(intent.excludedPlaceTypes??[])],
    strictCategoryIntent:context.strictCategoryIntent===true,openNow:context.openNow===true||intent.openNow===true,
  });
  if(!explicit.social_context&&canonicalIntent.socialContext)explicit.social_context=canonicalIntent.socialContext;
  const canonicalVibes=canonicalIntent.conceptDirections.map((row)=>({"vibe.quiet":"quiet","vibe.cozy":"cozy","vibe.lively":"lively","vibe.romantic":"romantic"})[row.concept]).filter(Boolean);
  if(canonicalVibes.length)explicit.vibe=unique([...(explicit.vibe??[]),...canonicalVibes]);
  const preferred = unique([...(context.preferredPlaceTypes ?? []), ...(intent.primaryPlaceTypes ?? [])].map(normalized));
  const explicitExcluded = [...(context.excludedPlaceTypes ?? []), ...(intent.excludedPlaceTypes ?? [])].map(normalized);
  if (/\b(keine? bar|nicht bar|no bar|ohne bar)\b/i.test(requestText)) explicitExcluded.push("bar");
  if (/\b(kein restaurant|nicht restaurant|no restaurant|ohne restaurant)\b/i.test(requestText)) explicitExcluded.push("restaurant");
  if (/\b(kein club|nicht club|kein nachtleben|keine party|no party)\b/i.test(requestText)) explicitExcluded.push("nightlife");
  const excluded = unique(explicitExcluded);
  return {
    decisionId: source.decision.id,
    userId: source.decision.userId,
    request: { requestId:`product:${source.decision.id}`,query:requestText,rawFreeText:clean(context.rawFreeText) || undefined },
    explicit,
    structuredIntent: {
      version: "decision-v13-current-intent-v2-founder-gate3",
      hardConstraints: {
        // The canonical interpreter distinguishes explicit natural-language
        // place types from broad family/context inference. Only the former are
        // present in hardConstraints.requiredPlaceTypes.
        requiredPlaceTypes: canonicalIntent.hardConstraints.requiredPlaceTypes,
        excludedPlaceTypes: canonicalIntent.excludedPlaceTypes,
        openNow: canonicalIntent.hardConstraints.openNow,
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
  const frozen = buildCurrentMoment(input);
  const currentRequestFacts=extractCurrentRequestFacts(source,input.request.query);
  const withoutHash={...frozen.currentMoment,schemaVersion:CURRENT_MOMENT_VERSION,semanticContractVersion:SEMANTIC_CONTRACT_VERSION,currentRequestFacts};
  delete withoutHash.momentHash;
  const currentMoment={...withoutHash,momentHash:semanticHash(withoutHash)};
  const result={...frozen,currentMoment};
  return { inputVersion:PRODUCT_MOMENT_INPUT_VERSION,n3ContractHash:N3_CONTRACT_HASH,n3Versions:{...N3_VERSIONS,productSchema:CURRENT_MOMENT_VERSION},input,result,frozenResult:frozen };
}
