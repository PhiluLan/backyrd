import { createRequire } from "node:module";
const require = createRequire(new URL("../../admin-dashboard/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Production read credentials are not configured.");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const required = async (query, label) => {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.code ?? "query_failed"}`);
  return data ?? [];
};
const group = (rows, keyName) => Object.fromEntries(
  [...new Set(rows.map((row) => row[keyName] ?? "unknown"))].sort().map((keyValue) => [keyValue, rows.filter((row) => (row[keyName] ?? "unknown") === keyValue).length]),
);

const fixtureSpots = await required(
  db.from("spots").select("id,name,status,data_origin,city,owner_id").in("data_origin", ["FIXTURE", "TEST"]),
  "fixture spots",
);
const fixtureIds = fixtureSpots.map((spot) => spot.id);
if (fixtureIds.length === 0) throw new Error("No Fixture/Test spots found; refuse ambiguous snapshot.");

const [allSpots, descriptions, photos, hours, allTaxonomies] = await Promise.all([
  required(db.from("spots").select("id,status,data_origin,name,address,lat,lng,category_id,website,phone,header_photo_path,google_place_id,google_photo_enabled"), "all spots"),
  required(db.from("spot_descriptions").select("spot_id,owner_description,admin_description,enriched_description"), "descriptions"),
  required(db.from("spot_photos").select("spot_id,url"), "photos"),
  required(db.from("spot_hours").select("spot_id,open_time,close_time"), "hours"),
  required(db.from("spot_taxonomies").select("spot_id,taxonomy_node_id"), "all taxonomy mappings"),
]);
const nonBlank = (value) => typeof value === "string" && value.trim().length > 0;
const bySpot = (rows) => new Map(allSpots.map((spot) => [spot.id, rows.filter((row) => row.spot_id === spot.id)]));
const descriptionBySpot = new Map(descriptions.map((row) => [row.spot_id, row]));
const photosBySpot = bySpot(photos); const hoursBySpot = bySpot(hours); const taxonomyBySpot = bySpot(allTaxonomies);
const isProductSpot = (spot) => ["REAL", "IMPORT", "LEGACY"].includes(spot.data_origin) && ["approved", "pending"].includes(spot.status);
const qualityCounts = (spots, includeAdminDescription) => ({
  total: spots.length,
  missingGooglePlaceId: spots.filter((spot) => !nonBlank(spot.google_place_id)).length,
  missingPhoto: spots.filter((spot) => !nonBlank(spot.header_photo_path)
    && !(photosBySpot.get(spot.id) ?? []).some((photo) => nonBlank(photo.url))
    && (!nonBlank(spot.google_place_id) || spot.google_photo_enabled === false)).length,
  missingDescription: spots.filter((spot) => {
    const content = descriptionBySpot.get(spot.id);
    return !content || ![content.owner_description, includeAdminDescription ? content.admin_description : null, content.enriched_description].some(nonBlank);
  }).length,
  missingHours: spots.filter((spot) => !(hoursBySpot.get(spot.id) ?? []).some((row) => row.open_time != null && row.close_time != null)).length,
  missingTaxonomy: spots.filter((spot) => (taxonomyBySpot.get(spot.id) ?? []).length < 4).length,
});
const legacyQuality = qualityCounts(allSpots, false);
const productQuality = qualityCounts(allSpots.filter(isProductSpot), true);
const fixtureQuality = qualityCounts(allSpots.filter((spot) => fixtureIds.includes(spot.id)), false);

const [reviews, events, favorites, claims, impressions, taxonomies, moods, moderation, posts] = await Promise.all([
  required(db.from("reviews").select("id,spot_id,user_id,created_at,data_origin,review_origin").in("spot_id", fixtureIds), "reviews"),
  required(db.from("analytics_events").select("id,spot_id,user_id,event_name,occurred_at").in("spot_id", fixtureIds), "analytics events"),
  required(db.from("favorites").select("id,spot_id,user_id").in("spot_id", fixtureIds), "favorites"),
  required(db.from("spot_claims").select("id,spot_id,status").in("spot_id", fixtureIds), "claims"),
  required(db.from("decision_impressions").select("id,spot_id,decision_id,created_at").in("spot_id", fixtureIds), "decision impressions"),
  required(db.from("spot_taxonomies").select("spot_id,taxonomy_node_id").in("spot_id", fixtureIds), "taxonomy mappings"),
  required(db.from("spot_mood_concepts").select("spot_id,concept_id").in("spot_id", fixtureIds), "mood mappings"),
  required(db.from("spot_owner_change_events").select("id,spot_id,moderation_status").in("spot_id", fixtureIds), "owner moderation"),
  required(db.from("social_posts").select("id,spot_id,user_id,status,created_at").in("spot_id", fixtureIds), "social posts"),
]);

const spotOpenNames = new Set(["spot_opened", "spot_detail_opened"]);
const growthValueNames = new Set([
  "spot_opened", "spot_detail_opened", "decision_spot_opened", "map_spot_opened", "feed_spot_opened",
  "profile_spot_opened", "profile_favorite_spot_opened", "nearby_spot_opened", "decision_started",
  "decision_completed", "review_submitted",
]);
const decisionNames = new Set(["decision_spot_impression", "decision_like", "decision_dislike", "decision_spot_opened", "decision_open"]);
const affectedUsers = new Set([...events.map((row) => row.user_id), ...reviews.map((row) => row.user_id)].filter(Boolean));
const fixtureDecisionIds = [...new Set(impressions.map((row) => row.decision_id))];
let fixtureOnlyDecisionIds = [];
if (fixtureDecisionIds.length > 0) {
  const decisionRows = await required(db.from("decision_impressions").select("decision_id,spot_id").in("decision_id", fixtureDecisionIds), "decision lineage");
  fixtureOnlyDecisionIds = fixtureDecisionIds.filter((decisionId) => decisionRows.filter((row) => row.decision_id === decisionId).every((row) => fixtureIds.includes(row.spot_id)));
}
const userIds = [...affectedUsers];
const monthStart = new Date();
monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
const within = (rows, field, from) => rows.filter((row) => new Date(row[field]) >= from).length;
let productActivityForAffectedUsersThisMonth = 0;
if (userIds.length > 0) {
  const [allUserEvents, allUserReviews, decisions, sessions, domainEvents, mlEvents, feedEvents] = await Promise.all([
    required(db.from("analytics_events").select("spot_id,occurred_at").in("user_id", userIds).gte("occurred_at", monthStart.toISOString()), "affected-user analytics"),
    required(db.from("reviews").select("spot_id,created_at").in("user_id", userIds).gte("created_at", monthStart.toISOString()), "affected-user reviews"),
    required(db.from("decision_sessions").select("created_at").in("user_id", userIds).gte("created_at", monthStart.toISOString()), "affected-user decisions"),
    required(db.from("analytics_sessions").select("started_at").in("user_id", userIds).gte("started_at", monthStart.toISOString()), "affected-user sessions"),
    required(db.from("user_events").select("created_at").in("user_id", userIds).gte("created_at", monthStart.toISOString()), "affected-user domain events"),
    required(db.from("backyrd_ml_events_v1").select("spot_id,created_at").in("user_id", userIds).gte("created_at", monthStart.toISOString()), "affected-user ML events"),
    required(db.from("social_feed_events").select("spot_id,created_at").in("user_id", userIds).gte("created_at", monthStart.toISOString()), "affected-user feed events"),
  ]);
  const isProductLinked = (row) => row.spot_id == null || !fixtureIds.includes(row.spot_id);
  productActivityForAffectedUsersThisMonth = allUserEvents.filter(isProductLinked).length
    + allUserReviews.filter(isProductLinked).length + decisions.length + sessions.length + domainEvents.length
    + mlEvents.filter(isProductLinked).length + feedEvents.filter(isProductLinked).length;
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  mode: "READ_ONLY_PRODUCTION_FIXTURE_IMPACT",
  contract: "admin_product_spot_universe_v2",
  retainedHistory: {
    fixtureSpots: fixtureSpots.length,
    reviews: reviews.length,
    analyticsEvents: events.length,
    favorites: favorites.length,
    claims: claims.length,
    decisionImpressions: impressions.length,
    taxonomyMappings: taxonomies.length,
    moodMappings: moods.length,
    ownerModerationEvents: moderation.length,
    socialPosts: posts.length,
  },
  fixtureSpots: fixtureSpots.map(({ name, status, data_origin: dataOrigin }) => ({ name, status, dataOrigin })),
  eventTypes: group(events, "event_name"),
  currentMonth: {
    startsAt: monthStart.toISOString(),
    fixtureReviews: within(reviews, "created_at", monthStart),
    fixtureAnalyticsEvents: within(events, "occurred_at", monthStart),
    fixtureDecisionImpressions: within(impressions, "created_at", monthStart),
    fixtureOnlyDecisionSessions: fixtureOnlyDecisionIds.length,
    fixtureSocialPosts: within(posts, "created_at", monthStart),
    affectedActiveUsersExactDelta: productActivityForAffectedUsersThisMonth === 0 ? affectedUsers.size : 0,
  },
  qualityCorrection: {
    legacyVisibleCounts: legacyQuality,
    productOnlyLiveCounts: productQuality,
    directFixtureContributionToLegacyCounts: fixtureQuality,
    descriptionDifferenceAlsoIncludesCanonicalAdminDescriptionsAndNonProductStatuses: legacyQuality.missingDescription - productQuality.missingDescription - fixtureQuality.missingDescription,
  },
  affectedMetrics: {
    overview: {
      reviews: reviews.length,
      spotOpens: events.filter((event) => spotOpenNames.has(event.event_name)).length,
      affectedActiveUsersUpperBound: affectedUsers.size,
    },
    growth: {
      valueEvents: events.filter((event) => growthValueNames.has(event.event_name)).length,
      affectedUsersUpperBound: affectedUsers.size,
    },
    userAnalytics: {
      reviewRows: reviews.length,
      spotLinkedTimelineRows: events.length,
      affectedUsers: affectedUsers.size,
    },
    decisionDiagnostics: {
      analyticsEvents: events.filter((event) => decisionNames.has(event.event_name)).length,
      impressionRows: impressions.length,
      fixtureOnlySessions: fixtureOnlyDecisionIds.length,
    },
    moments: {
      shares: events.filter((event) => event.event_name === "feed_post_shared").length,
      posts: posts.length,
    },
    reviews: { rows: reviews.length },
    claims: { rows: claims.length },
    taxonomy: { mappings: taxonomies.length },
    moods: { mappings: moods.length },
    trustModeration: { auditRows: moderation.length },
    quality: { fixtureSpots: fixtureSpots.length },
  },
};

process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
