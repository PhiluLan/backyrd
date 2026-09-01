#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required",
  );
}

const client = (key = anonKey) =>
  createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
const admin = client(serviceKey);
const publicClient = client();
const marker = `g5-${randomUUID().replaceAll("-", "").slice(0, 14)}`;
const password = `Gate5-${randomUUID()}-Strong!`;
const createdUserIds = [];
const createdEntityIds = {
  chat: null,
  moment: null,
  review: null,
};
const report = {};

function pass(name, detail = true) {
  report[name] = detail;
}

async function createUser(suffix, displayName) {
  const email = `${marker}-${suffix}@backyrd.ch`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: displayName },
  });
  assert.ifError(error);
  assert(data.user?.id);
  createdUserIds.push(data.user.id);

  const userClient = client();
  const login = await userClient.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  assert.equal(login.data.user.id, data.user.id);

  const username = `${marker.replaceAll("-", "")}${suffix}`.slice(0, 24);
  const onboarding = await userClient.rpc("complete_profile_onboarding_v2", {
    p_display_name: displayName,
    p_username: username,
    p_age: 30,
    p_city: "Basel",
    p_country: "Schweiz",
  });
  assert.ifError(onboarding.error);
  assert.equal(onboarding.data?.ok, true);
  return { id: data.user.id, email, client: userClient };
}

async function removeIsolatedUser(id) {
  const safety = await admin
    .from("safety_content_items")
    .delete()
    .eq("actor_user_id", id);
  if (safety.error) throw safety.error;
  const removed = await admin.auth.admin.deleteUser(id);
  if (removed.error) throw removed.error;
}

async function cleanup() {
  if (createdEntityIds.chat) {
    await admin.from("chats").delete().eq("id", createdEntityIds.chat);
  }
  if (createdEntityIds.moment) {
    await admin.from("social_posts").delete().eq("id", createdEntityIds.moment);
  }
  if (createdEntityIds.review) {
    await admin.from("reviews").delete().eq("id", createdEntityIds.review);
  }
  for (const id of [...new Set(createdUserIds)]) {
    try {
      await removeIsolatedUser(id);
    } catch (error) {
      process.stderr.write(
        `cleanup_failed:${id.slice(0, 8)}:${error instanceof Error ? error.message : "unknown"}\n`,
      );
    }
  }
}

if (process.argv.includes("--cleanup-stale")) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  assert.ifError(error);
  const isolated = data.users.filter((user) =>
    /^g5-[0-9a-f]{14}-[abc]@backyrd\.ch$/.test(user.email ?? ""),
  );
  for (const user of isolated) await removeIsolatedUser(user.id);
  process.stdout.write(
    `${JSON.stringify({ result: "PASS", removedIsolatedUsers: isolated.length })}\n`,
  );
  process.exit(0);
}

try {
  const catalog = await publicClient.rpc("distribution_trust_spot_catalog_v1", {
    p_query: null,
    p_city: "Basel",
    p_limit: 200,
    p_surface: "discovery",
  });
  assert.ifError(catalog.error);
  assert(Array.isArray(catalog.data));
  assert(catalog.data.length > 0);
  const catalogIds = catalog.data.map((spot) => spot.id);
  assert.equal(new Set(catalogIds).size, catalogIds.length);
  const geoSpots = catalog.data.filter(
    (spot) => Number.isFinite(Number(spot.lat)) && Number.isFinite(Number(spot.lng)),
  );
  assert(geoSpots.length > 0);
  const spot = geoSpots[0];
  pass("home_places_map_catalog", {
    realSpots: catalog.data.length,
    geocodedSpots: geoSpots.length,
    duplicateSpotIds: 0,
  });

  const detail = await publicClient.rpc("backyrd_web_spot_detail_v1", {
    p_spot_id: spot.id,
  });
  assert.ifError(detail.error);
  assert.equal(detail.data?.spot?.id, spot.id);
  assert(detail.data.spot.name);
  assert(Array.isArray(detail.data.opening_hours));
  assert(Array.isArray(detail.data.reviews));
  pass("spot_detail_real_partial_evidence");

  const searchTerm = String(spot.name).split(/\s+/)[0];
  const search = await publicClient.rpc("distribution_trust_spot_catalog_v1", {
    p_query: searchTerm,
    p_city: "Basel",
    p_limit: 50,
    p_surface: "search",
  });
  assert.ifError(search.error);
  assert(search.data.some((row) => row.id === spot.id));
  pass("places_search_and_open");

  const guestFavorite = await publicClient
    .from("favorites")
    .insert({ user_id: randomUUID(), spot_id: spot.id });
  assert(guestFavorite.error);
  const guestPrivacy = await publicClient.rpc("set_my_profile_privacy_v1", {
    p_is_private: true,
  });
  assert(guestPrivacy.error);
  pass("guest_write_boundary");

  const a = await createUser("a", "Gate Five A");
  const b = await createUser("b", "Gate Five B");
  const c = await createUser("c", "Gate Five C");

  const ownProfile = await a.client
    .from("profiles")
    .select("id,display_name,username,city,is_private")
    .eq("id", a.id)
    .single();
  assert.ifError(ownProfile.error);
  const foreignProfile = await a.client.rpc("get_social_profile_v2", {
    p_user_id: b.id,
  });
  assert.ifError(foreignProfile.error);
  assert.equal(foreignProfile.data?.[0]?.user_id, b.id);
  assert.equal(foreignProfile.data?.[0]?.is_me, false);
  pass("own_and_foreign_profile");

  const favorite = await a.client
    .from("favorites")
    .insert({ user_id: a.id, spot_id: spot.id })
    .select("user_id,spot_id")
    .single();
  assert.ifError(favorite.error);
  const duplicateFavorite = await a.client
    .from("favorites")
    .insert({ user_id: a.id, spot_id: spot.id });
  assert(duplicateFavorite.error);
  const foreignFavoriteDelete = await b.client
    .from("favorites")
    .delete()
    .eq("user_id", a.id)
    .eq("spot_id", spot.id)
    .select("spot_id");
  assert.ifError(foreignFavoriteDelete.error);
  assert.equal(foreignFavoriteDelete.data.length, 0);
  const favoriteAfterRefresh = await a.client
    .from("favorites")
    .select("spot_id")
    .eq("user_id", a.id)
    .eq("spot_id", spot.id)
    .single();
  assert.ifError(favoriteAfterRefresh.error);
  const removeFavorite = await a.client
    .from("favorites")
    .delete()
    .eq("user_id", a.id)
    .eq("spot_id", spot.id)
    .select("spot_id");
  assert.ifError(removeFavorite.error);
  assert.equal(removeFavorite.data.length, 1);
  pass("favorites_state_duplicate_and_authorization");

  const reviewResponse = await a.client.functions.invoke(
    "create-review-with-photos",
    {
      body: {
        spot_id: spot.id,
        text: `${marker} reale Gate-5 Review`,
        mood_a: "gemütlich",
        mood_b: "ruhig",
        photo_urls: [],
        city: "Basel",
      },
    },
  );
  assert.ifError(reviewResponse.error);
  assert.equal(reviewResponse.data?.ok, true);
  assert(reviewResponse.data.review_id);
  createdEntityIds.review = reviewResponse.data.review_id;
  const review = await a.client
    .from("reviews")
    .select("id,user_id,spot_id,text,mood_a,mood_b,created_at")
    .eq("id", createdEntityIds.review)
    .single();
  assert.ifError(review.error);
  assert.equal(review.data.user_id, a.id);
  assert.equal(review.data.spot_id, spot.id);
  const sameDay = await a.client.functions.invoke("create-review-with-photos", {
    body: {
      spot_id: spot.id,
      text: `${marker} duplicate`,
      mood_a: "gemütlich",
      photo_urls: [],
      city: "Basel",
    },
  });
  assert.ifError(sameDay.error);
  assert.equal(sameDay.data?.ok, false);
  assert.equal(sameDay.data?.error_code, "SAME_DAY_REVIEW_LIMIT");
  pass("review_moods_immediate_and_same_day_limit", {
    moodResolutions: reviewResponse.data.mood_resolutions?.length ?? 0,
  });

  const reviewLike = await b.client
    .from("review_likes")
    .insert({ review_id: createdEntityIds.review, user_id: b.id })
    .select("review_id,user_id")
    .single();
  assert.ifError(reviewLike.error);
  const duplicateReviewLike = await b.client
    .from("review_likes")
    .insert({ review_id: createdEntityIds.review, user_id: b.id });
  assert(duplicateReviewLike.error);
  const crossUnlike = await a.client
    .from("review_likes")
    .delete()
    .eq("review_id", createdEntityIds.review)
    .eq("user_id", b.id)
    .select("user_id");
  assert.ifError(crossUnlike.error);
  assert.equal(crossUnlike.data.length, 0);
  const ownUnlike = await b.client
    .from("review_likes")
    .delete()
    .eq("review_id", createdEntityIds.review)
    .eq("user_id", b.id)
    .select("user_id");
  assert.ifError(ownUnlike.error);
  assert.equal(ownUnlike.data.length, 1);

  const reviewComment = await b.client
    .from("review_comments")
    .insert({
      review_id: createdEntityIds.review,
      user_id: b.id,
      text: `${marker} review comment`,
      parent_id: null,
    })
    .select("id,user_id,text")
    .single();
  assert.ifError(reviewComment.error);
  const crossCommentDelete = await a.client
    .from("review_comments")
    .delete()
    .eq("id", reviewComment.data.id)
    .select("id");
  assert.ifError(crossCommentDelete.error);
  assert.equal(crossCommentDelete.data.length, 0);
  const ownCommentDelete = await b.client
    .from("review_comments")
    .delete()
    .eq("id", reviewComment.data.id)
    .select("id");
  assert.ifError(ownCommentDelete.error);
  assert.equal(ownCommentDelete.data.length, 1);
  pass("review_comments_likes_actor_and_authorization");

  const momentResult = await b.client.rpc("create_social_post_v1", {
    p_spot_id: spot.id,
    p_caption: `${marker} text-only moment`,
    p_visibility: "public",
    p_mood_tags: [],
    p_occasion_tags: [],
    p_media: [],
  });
  assert.ifError(momentResult.error);
  createdEntityIds.moment = momentResult.data?.[0]?.post_id;
  assert(createdEntityIds.moment);
  const feed = await a.client.rpc("get_social_feed_v2", {
    p_limit: 40,
    p_cursor: null,
    p_city: null,
    p_feed_mode: "for_you",
  });
  assert.ifError(feed.error);
  assert(feed.data.some((row) => row.post_id === createdEntityIds.moment));

  const like = await a.client.rpc("react_to_social_post_v1", {
    p_post_id: createdEntityIds.moment,
    p_reaction_type: "like",
    p_active: true,
  });
  assert.ifError(like.error);
  const duplicateLike = await a.client.rpc("react_to_social_post_v1", {
    p_post_id: createdEntityIds.moment,
    p_reaction_type: "like",
    p_active: true,
  });
  assert.ifError(duplicateLike.error);
  assert.equal(duplicateLike.data?.[0]?.active, true);
  const socialComment = await a.client.rpc("create_social_comment_v1", {
    p_post_id: createdEntityIds.moment,
    p_body: `${marker} social comment`,
  });
  assert.ifError(socialComment.error);
  const comments = await b.client.rpc("get_social_comments_v1", {
    p_post_id: createdEntityIds.moment,
    p_limit: 80,
  });
  assert.ifError(comments.error);
  assert(
    comments.data.some(
      (row) => row.comment_id === socialComment.data?.[0]?.comment_id && row.user_id === a.id,
    ),
  );
  const unlike = await a.client.rpc("react_to_social_post_v1", {
    p_post_id: createdEntityIds.moment,
    p_reaction_type: "like",
    p_active: false,
  });
  assert.ifError(unlike.error);
  pass("moments_social_comments_likes_and_refresh");

  const selfFollow = await a.client.rpc("follow_user_v2", { p_user_id: a.id });
  assert(selfFollow.error);
  const follow = await a.client.rpc("follow_user_v2", { p_user_id: b.id });
  assert.ifError(follow.error);
  const followAgain = await a.client.rpc("follow_user_v2", { p_user_id: b.id });
  assert.ifError(followAgain.error);
  const rows = await admin
    .from("follows")
    .select("follower,following")
    .eq("follower", a.id)
    .eq("following", b.id);
  assert.ifError(rows.error);
  assert.equal(rows.data.length, 1);
  const followingFeed = await a.client.rpc("get_social_feed_v2", {
    p_limit: 40,
    p_cursor: null,
    p_city: null,
    p_feed_mode: "following",
  });
  assert.ifError(followingFeed.error);
  assert(followingFeed.data.some((row) => row.post_id === createdEntityIds.moment));
  const foreignUnfollow = await c.client
    .from("follows")
    .delete()
    .eq("follower", a.id)
    .eq("following", b.id)
    .select("following");
  assert.ifError(foreignUnfollow.error);
  assert.equal(foreignUnfollow.data.length, 0);
  const unfollow = await a.client.rpc("unfollow_user_v2", { p_user_id: b.id });
  assert.ifError(unfollow.error);
  pass("follow_feed_duplicate_self_and_authorization");

  const privateToggle = await b.client.rpc("set_my_profile_privacy_v1", {
    p_is_private: true,
  });
  assert.ifError(privateToggle.error);
  const hiddenPosts = await a.client.rpc("get_social_user_posts_v2", {
    p_user_id: b.id,
    p_limit: 40,
    p_cursor: null,
  });
  assert.ifError(hiddenPosts.error);
  assert.equal(
    hiddenPosts.data.some((row) => row.post_id === createdEntityIds.moment),
    false,
  );
  const publicAgain = await b.client.rpc("set_my_profile_privacy_v1", {
    p_is_private: false,
  });
  assert.ifError(publicAgain.error);
  pass("profile_privacy_boundary");

  const chatA = await a.client.rpc("get_or_create_direct_chat_v2", {
    p_other_user_id: b.id,
  });
  assert.ifError(chatA.error);
  const chatAgain = await a.client.rpc("get_or_create_direct_chat_v2", {
    p_other_user_id: b.id,
  });
  assert.ifError(chatAgain.error);
  assert.equal(chatAgain.data, chatA.data);
  createdEntityIds.chat = chatA.data;
  const message = await a.client
    .from("messages")
    .insert({
      chat_id: createdEntityIds.chat,
      sender_id: a.id,
      text: `${marker} message`,
      image_url: null,
    })
    .select("id,chat_id,sender_id,text,created_at,seen_at")
    .single();
  assert.ifError(message.error);
  const recipientMessages = await b.client
    .from("messages")
    .select("id,sender_id,text,created_at,seen_at")
    .eq("chat_id", createdEntityIds.chat)
    .order("created_at", { ascending: true });
  assert.ifError(recipientMessages.error);
  assert(recipientMessages.data.some((row) => row.id === message.data.id));
  const outsiderRead = await c.client
    .from("messages")
    .select("id")
    .eq("chat_id", createdEntityIds.chat);
  assert.ifError(outsiderRead.error);
  assert.equal(outsiderRead.data.length, 0);
  const outsiderWrite = await c.client.from("messages").insert({
    chat_id: createdEntityIds.chat,
    sender_id: c.id,
    text: `${marker} forbidden`,
    image_url: null,
  });
  assert(outsiderWrite.error);
  const marked = await b.client.rpc("mark_chat_read_v1", {
    p_chat_id: createdEntityIds.chat,
  });
  assert.ifError(marked.error);
  const readState = await a.client
    .from("messages")
    .select("seen_at")
    .eq("id", message.data.id)
    .single();
  assert.ifError(readState.error);
  assert(readState.data.seen_at);
  pass("messages_conversation_order_read_and_authorization");

  const notices = await a.client.rpc("safety_my_notices_v1", { p_limit: 200 });
  assert.ifError(notices.error);
  assert(Array.isArray(notices.data));
  const foreignNoticeRead = await a.client.rpc("safety_mark_notice_read_v1", {
    p_notice_id: randomUUID(),
  });
  assert(foreignNoticeRead.error || foreignNoticeRead.data === false || foreignNoticeRead.data?.length === 0);
  pass("in_app_notification_identity_boundary");

  const achievement = await admin
    .from("achievements")
    .select("id")
    .limit(1)
    .single();
  assert.ifError(achievement.error);
  const assignment = await admin
    .from("user_achievements")
    .insert({ user_id: b.id, achievement_id: achievement.data.id })
    .select("user_id,achievement_id")
    .single();
  assert.ifError(assignment.error);
  const ownAchievements = await b.client
    .from("user_achievements")
    .select("user_id,achievement_id")
    .eq("user_id", b.id);
  assert.ifError(ownAchievements.error);
  assert.equal(ownAchievements.data.length, 1);
  const foreignAchievements = await a.client
    .from("user_achievements")
    .select("user_id,achievement_id")
    .eq("user_id", b.id);
  assert.ifError(foreignAchievements.error);
  assert.equal(
    foreignAchievements.data.length,
    0,
    "normal users must not read another user's achievement assignments",
  );
  pass("achievements_own_user_only");

  pass("state_consistency_and_duplicate_guards", {
    favoriteUnique: true,
    reviewSameDay: true,
    followUnique: true,
    socialLikeIdempotent: true,
    chatCanonical: true,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        result: "PASS",
        scenarios: Object.keys(report).length,
        report,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await cleanup();
}
