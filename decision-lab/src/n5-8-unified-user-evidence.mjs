import { contentHash } from "./canonical-json.mjs";
import { buildN5_7UserCard } from "./n5-7-comparative-preference.mjs";

export const N5_8_EVIDENCE_CONTRACT = Object.freeze({
  version: "backyrd-n5-8-unified-user-evidence-v1",
  layers: {
    EXPOSURE: { events: ["candidate_exposed", "decision_results_shown"], meaning: "PROPOSED_NOT_INTEREST" },
    INTEREST: { events: ["spot_tapped", "spot_opened", "search_result_opened", "saved", "navigation_intent", "reservation_intent"], meaning: "INTEREST_NOT_EXPERIENCE_OR_SATISFACTION" },
    EXPERIENCE: { events: ["verified_visit"], reviewBinding: "VALID_SPOT_BOUND_REVIEW", meaning: "EXPERIENCED_NOT_SATISFIED" },
    SATISFACTION: { events: ["positive_post_visit", "negative_post_visit", "explicit_positive", "explicit_negative"], reviewSentiment: ["POSITIVE", "NEGATIVE", "MIXED", "UNKNOWN"] },
    DIRECT_SEMANTIC: { sources: ["DIRECT_MOOD", "DIRECT_REVIEW", "EXPLICIT_FEEDBACK"], conceptSpecificOnly: true }
  },
  sameJourneyIndependence: "ONE_OUTCOME_OBSERVATION_WITH_MULTIPLE_AUDITED_CHANNELS",
  visitWithoutOutcome: "SATISFACTION_UNKNOWN",
  noReview: "NO_INVENTED_SATISFACTION",
  noLlm: true
});

export const N5_8_MOOD_SEMANTICS = Object.freeze({
  version: "backyrd-n5-8-mood-semantics-v1",
  entries: {
    "gemütlich": { concept: "vibe.cozy", valence: "CONTEXT_DEPENDENT", tendency: 1, strength: .78 },
    "leise": { concept: "vibe.quiet", valence: "CONTEXT_DEPENDENT", tendency: 1, strength: .68 },
    "ruhig": { concept: "vibe.quiet", valence: "CONTEXT_DEPENDENT", tendency: 1, strength: .68 },
    "lebendig": { concept: "vibe.lively", valence: "CONTEXT_DEPENDENT", tendency: 1, strength: .7 },
    "laut": { concept: "vibe.lively", valence: "MOSTLY_NEGATIVE", tendency: -1, strength: .7 },
    "hektisch": { concept: "energy.energetic", valence: "MOSTLY_NEGATIVE", tendency: -1, strength: .76 },
    "authentisch": { concept: "character.authentic_character", valence: "MOSTLY_POSITIVE", tendency: 1, strength: .78 },
    "versteckt": { concept: "discovery.hidden_gem", valence: "CONTEXT_DEPENDENT", tendency: 1, strength: .66 },
    "romantisch": { concept: "vibe.romantic", valence: "CONTEXT_DEPENDENT", tendency: 1, strength: .76 },
    "modern": { concept: "character.design_led", valence: "CONTEXT_DEPENDENT", tendency: 1, strength: .64 },
    "katastrophal": { concept: null, valence: "STRONG_NEGATIVE", tendency: -1, strength: .95 }
  },
  unknownMood: "NO_DIRECT_CONCEPT_EVIDENCE",
  moodAloneNeverInventsUnmappedConcept: true
});

export const N5_8_REVIEW_UNDERSTANDING_CONTRACT = Object.freeze({
  version: "backyrd-n5-8-review-understanding-v1",
  input: ["review_text", "selected_moods", "spot_binding", "N4_spot_intelligence", "known_moment_context"],
  output: ["overall_sentiment", "explicit_attribute_claims", "repeat_intent", "evidence_references"],
  sentiment: ["POSITIVE", "NEGATIVE", "MIXED", "UNKNOWN"],
  attributePolicy: "LEXICALLY_EXPLICIT_AND_CANONICAL_ONLY",
  hallucination: "FAIL_CLOSED",
  sensitiveInference: false,
  externalModel: false
});

export const N5_8_FUSION_CONTRACT = Object.freeze({
  version: "backyrd-n5-8-evidence-fusion-v1",
  channels: ["BEHAVIORAL", "COMPARATIVE_OUTCOMES", "DIRECT_MOOD", "DIRECT_REVIEW", "EXPLICIT_FEEDBACK"],
  behavioralSignedTaste: false,
  directSingleObservation: "HYPOTHESIS_MAXIMUM",
  directDurableRequirements: { independentSessions: 2, distinctSpots: 2, consistency: .67 },
  directVsComparativeConflict: "MIXED_OR_CONFIDENCE_REDUCTION",
  journeyDeduplication: true,
  globalDirectRequirements: { independentContextsOrPlaceTypes: 2 },
  rebuildFromCanonicalEvidence: true
});

export const N5_8_CONTRACT_HASH = contentHash({ evidence: N5_8_EVIDENCE_CONTRACT, moods: N5_8_MOOD_SEMANTICS, review: N5_8_REVIEW_UNDERSTANDING_CONTRACT, fusion: N5_8_FUSION_CONTRACT });

const round = (x) => Number(x.toFixed(6));
const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const unique = (xs) => [...new Set(xs.filter(Boolean))].sort();
const positiveText = /\b(super|toll|perfekt|grossartig|großartig|entspannt|komme wieder|voll mein ding|war gut)\b/i;
const negativeText = /\b(katastrophal|schlecht|enttäuschend|eher nicht|komme nicht wieder|viel zu laut|zu hektisch|ungemütlich)\b/i;
const REVIEW_RULES = Object.freeze([
  { concept: "vibe.cozy", sentiment: 1, pattern: /\b(gemütlich|kuschelig|wohnlich)\b/i },
  { concept: "vibe.cozy", sentiment: -1, pattern: /\b(ungemütlich|kalt eingerichtet)\b/i },
  { concept: "vibe.quiet", sentiment: 1, pattern: /\b(leise|ruhig|nicht so laut)\b/i },
  { concept: "vibe.lively", sentiment: -1, pattern: /\b(viel zu laut|zu laut)\b/i },
  { concept: "social_style.conversation_friendly", sentiment: 1, pattern: /\b(gut unterhalten|konnte man sich unterhalten|gespräch möglich)\b/i },
  { concept: "social_style.conversation_friendly", sentiment: -1, pattern: /\b(nicht unterhalten|kein gespräch möglich)\b/i },
  { concept: "character.authentic_character", sentiment: 1, pattern: /\b(authentisch|echt und unverstellt)\b/i },
  { concept: "discovery.hidden_gem", sentiment: 1, pattern: /\b(geheimtipp|versteckt)\b/i },
  { concept: "price.budget", sentiment: 1, pattern: /\b(günstig|preiswert)\b/i },
  { concept: "price.premium", sentiment: -1, pattern: /\b(zu teuer|überteuert)\b/i },
  { concept: "energy.energetic", sentiment: -1, pattern: /\b(hektisch|zu hektisch)\b/i },
  { concept: "vibe.romantic", sentiment: 1, pattern: /\b(romantisch)\b/i },
  { concept: "character.design_led", sentiment: 1, pattern: /\b(tolles design|modern gestaltet)\b/i }
]);

function quoteFor(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  const start = Math.max(0, match.index - 28), end = Math.min(text.length, match.index + match[0].length + 28);
  return text.slice(start, end).trim().slice(0, 120);
}

export function understandReview(review, { spotIntelligence = null } = {}) {
  if (!review || review.spotBinding?.status !== "CONFIRMED" || review.spotBinding.confidence < .8) throw new Error("n58_review_spot_binding_required");
  const text = String(review.text ?? "").trim().slice(0, 2_000);
  const pos = positiveText.test(text), neg = negativeText.test(text);
  const overallSentiment = pos && neg ? "MIXED" : pos ? "POSITIVE" : neg ? "NEGATIVE" : review.declaredSentiment ?? "UNKNOWN";
  const n4 = spotIntelligence?.concepts ?? {};
  const claims = [];
  for (const rule of REVIEW_RULES) {
    const quote = quoteFor(text, rule.pattern);
    if (!quote) continue;
    if (n4[rule.concept] && n4[rule.concept].confidence < .35) continue;
    claims.push({ concept: rule.concept, sentiment: rule.sentiment > 0 ? "POSITIVE" : "NEGATIVE", confidence: .9, source: "DIRECT_REVIEW", evidenceRef: `${review.reviewId}:text:${claims.length}`, quote });
  }
  const repeatIntent = /\b(komme wieder|wiederkommen|nochmal hin)\b/i.test(text) && !/\b(nicht wieder|nie wieder)\b/i.test(text) ? "POSITIVE" : /\b(nicht wieder|nie wieder)\b/i.test(text) ? "NEGATIVE" : "UNKNOWN";
  return { version: N5_8_REVIEW_UNDERSTANDING_CONTRACT.version, reviewId: review.reviewId, overallSentiment, repeatIntent, claims, interpretationHash: contentHash({ reviewId: review.reviewId, overallSentiment, repeatIntent, claims }) };
}

export function understandMoods(review, reviewUnderstanding) {
  const direction = reviewUnderstanding.overallSentiment === "NEGATIVE" ? -1 : reviewUnderstanding.overallSentiment === "POSITIVE" ? 1 : 0;
  return unique(review.moods ?? []).flatMap((token) => {
    const normalized = String(token).trim().toLowerCase(); const entry = N5_8_MOOD_SEMANTICS.entries[normalized];
    if (!entry?.concept || direction === 0) return [];
    const sign = entry.valence === "MOSTLY_NEGATIVE" || entry.valence === "STRONG_NEGATIVE" ? -1 : entry.valence === "MOSTLY_POSITIVE" ? 1 : direction;
    return [{ concept: entry.concept, sentiment: sign > 0 ? "POSITIVE" : "NEGATIVE", confidence: round(entry.strength * review.spotBinding.confidence), source: "DIRECT_MOOD", evidenceRef: `${review.reviewId}:mood:${normalized}`, token: normalized }];
  });
}

function behaviorSummary(events) {
  const bySpot = new Map();
  const add = (event, layer) => { if (!event.spotId) return; if (!bySpot.has(event.spotId)) bySpot.set(event.spotId, { spotId: event.spotId, exposure: [], interest: [], experience: [], satisfaction: [] }); bySpot.get(event.spotId)[layer].push(event.id); };
  for (const event of events) {
    if (["candidate_exposed"].includes(event.eventType)) add(event, "exposure");
    if (["spot_tapped", "spot_opened", "search_result_opened", "saved", "navigation_intent", "reservation_intent"].includes(event.eventType)) add(event, "interest");
    if (event.eventType === "verified_visit" || event.reviewEvidence?.spotBinding?.status === "CONFIRMED") add(event, "experience");
    if (["positive_post_visit", "negative_post_visit", "explicit_positive", "explicit_negative"].includes(event.eventType)) add(event, "satisfaction");
  }
  const spots = [...bySpot.values()].map((row) => ({ ...row, exposure: row.exposure.sort(), interest: row.interest.sort(), experience: row.experience.sort(), satisfaction: row.satisfaction.sort() })).sort((a, b) => a.spotId.localeCompare(b.spotId));
  return { spots, counts: { exposure: spots.filter((x) => x.exposure.length).length, interest: spots.filter((x) => x.interest.length).length, experience: spots.filter((x) => x.experience.length).length, satisfaction: spots.filter((x) => x.satisfaction.length).length } };
}

function directSamples(events, spotIntelligence, channels) {
  const samples = [];
  for (const event of events.filter((x) => x.reviewEvidence)) {
    const review = event.reviewEvidence; const understood = understandReview(review, { spotIntelligence: spotIntelligence[event.spotId] });
    const claims = [...(channels.review ? understood.claims : []), ...(channels.mood ? understandMoods(review, understood) : [])];
    const merged = new Map();
    for (const claim of claims) {
      const key = `${claim.concept}:${claim.sentiment}`; const prior = merged.get(key);
      merged.set(key, prior ? { ...prior, confidence: Math.max(prior.confidence, claim.confidence), sources: unique([...prior.sources, claim.source]), evidenceRefs: unique([...prior.evidenceRefs, claim.evidenceRef]) } : { concept: claim.concept, sign: claim.sentiment === "POSITIVE" ? 1 : -1, confidence: claim.confidence, sources: [claim.source], evidenceRefs: [claim.evidenceRef] });
    }
    for (const claim of merged.values()) samples.push({ ...claim, reviewId: review.reviewId, eventId: event.id, journeyKey: review.journeyLink?.journeyKey ?? event.sessionId, sessionId: event.sessionId, spotId: event.spotId, occurredAt: event.occurredAt, placeType: event.spotEvidence.placeType, contextKey: event.momentSignature.audience && event.momentSignature.audience !== "other" ? `audience.${event.momentSignature.audience}` : null, interpretation: understood });
  }
  return samples.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId) || a.concept.localeCompare(b.concept));
}

function directNodes(samples) {
  const groups = new Map();
  const scopes = (s) => [{ kind: "GLOBAL", key: "global" }, { kind: "PLACE_TYPE", key: s.placeType }, ...(s.contextKey ? [{ kind: "CONTEXT", key: s.contextKey }] : [])];
  for (const sample of samples) for (const scope of scopes(sample)) {
    const key = `${scope.kind}:${scope.key}:${sample.concept}`;
    if (!groups.has(key)) groups.set(key, { nodeKey: key, concept: sample.concept, scope, samples: [] });
    groups.get(key).samples.push(sample);
  }
  return [...groups.values()].map((group) => {
    const journeys = new Map();
    for (const sample of group.samples) { const prior = journeys.get(sample.journeyKey); if (!prior || sample.confidence > prior.confidence) journeys.set(sample.journeyKey, sample); }
    const rows = [...journeys.values()]; const positive = rows.filter((x) => x.sign > 0), negative = rows.filter((x) => x.sign < 0);
    const signed = rows.reduce((sum, x) => sum + x.sign * x.confidence, 0) / Math.max(.0001, rows.reduce((sum, x) => sum + x.confidence, 0));
    const sessions = new Set(rows.map((x) => x.sessionId)).size, spots = new Set(rows.map((x) => x.spotId)).size;
    const breadth = Math.max(new Set(rows.map((x) => x.contextKey).filter(Boolean)).size, new Set(rows.map((x) => x.placeType)).size);
    const consistency = Math.max(positive.length, negative.length) / rows.length;
    const durable = sessions >= 2 && spots >= 2 && consistency >= .67 && (group.scope.kind !== "GLOBAL" || breadth >= 2);
    const conflict = positive.length > 0 && negative.length > 0;
    const knowledgeState = durable ? signed >= 0 ? "POSITIVE" : "NEGATIVE" : conflict ? "MIXED" : signed >= 0 ? "HYPOTHESIS_POSITIVE" : "HYPOTHESIS_NEGATIVE";
    const confidence = round(clamp((durable ? .52 : .24) + .12 * Math.min(3, sessions) + .08 * Math.min(2, spots) - (conflict ? .18 : 0), 0, .88));
    return { ...group, samples: rows, affinity: round(signed), confidence, knowledgeState, polarity: durable ? signed >= 0 ? "POSITIVE" : "NEGATIVE" : conflict ? "MIXED" : "UNKNOWN", positiveEvidence: round(positive.reduce((s, x) => s + x.confidence, 0)), negativeEvidence: round(negative.reduce((s, x) => s + x.confidence, 0)), recentAffinity: round(signed), longTermAffinity: round(signed), trend: "STABLE", contradictions: conflict ? [{ kind: "DIRECT_SEMANTIC_CONFLICT", positive: positive.length, negative: negative.length }] : [], evidenceDepth: { chains: rows.length, independentSessions: sessions, independentSpots: spots, outcomes: rows.length, sourceFamilies: unique(rows.flatMap((x) => x.sources)) }, evidenceRefs: rows.map((x) => ({ eventId: x.eventId, reviewId: x.reviewId, evidenceRefs: x.evidenceRefs })), provenance: unique(rows.flatMap((x) => x.sources)), directEvidence: { reviews: rows.length, consistency: round(consistency), breadth, samples: rows.map((x) => ({ reviewId: x.reviewId, sign: x.sign, confidence: x.confidence, sources: x.sources, evidenceRefs: x.evidenceRefs })) } };
  }).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
}

function fuseNode(comparative, direct) {
  if (!comparative) return { ...direct, evidenceComposition: { behavioral: 0, comparative: 0, mood: direct.samples.filter((x) => x.sources.includes("DIRECT_MOOD")).length, review: direct.samples.filter((x) => x.sources.includes("DIRECT_REVIEW")).length, explicit: 0 } };
  if (!direct) return { ...comparative, evidenceComposition: { behavioral: 0, comparative: comparative.evidenceDepth.outcomes, mood: 0, review: 0, explicit: comparative.evidenceDepth.outcomes } };
  const compKnown = ["POSITIVE", "NEGATIVE"].includes(comparative.knowledgeState), directKnown = ["POSITIVE", "NEGATIVE"].includes(direct.knowledgeState);
  const conflict = Math.sign(comparative.affinity) !== Math.sign(direct.affinity) && Math.abs(comparative.affinity) > .1 && Math.abs(direct.affinity) > .1;
  const weight = comparative.confidence + direct.confidence || 1; const affinity = round((comparative.affinity * comparative.confidence + direct.affinity * direct.confidence) / weight);
  const polarity = conflict && (compKnown || directKnown) ? "MIXED" : directKnown ? direct.polarity : compKnown ? comparative.polarity : "UNKNOWN";
  const knowledgeState = polarity === "MIXED" ? "MIXED" : directKnown ? direct.knowledgeState : compKnown ? comparative.knowledgeState : direct.knowledgeState !== "MIXED" ? direct.knowledgeState : comparative.knowledgeState;
  const sameReviews = new Set(direct.samples.map((x) => x.eventId)); const independentComparative = comparative.evidenceRefs.filter((x) => !sameReviews.has(x.eventId)).length;
  const confidence = round(clamp(Math.max(comparative.confidence, direct.confidence) + (independentComparative > 0 && !conflict ? .06 : 0) - (conflict ? .2 : 0), 0, .9));
  return { ...comparative, affinity, confidence, polarity, knowledgeState, positiveEvidence: round(comparative.positiveEvidence + direct.positiveEvidence), negativeEvidence: round(comparative.negativeEvidence + direct.negativeEvidence), recentAffinity: affinity, longTermAffinity: affinity, contradictions: [...comparative.contradictions, ...direct.contradictions, ...(conflict ? [{ kind: "COMPARATIVE_DIRECT_CONFLICT" }] : [])], evidenceDepth: { chains: new Set([...comparative.evidenceRefs.map((x) => x.eventId), ...direct.samples.map((x) => x.journeyKey)]).size, independentSessions: new Set([...direct.samples.map((x) => x.sessionId), ...comparative.evidenceRefs.map((x) => x.eventId)]).size, independentSpots: new Set([...direct.samples.map((x) => x.spotId)]).size || comparative.evidenceDepth.independentSpots, outcomes: new Set([...comparative.evidenceRefs.map((x) => x.eventId), ...direct.samples.map((x) => x.eventId)]).size, reviews: direct.samples.length, sourceFamilies: unique([...comparative.evidenceDepth.sourceFamilies, ...direct.evidenceDepth.sourceFamilies]) }, evidenceRefs: [...comparative.evidenceRefs, ...direct.evidenceRefs], provenance: unique([...comparative.provenance, ...direct.provenance]), directEvidence: direct.directEvidence, evidenceComposition: { behavioral: 0, comparative: comparative.evidenceDepth.outcomes, mood: direct.samples.filter((x) => x.sources.includes("DIRECT_MOOD")).length, review: direct.samples.filter((x) => x.sources.includes("DIRECT_REVIEW")).length, explicit: comparative.evidenceDepth.outcomes } };
}

export function buildN5_8UserCard(events, { asOf, spotIntelligence = {}, channels = { comparative: true, mood: true, review: true } } = {}) {
  const base = buildN5_7UserCard(events, { asOf, spotIntelligence });
  const comparativeNodes = channels.comparative ? base.userCard.nodes : [];
  const samples = directSamples(events, spotIntelligence, channels); const direct = directNodes(samples);
  const compMap = new Map(comparativeNodes.map((x) => [x.nodeKey, x])), directMap = new Map(direct.map((x) => [x.nodeKey, x]));
  const nodes = unique([...compMap.keys(), ...directMap.keys()]).map((key) => fuseNode(compMap.get(key), directMap.get(key))).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
  const behavior = behaviorSummary(events); const durable = nodes.filter((x) => ["POSITIVE", "NEGATIVE"].includes(x.knowledgeState));
  const cardBody = { ...base.userCard, nodes, behavioralEvidence: behavior, evidenceChannelSummary: { comparativeOutcomes: channels.comparative ? base.outcomeObservations.length : 0, directMoodClaims: samples.filter((x) => x.sources.includes("DIRECT_MOOD")).length, directReviewClaims: samples.filter((x) => x.sources.includes("DIRECT_REVIEW")).length, reviews: new Set(samples.map((x) => x.reviewId)).size }, comparativeSummary: { observations: channels.comparative ? base.outcomeObservations.length : 0, durablePositive: nodes.filter((x) => x.knowledgeState === "POSITIVE").length, durableNegative: nodes.filter((x) => x.knowledgeState === "NEGATIVE").length, hypotheses: nodes.filter((x) => x.knowledgeState?.startsWith("HYPOTHESIS")).length, mixed: nodes.filter((x) => x.knowledgeState === "MIXED").length, unknown: nodes.filter((x) => x.knowledgeState === "UNKNOWN").length }, contradictions: nodes.filter((x) => x.contradictions?.length).map((x) => ({ nodeKey: x.nodeKey, contradictions: x.contradictions })), uncertainty: { ...base.userCard.uncertainty, unknownConceptCount: Math.max(0, base.userCard.uncertainty.unknownConceptCount - new Set(durable.filter((x) => x.scope.kind === "GLOBAL").map((x) => x.concept)).size) }, boundaries: { ...base.userCard.boundaries, unifiedEvidence: N5_8_EVIDENCE_CONTRACT.version, fusion: N5_8_FUSION_CONTRACT.version }, userCardHash: undefined };
  delete cardBody.userCardHash; const userCard = { ...cardBody, userCardHash: contentHash(cardBody) };
  const ledger = nodes.map((node) => { const body = { version: "backyrd-n5-8-change-ledger-v1", userId: userCard.userId, nodeKey: node.nodeKey, before: null, after: { knowledgeState: node.knowledgeState, affinity: node.affinity, confidence: node.confidence, polarity: node.polarity }, evidenceComposition: node.evidenceComposition, evidenceRefs: node.evidenceRefs, reasonCode: node.directEvidence ? "DIRECT_AND_COMPARATIVE_EVIDENCE_FUSED" : "COMPARATIVE_PREFERENCE_INFERRED", occurredAt: node.directEvidence?.samples.at(-1)?.occurredAt ?? node.comparativeEvidence?.lastEvidenceAt ?? asOf }; return { ...body, changeId: contentHash(body) }; });
  return { userCard, evidenceChains: base.evidenceChains, outcomeObservations: channels.comparative ? base.outcomeObservations : [], directSemanticSamples: samples, changeLedger: ledger, identities: { ...base.identities, n58ContractHash: N5_8_CONTRACT_HASH } };
}

export function verifyN5_8Rebuild(events, options) { const a = buildN5_8UserCard(events, options), b = buildN5_8UserCard([...events].reverse(), options); return { pass: a.userCard.userCardHash === b.userCard.userCardHash && contentHash(a.changeLedger) === contentHash(b.changeLedger), directHash: a.userCard.userCardHash, replayHash: b.userCard.userCardHash }; }
