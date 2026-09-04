#!/usr/bin/env node

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

if (process.env.BACKYRD_GATE6_PRODUCTION_FORENSICS !== "READ_ONLY") throw new Error("read-only acknowledgement required");
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url?.includes("hjgcrrzfjchzqoegcywn") || !serviceKey || !anonKey) throw new Error("Production credentials required");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, serviceKey, options);
const anon = createClient(url, anonKey, options);
const read = async (table, columns = "*") => {
  const { data, error } = await service.from(table).select(columns).limit(1000);
  assert.ifError(error); return data;
};
const grouped = (rows, key) => Object.fromEntries(
  [...rows.reduce((m, row) => m.set(key(row), (m.get(key(row)) ?? 0) + 1), new Map()).entries()].sort(),
);

const [reviews, reservations, spots, posts, safety, states, rights] = await Promise.all([
  read("reviews", "id,user_id,spot_id,created_at,data_origin,review_origin"),
  read("backyrd_review_daily_publications_v1", "user_id,spot_id,local_day,review_id,reservation_origin"),
  read("spots", "id,status,data_origin"),
  read("social_posts", "id,user_id,spot_id,review_id,source_type,status,visibility"),
  read("safety_content_items", "id,entity_type,entity_id,lifecycle_status"),
  read("distribution_trust_states", "content_item_id,effective_state"),
  read("data_rights_requests", "id,user_id,request_type,status"),
]);
const spotById = new Map(spots.map((row) => [row.id, row]));
const reservationsByKey = new Set(reservations.map((r) => `${r.user_id}:${r.spot_id}:${r.local_day}`));
const realReviews = reviews.filter((r) => r.data_origin === "REAL");
const duplicates = [...realReviews.reduce((m, r) => {
  if (!r.user_id) return m;
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(r.created_at));
  const key = `${r.user_id}:${r.spot_id}:${localDay}`;
  m.set(key, [...(m.get(key) ?? []), r]); return m;
}, new Map()).entries()].filter(([, rows]) => rows.length > 1);

const fixtureReviews = reviews.filter((r) => ["TEST", "FIXTURE"].includes(r.data_origin) || r.review_origin === "FIXTURE");
let webDetailFixtureLeaks = 0;
for (const spotId of new Set(fixtureReviews.map((r) => r.spot_id))) {
  const { data, error } = await anon.rpc("backyrd_web_spot_detail_v1", { p_spot_id: spotId });
  assert.ifError(error);
  const returned = new Set((data?.reviews ?? []).map((row) => row.id));
  webDetailFixtureLeaks += fixtureReviews.filter((r) => r.spot_id === spotId && returned.has(r.id)).length;
}

const auth = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
assert.ifError(auth.error);
const authClasses = { gate4: 0, gate5: 0, fixtureInvalid: 0, explicitTest: 0 };
for (const user of auth.data.users) {
  const email = user.email ?? "";
  if (/^g4-[0-9a-f]{14}-[uvf]@backyrd\.ch$/i.test(email)) authClasses.gate4 += 1;
  if (/^g5-[0-9a-f]{14}-[abc]@backyrd\.ch$/i.test(email)) authClasses.gate5 += 1;
  if (/@fixture\.invalid$/i.test(email)) authClasses.fixtureInvalid += 1;
  if (/(^|[-+])test([-+@]|$)/i.test(email)) authClasses.explicitTest += 1;
}

const archivedPosts = posts.filter((p) => p.spot_id && spotById.get(p.spot_id)?.status === "archived");
const output = {
  result: "PASS",
  reviewOrigins: grouped(reviews, (r) => `${r.data_origin}/${r.review_origin}`),
  fixtureReviewFacts: {
    total: fixtureReviews.length,
    onApprovedRealSpots: fixtureReviews.filter((r) => spotById.get(r.spot_id)?.status === "approved" && !["TEST", "FIXTURE"].includes(spotById.get(r.spot_id)?.data_origin)).length,
    linkedPublishedPosts: fixtureReviews.filter((r) => posts.some((p) => p.review_id === r.id && p.status === "published")).length,
    exposedByPublicWebDetail: webDetailFixtureLeaks,
    earliestDay: fixtureReviews.map((r) => String(r.created_at).slice(0, 10)).sort()[0] ?? null,
    latestDay: fixtureReviews.map((r) => String(r.created_at).slice(0, 10)).sort().at(-1) ?? null,
  },
  sameDayHistoricalFacts: {
    duplicateGroups: duplicates.length,
    allHaveReservation: duplicates.every(([key]) => reservationsByKey.has(key)),
    latestDuplicateDay: duplicates.flatMap(([, rows]) => rows.map((r) => String(r.created_at).slice(0, 10))).sort().at(-1) ?? null,
    reservationsByOrigin: grouped(reservations, (r) => r.reservation_origin),
  },
  archivedPostFacts: {
    total: archivedPosts.length,
    byState: grouped(archivedPosts, (p) => `${p.status}/${p.source_type}/${p.visibility}`),
    reviewLinked: archivedPosts.filter((p) => p.review_id).length,
    distributionBlocked: archivedPosts.filter((p) => states.some((s) => ["quarantined", "excluded"].includes(s.effective_state) && safety.some((item) => item.entity_type === "spot" && item.entity_id === p.spot_id && item.entity_id && item.id === s.content_item_id))).length,
  },
  moderationFacts: {
    nonLiveItems: grouped(safety.filter((s) => s.lifecycle_status !== "live"), (s) => `${s.entity_type}/${s.lifecycle_status}`),
  },
  authAcceptanceClasses: authClasses,
  rightsByState: grouped(rights, (r) => `${r.request_type}/${r.status}/${r.user_id ? "linked" : "pseudonymized"}`),
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
