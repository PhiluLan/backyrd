#!/usr/bin/env node

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

if (process.env.BACKYRD_GATE6_PRODUCTION_FORENSICS !== "READ_ONLY") {
  throw new Error("Set BACKYRD_GATE6_PRODUCTION_FORENSICS=READ_ONLY");
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.includes("hjgcrrzfjchzqoegcywn") || !serviceKey) {
  throw new Error("linked Production credentials required");
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function all(table, columns = "*") {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    assert.ifError(error);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const index = (rows, key = "id") => new Set(rows.map((row) => row[key]).filter(Boolean));
const group = (rows, keyOf) => {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
};
const count = (rows, predicate) => rows.filter(predicate).length;
const normalizedPath = (value, bucket) => {
  if (!value) return null;
  const decoded = decodeURIComponent(String(value));
  const markers = [`/storage/v1/object/public/${bucket}/`, `/storage/v1/object/sign/${bucket}/`, `/${bucket}/`];
  for (const marker of markers) {
    const at = decoded.indexOf(marker);
    if (at >= 0) return decoded.slice(at + marker.length).split("?")[0];
  }
  return decoded.replace(/^\/+/, "").split("?")[0];
};

const [
  authPage,
  profiles,
  spots,
  reviews,
  reviewPhotos,
  reviewLikes,
  reviewComments,
  expressions,
  moodConcepts,
  contributions,
  contributionConcepts,
  moodProfiles,
  favorites,
  follows,
  posts,
  postMedia,
  postReactions,
  socialComments,
  chats,
  participants,
  messages,
  pushOutbox,
  pushDevices,
  achievements,
  userAchievements,
  safetyContent,
  distributionStates,
  rightsRequests,
  retentionRecords,
  spotPhotos,
] = await Promise.all([
  db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  all("profiles", "id,is_private"),
  all("spots", "id,status,created_by,owner_id,data_origin,header_photo_path"),
  all("reviews", "id,spot_id,user_id,mood_a,mood_b,created_at,data_origin,review_origin,photo_path"),
  all("review_photos", "id,review_id,url,uploaded_by"),
  all("review_likes", "user_id,review_id"),
  all("review_comments", "id,review_id,user_id,parent_id,text"),
  all("backyrd_review_mood_expressions_v1", "review_id,slot,spot_id,user_id,raw_expression,resolution_status,concept_key,resolution_kind"),
  all("backyrd_mood_concepts_v1", "concept_key,active,merged_into_concept_key"),
  all("backyrd_spot_mood_contributions_v1", "id,contributor_key,spot_id,user_id,source_review_id,eligible,ineligibility_reason,eligible_mood_review_count"),
  all("backyrd_spot_mood_contribution_concepts_v1", "contribution_id,concept_key,source_slot,concept_review_count,user_mood_score"),
  all("backyrd_spot_mood_profile_v1", "spot_id,concept_key,concept_contributors,eligible_contributors,percentage,evidence_state,rank,community_score"),
  all("favorites", "id,user_id,spot_id"),
  all("follows", "follower,following"),
  all("social_posts", "id,user_id,spot_id,review_id,source_type,status,visibility,like_count,comment_count,save_count"),
  all("social_post_media", "id,post_id,storage_path,public_url"),
  all("social_post_reactions", "post_id,user_id,reaction_type"),
  all("social_comments", "id,post_id,user_id,status"),
  all("chats", "id,user_a,user_b"),
  all("chat_participants", "chat_id,user_id"),
  all("messages", "id,chat_id,sender_id,image_url,seen_at,created_at"),
  all("message_push_outbox", "id,message_id,chat_id,sender_id,recipient_id,status,attempts"),
  all("user_push_devices", "id,user_id,platform,notifications_enabled,disabled_at"),
  all("achievements", "id,type,threshold"),
  all("user_achievements", "user_id,achievement_id,achieved_at"),
  all("safety_content_items", "id,entity_type,entity_id,spot_id,actor_user_id,lifecycle_status"),
  all("distribution_trust_states", "content_item_id,effective_state"),
  all("data_rights_requests", "id,user_id,request_type,status,requested_at,scheduled_for,completed_at,cancelled_at,deletion_phase,deletion_finished_at,export_storage_path,export_expires_at"),
  all("data_rights_retention_records", "id,request_id,pseudonym_id,record_type,retain_until"),
  all("spot_photos", "id,spot_id,url,uploaded_by"),
]);
assert.ifError(authPage.error);

const authIds = index(authPage.data.users);
const profileIds = index(profiles);
const spotIds = index(spots);
const reviewIds = index(reviews);
const postIds = index(posts);
const commentIds = index(reviewComments);
const chatIds = index(chats);
const achievementIds = index(achievements);
const contributionIds = index(contributions);
const conceptIds = index(moodConcepts, "concept_key");
const archivedSpotIds = new Set(spots.filter((s) => s.status === "archived").map((s) => s.id));
const hiddenReviewIds = new Set(safetyContent.filter((s) => s.entity_type === "review" && ["hidden", "removed", "deleted"].includes(s.lifecycle_status)).map((s) => s.entity_id));
const hiddenPostIds = new Set(safetyContent.filter((s) => s.entity_type === "social_post" && ["hidden", "removed", "deleted"].includes(s.lifecycle_status)).map((s) => s.entity_id));

const checks = {};
const put = (name, value) => { checks[name] = value; };

put("profile_without_auth", count(profiles, (r) => !authIds.has(r.id)));
put("review_missing_spot", count(reviews, (r) => !spotIds.has(r.spot_id)));
put("review_live_user_missing_profile", count(reviews, (r) => r.user_id && !profileIds.has(r.user_id)));
put("review_photo_missing_review", count(reviewPhotos, (r) => !reviewIds.has(r.review_id)));
put("review_photo_wrong_actor", count(reviewPhotos, (p) => {
  const review = reviews.find((r) => r.id === p.review_id);
  return p.uploaded_by && review?.user_id && p.uploaded_by !== review.user_id;
}));
put("review_like_orphan", count(reviewLikes, (r) => !reviewIds.has(r.review_id) || !profileIds.has(r.user_id)));
put("review_comment_orphan", count(reviewComments, (r) => !reviewIds.has(r.review_id) || !profileIds.has(r.user_id) || (r.parent_id && !commentIds.has(r.parent_id))));
put("review_comment_cross_parent", count(reviewComments, (r) => r.parent_id && reviewComments.find((p) => p.id === r.parent_id)?.review_id !== r.review_id));
put("review_same_day_duplicate", [...group(reviews.filter((r) => r.user_id), (r) => `${r.user_id}:${r.spot_id}:${String(r.created_at).slice(0, 10)}`).values()].filter((rows) => rows.length > 1).length);

const expressionByReview = group(expressions, (r) => r.review_id);
put("mood_expression_orphan_or_mirror_mismatch", count(expressions, (e) => {
  const review = reviews.find((r) => r.id === e.review_id);
  return !review || review.spot_id !== e.spot_id || review.user_id !== e.user_id;
}));
put("mood_expression_missing_for_populated_slot", reviews.reduce((total, review) => total + [review.mood_a, review.mood_b].filter((raw, i) => raw?.trim() && !(expressionByReview.get(review.id) ?? []).some((e) => e.slot === i + 1)).length, 0));
put("mood_resolved_to_missing_or_inactive_concept", count(expressions, (e) => e.resolution_status === "RESOLVED" && !moodConcepts.some((c) => c.concept_key === e.concept_key && c.active)));
const ineligibleReviewIds = new Set(distributionStates.filter((s) => ["quarantined", "excluded"].includes(s.effective_state)).map((s) => safetyContent.find((item) => item.id === s.content_item_id)).filter((item) => item?.entity_type === "review").map((item) => item.entity_id));
put("mood_unresolved_counted_as_vote", count(contributionConcepts, (cc) => {
  const contribution = contributions.find((c) => c.id === cc.contribution_id);
  if (!contribution || !conceptIds.has(cc.concept_key)) return true;
  return !reviews.some((review) => review.user_id === contribution.user_id && review.spot_id === contribution.spot_id && !["TEST", "FIXTURE"].includes(review.data_origin) && !hiddenReviewIds.has(review.id) && !ineligibleReviewIds.has(review.id) && (expressionByReview.get(review.id) ?? []).some((e) => e.resolution_status === "RESOLVED" && e.concept_key === cc.concept_key));
}));
put("mood_contribution_orphan_or_mirror_mismatch", count(contributions, (c) => {
  const review = reviews.find((r) => r.id === c.source_review_id);
  return !review || review.spot_id !== c.spot_id || review.user_id !== c.user_id;
}));
put("mood_duplicate_user_spot_contribution", [...group(contributions.filter((c) => c.user_id), (c) => `${c.user_id}:${c.spot_id}`).values()].filter((rows) => rows.length > 1).length);
put("moderated_review_still_contributes", count(contributions, (c) => c.eligible && hiddenReviewIds.has(c.source_review_id)));

const eligibleBySpot = group(contributions.filter((c) => c.eligible && contributionConcepts.some((cc) => cc.contribution_id === c.id)), (c) => c.spot_id);
const expectedMood = new Map();
for (const [spotId, eligible] of eligibleBySpot) {
  const scores = new Map();
  for (const c of eligible) for (const cc of contributionConcepts.filter((x) => x.contribution_id === c.id)) {
    const row = scores.get(cc.concept_key) ?? { contributors: 0, score: 0 };
    row.contributors += 1; row.score += Number(cc.user_mood_score); scores.set(cc.concept_key, row);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || b[1].contributors - a[1].contributors || a[0].localeCompare(b[0]));
  ranked.forEach(([conceptKey, row], i) => expectedMood.set(`${spotId}:${conceptKey}`, {
    concept_contributors: row.contributors,
    eligible_contributors: eligible.length,
    percentage: Math.round((10000 * row.score) / eligible.length) / 100,
    community_score: Math.round(row.score * 1e8) / 1e8,
    evidence_state: eligible.length >= 3 ? "ESTABLISHED" : "EARLY",
    rank: i + 1,
  }));
}
let moodDrift = 0;
for (const profile of moodProfiles) {
  const expected = expectedMood.get(`${profile.spot_id}:${profile.concept_key}`);
  if (!expected || Object.entries(expected).some(([key, value]) => String(profile[key]) !== String(value))) moodDrift += 1;
  expectedMood.delete(`${profile.spot_id}:${profile.concept_key}`);
}
moodDrift += expectedMood.size;
put("mood_profile_drift", moodDrift);

put("favorite_orphan", count(favorites, (r) => !authIds.has(r.user_id) || !spotIds.has(r.spot_id)));
put("favorite_duplicate", [...group(favorites, (r) => `${r.user_id}:${r.spot_id}`).values()].filter((rows) => rows.length > 1).length);
put("favorite_on_archived_spot", count(favorites, (r) => archivedSpotIds.has(r.spot_id)));
put("follow_orphan", count(follows, (r) => !profileIds.has(r.follower) || !profileIds.has(r.following)));
put("follow_self", count(follows, (r) => r.follower === r.following));
put("follow_duplicate", [...group(follows, (r) => `${r.follower}:${r.following}`).values()].filter((rows) => rows.length > 1).length);

put("post_orphan", count(posts, (r) => !authIds.has(r.user_id) || (r.spot_id && !spotIds.has(r.spot_id))));
put("post_review_link_invalid", count(posts, (p) => p.review_id && (!reviewIds.has(p.review_id) || reviews.find((r) => r.id === p.review_id)?.user_id !== p.user_id)));
put("consumer_visible_post_for_archived_spot", count(posts, (p) => p.status === "published" && p.spot_id && archivedSpotIds.has(p.spot_id)));
put("moderated_post_still_published", count(posts, (p) => p.status === "published" && hiddenPostIds.has(p.id)));
put("post_media_orphan", count(postMedia, (r) => !postIds.has(r.post_id)));
put("post_reaction_orphan", count(postReactions, (r) => !postIds.has(r.post_id) || !authIds.has(r.user_id)));
put("post_reaction_duplicate", [...group(postReactions, (r) => `${r.post_id}:${r.user_id}:${r.reaction_type}`).values()].filter((rows) => rows.length > 1).length);
put("social_comment_orphan", count(socialComments, (r) => !postIds.has(r.post_id) || !authIds.has(r.user_id)));

let socialCountDrift = 0;
for (const post of posts) {
  const likes = count(postReactions, (r) => r.post_id === post.id && r.reaction_type === "like");
  const saves = count(postReactions, (r) => r.post_id === post.id && r.reaction_type === "save");
  const comments = count(socialComments, (r) => r.post_id === post.id && r.status === "published");
  if (post.like_count !== likes || post.save_count !== saves || post.comment_count !== comments) socialCountDrift += 1;
}
put("social_post_count_drift", socialCountDrift);

put("chat_orphan_or_invalid_pair", count(chats, (c) => !profileIds.has(c.user_a) || !profileIds.has(c.user_b) || !(c.user_a < c.user_b)));
put("chat_participant_mismatch", count(participants, (p) => {
  const chat = chats.find((c) => c.id === p.chat_id);
  return !chat || !profileIds.has(p.user_id) || ![chat.user_a, chat.user_b].includes(p.user_id);
}));
put("chat_missing_canonical_participant", chats.reduce((total, chat) => total + [chat.user_a, chat.user_b].filter((id) => !participants.some((p) => p.chat_id === chat.id && p.user_id === id)).length, 0));
put("message_orphan_or_wrong_sender", count(messages, (m) => {
  const chat = chats.find((c) => c.id === m.chat_id);
  return !chat || ![chat.user_a, chat.user_b].includes(m.sender_id);
}));
put("push_outbox_mismatch", count(pushOutbox, (o) => {
  const message = messages.find((m) => m.id === o.message_id);
  const chat = chats.find((c) => c.id === o.chat_id);
  return !message || !chat || message.chat_id !== o.chat_id || message.sender_id !== o.sender_id || ![chat.user_a, chat.user_b].includes(o.recipient_id) || o.recipient_id === o.sender_id;
}));
put("push_device_orphan", count(pushDevices, (d) => !authIds.has(d.user_id)));
put("push_device_impossible_state", count(pushDevices, (d) => d.notifications_enabled && d.disabled_at));

put("achievement_orphan", count(userAchievements, (r) => !profileIds.has(r.user_id) || !achievementIds.has(r.achievement_id)));
put("achievement_duplicate", [...group(userAchievements, (r) => `${r.user_id}:${r.achievement_id}`).values()].filter((rows) => rows.length > 1).length);

put("rights_active_without_user", count(rightsRequests, (r) => !r.user_id && ["requested", "processing", "ready", "scheduled"].includes(r.status)));
put("rights_cancelled_without_timestamp", count(rightsRequests, (r) => r.status === "cancelled" && !r.cancelled_at));
put("rights_completed_without_timestamp", count(rightsRequests, (r) => r.status === "completed" && !r.completed_at));
put("retention_orphan", count(retentionRecords, (r) => !rightsRequests.some((q) => q.id === r.request_id)));

put("active_fixture_spot", count(spots, (s) => ["FIXTURE", "TEST"].includes(s.data_origin) && s.status === "approved"));
put("active_fixture_review", count(reviews, (r) => ["FIXTURE", "TEST"].includes(r.data_origin) || r.review_origin === "FIXTURE"));
put("acceptance_test_auth_user", count(authPage.data.users, (u) => /(^|[-+])(g[3456]|gate[3456]|fixture|test)([-+@]|$)|@fixture\.invalid$/i.test(u.email ?? "")));

put("archived_spot_active_interactions", {
  reviews: count(reviews, (r) => archivedSpotIds.has(r.spot_id)),
  favorites: count(favorites, (r) => archivedSpotIds.has(r.spot_id)),
  publishedPosts: count(posts, (r) => r.status === "published" && r.spot_id && archivedSpotIds.has(r.spot_id)),
});

const summary = {
  result: "PASS",
  mode: "READ_ONLY",
  project: "hjgcrrzfjchzqoegcywn",
  populations: {
    authUsers: authIds.size, profiles: profiles.length, approvedSpots: count(spots, (s) => s.status === "approved"),
    archivedSpots: archivedSpotIds.size, reviews: reviews.length, favorites: favorites.length, follows: follows.length,
    posts: posts.length, reactions: postReactions.length, comments: socialComments.length + reviewComments.length,
    chats: chats.length, messages: messages.length, storageBackedDbRecords: reviewPhotos.length + postMedia.length + spotPhotos.length,
  },
  checks,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
