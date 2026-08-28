import { createHash } from "node:crypto";
import { buildMomentAwareRelevantUserProjection, N5_6_1_PROJECTION_CONTRACT_HASH, N5_6_1_SUFFICIENCY_CONTRACT_HASH } from "../../../decision-lab/src/n5-6-1-moment-aware-projection.mjs";
import { interpretCanonicalCurrentIntent,SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

export const PRODUCT_PROJECTION_VERSION = "backyrd-product-n5-6-1-projection-v2";
const canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key) => [key,canonical(value[key])])) : value;
const hash = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const field = (moment,key) => moment.fields?.[key]?.value;

export function buildColdUserCard(userId) {
  const body = { version:"backyrd-n5-6-user-card-v1",userId,nodes:[],occasionPatterns:[],maturity:{state:"COLD"},memorySummary:{eventCount:0},boundaries:{syntheticColdShell:true,learnedKnowledge:false} };
  return { ...body,userCardHash:hash(body) };
}

export function buildCurrentIntent(moment,requestContext={}) {
  const canonicalIntent=requestContext.canonicalIntent?.semanticContractVersion===SEMANTIC_CONTRACT_VERSION
    ? requestContext.canonicalIntent
    : interpretCanonicalCurrentIntent({
      query:requestContext.rawFreeText??requestContext.query,
      currentFacts:requestContext.currentFacts,
      audience:requestContext.audience,selectedAudiences:requestContext.selectedAudiences,
      preferredPlaceTypes:[...(requestContext.preferredPlaceTypes??[]),...(requestContext.intent?.primaryPlaceTypes??[])],
      excludedPlaceTypes:[...(requestContext.excludedPlaceTypes??[]),...(requestContext.intent?.excludedPlaceTypes??[])],
      strictCategoryIntent:requestContext.strictCategoryIntent===true,
      openNow:requestContext.openNow===true||requestContext.intent?.openNow===true,
    });
  const preferred = [...new Set([...(canonicalIntent.preferredPlaceTypes??[]),...(requestContext.preferredPlaceTypes ?? []), ...(requestContext.intent?.primaryPlaceTypes ?? [])].map((value)=>String(value).trim().toLowerCase()).filter(Boolean))];
  const required = [...new Set(canonicalIntent.hardConstraints?.requiredPlaceTypes??(requestContext.strictCategoryIntent === true ? preferred : []))];
  const directions = [...(canonicalIntent.conceptDirections??[]).map(({concept,direction})=>({concept,direction}))];
  const vibes = field(moment,"vibe") ?? [];
  for (const vibe of vibes) {
    if (vibe === "quiet") directions.push({concept:"vibe.quiet",direction:1},{concept:"energy.calm",direction:1},{concept:"vibe.lively",direction:-1},{concept:"energy.energetic",direction:-1});
    if (vibe === "lively") directions.push({concept:"vibe.lively",direction:1},{concept:"energy.energetic",direction:1});
    if (vibe === "cozy") directions.push({concept:"vibe.cozy",direction:1});
    if (vibe === "romantic") directions.push({concept:"vibe.romantic",direction:1},{concept:"social_style.romantic_friendly",direction:1});
  }
  if(directions.some((row)=>row.concept==="vibe.quiet"&&row.direction>0))directions.push({concept:"vibe.lively",direction:-1},{concept:"energy.energetic",direction:-1});
  const query = `${requestContext.query ?? ""} ${requestContext.rawFreeText ?? ""}`.toLowerCase();
  if (/reden|unterhalten|conversation|talk/.test(query)) directions.push({concept:"social_style.conversation_friendly",direction:1});
  return { requiredPlaceTypes:required,preferredPlaceTypes:required.length?[]:preferred,conceptDirections:[...new Map(directions.map((row)=>[row.concept,row])).values()] };
}

function serializeTaste(row) {
  return { nodeKey:row.nodeKey,concept:row.concept,scope:row.scope,affinity:row.affinity,polarity:row.polarity,confidence:row.confidence,relevance:row.relevance,compatibility:row.compatibility,fallbackLevel:row.fallbackLevel,signalType:row.signalType,trend:row.trend,reasonCodes:row.reasonCodes };
}

export function buildProductProjection({userCard,currentMoment,requestContext={}}) {
  const currentIntent = buildCurrentIntent(currentMoment,requestContext);
  const raw = buildMomentAwareRelevantUserProjection({userCard,currentMoment,currentIntent});
  const level = raw.knowledgeSufficiency.finalPersonalizationSufficiency.level;
  const knowledgeMode = level === "HIGH" ? "SUFFICIENT" : level === "PARTIAL" ? "PARTIAL" : "LOW_OR_UNKNOWN";
  const body = {
    version:PRODUCT_PROJECTION_VERSION,
    frozenProjectionVersion:raw.version,
    frozenProjectionHash:raw.projectionHash,
    decisionId:raw.decisionId,userId:raw.userId,currentMomentHash:raw.currentMomentHash,userCardHash:raw.userCardHash,
    taste:raw.taste.map(serializeTaste),
    occasionPatterns:raw.occasionPatterns.map(({patternKey,confidence,relevance,reasonCodes})=>({patternKey,confidence,relevance,reasonCodes})),
    knowledgeSufficiency:raw.knowledgeSufficiency,
    knowledgeMode,
    currentIntent,
    uncertainties:raw.uncertainties,
    suppressionSummary:{suppressedCount:raw.projectionAudit.suppressedCount,suppressionByReason:raw.projectionAudit.suppressionByReason},
    authority:raw.authority,
    boundaries:{rawHistoryIncluded:false,candidateIndependent:true,n6:"NOT_AUTHORIZED"},
  };
  return { currentIntent,raw,projection:{...body,projectionHash:hash(body)},contractHashes:{projection:N5_6_1_PROJECTION_CONTRACT_HASH,sufficiency:N5_6_1_SUFFICIENCY_CONTRACT_HASH} };
}
