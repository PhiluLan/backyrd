#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (process.env.BACKYRD_GATE6_PRODUCTION_ACCEPTANCE !== "AUTHORIZED_ISOLATED_CLEANUP") {
  throw new Error("explicit isolated Production acceptance acknowledgement required");
}
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.includes("hjgcrrzfjchzqoegcywn") || !anonKey || !serviceKey) throw new Error("Production credentials required");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const makeClient = (key = anonKey) => createClient(url, key, options);
const admin = makeClient(serviceKey);
const marker = `g6-${randomUUID().replaceAll("-", "").slice(0, 14)}`;
const password = `Gate6-${randomUUID()}-Strong!`;
const userIds = [];
const entityIds = { post: null, archivedPost: null, archivedReview: null, chat: null };

async function createUser(suffix) {
  const email = `${marker}-${suffix}@backyrd.ch`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error); assert(data.user?.id); userIds.push(data.user.id);
  const client = makeClient();
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  const onboard = await client.rpc("complete_profile_onboarding_v2", {
    p_display_name: `Gate Six ${suffix.toUpperCase()}`,
    p_username: `${marker.replaceAll("-", "")}${suffix}`.slice(0, 24),
    p_age: 30, p_city: "Basel", p_country: "Schweiz",
  });
  assert.ifError(onboard.error);
  return { id: data.user.id, client };
}

async function cleanup() {
  for (const id of userIds) await admin.from("safety_content_items").delete().eq("actor_user_id", id);
  for (const id of userIds) await admin.from("social_posts").delete().eq("user_id", id);
  if (entityIds.post) await admin.from("social_posts").delete().eq("id", entityIds.post);
  if (entityIds.archivedPost) await admin.from("social_posts").delete().eq("id", entityIds.archivedPost);
  if (entityIds.archivedReview) await admin.from("reviews").delete().eq("id", entityIds.archivedReview);
  if (entityIds.chat) await admin.from("chats").delete().eq("id", entityIds.chat);
  for (const id of userIds) {
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) throw removed.error;
  }
}

try {
  const [{ data: approved, error: approvedError }, { data: archived, error: archivedError }] = await Promise.all([
    admin.from("spots").select("id").eq("status", "approved").not("data_origin", "in", "(TEST,FIXTURE)").limit(1).single(),
    admin.from("spots").select("id").eq("status", "archived").limit(1).single(),
  ]);
  assert.ifError(approvedError); assert.ifError(archivedError);
  const [a, b, c] = await Promise.all([createUser("a"), createUser("b"), createUser("c")]);

  const followResults = await Promise.all([
    a.client.rpc("follow_user_v2", { p_user_id: b.id }),
    a.client.rpc("follow_user_v2", { p_user_id: b.id }),
  ]);
  const { count: followCount, error: followCountError } = await admin.from("follows").select("*", { count: "exact", head: true }).eq("follower", a.id).eq("following", b.id);
  assert.ifError(followCountError);
  const selfFollow = await a.client.rpc("follow_user_v2", { p_user_id: a.id });
  const foreignUnfollow = await c.client.from("follows").delete().eq("follower", a.id).eq("following", b.id).select("follower");

  entityIds.post = randomUUID();
  const postInsert = await a.client.from("social_posts").insert({ id: entityIds.post, user_id: a.id, spot_id: approved.id, caption: marker, status: "published", visibility: "public" });
  assert.ifError(postInsert.error);
  const reactionResults = await Promise.all([
    b.client.rpc("react_to_social_post_v1", { p_post_id: entityIds.post, p_reaction_type: "like", p_active: true }),
    b.client.rpc("react_to_social_post_v1", { p_post_id: entityIds.post, p_reaction_type: "like", p_active: true }),
    c.client.rpc("react_to_social_post_v1", { p_post_id: entityIds.post, p_reaction_type: "like", p_active: true }),
  ]);
  const { data: reactionRows, error: reactionsError } = await admin.from("social_post_reactions").select("user_id").eq("post_id", entityIds.post).eq("reaction_type", "like");
  assert.ifError(reactionsError);
  const { data: postAfterReactions, error: postAfterError } = await admin.from("social_posts").select("like_count,comment_count").eq("id", entityIds.post).single();
  assert.ifError(postAfterError);

  const duplicateCommentResults = await Promise.all([
    b.client.rpc("create_social_comment_v2", { p_post_id: entityIds.post, p_body: `${marker} retry`, p_client_request_id: entityIds.post }),
    b.client.rpc("create_social_comment_v2", { p_post_id: entityIds.post, p_body: `${marker} retry`, p_client_request_id: entityIds.post }),
  ]);
  const { data: comments, error: commentsError } = await admin.from("social_comments").select("id").eq("post_id", entityIds.post).eq("user_id", b.id);
  assert.ifError(commentsError);
  const { data: postAfterComments, error: postCommentsError } = await admin.from("social_posts").select("comment_count").eq("id", entityIds.post).single();
  assert.ifError(postCommentsError);

  const archivedFavorite = await a.client.from("favorites").insert({ user_id: a.id, spot_id: archived.id }).select("id");
  entityIds.archivedPost = randomUUID();
  const archivedPost = await a.client.from("social_posts").insert({ id: entityIds.archivedPost, user_id: a.id, spot_id: archived.id, caption: marker, status: "published", visibility: "public" }).select("id");
  const momentRequestId = randomUUID();
  const [momentRetryOne, momentRetryTwo] = await Promise.all([
    a.client.rpc("create_social_post_v2", { p_spot_id: approved.id, p_caption: `${marker} moment retry`, p_visibility: "public", p_mood_tags: [], p_occasion_tags: [], p_media: [], p_client_request_id: momentRequestId }),
    a.client.rpc("create_social_post_v2", { p_spot_id: approved.id, p_caption: `${marker} moment retry`, p_visibility: "public", p_mood_tags: [], p_occasion_tags: [], p_media: [], p_client_request_id: momentRequestId }),
  ]);
  const { data: momentRetryRows, error: momentRetryRowsError } = await admin.from("social_posts").select("id").eq("user_id", a.id).eq("caption", `${marker} moment retry`);
  assert.ifError(momentRetryRowsError);
  const feed = await b.client.rpc("get_social_feed_v2", { p_limit: 100, p_feed_mode: "for_you" });
  assert.ifError(feed.error);
  const profilePosts = await b.client.rpc("get_social_user_posts_v2", { p_user_id: a.id, p_limit: 100 });
  assert.ifError(profilePosts.error);
  entityIds.archivedReview = randomUUID();
  const archivedReview = await a.client.from("reviews").insert({ id: entityIds.archivedReview, user_id: a.id, spot_id: archived.id, text: marker, mood_a: "gemütlich" }).select("id");

  const chatResult = await a.client.rpc("get_or_create_direct_chat_v1", { p_other_user_id: b.id });
  assert.ifError(chatResult.error);
  entityIds.chat = Array.isArray(chatResult.data) ? chatResult.data[0]?.chat_id : chatResult.data?.chat_id ?? chatResult.data;
  assert(entityIds.chat);
  const messageRequestId = randomUUID();
  const duplicateMessages = await Promise.all([
    a.client.rpc("send_message_v2", { p_chat_id: entityIds.chat, p_text: `${marker} retry`, p_image_url: null, p_client_request_id: messageRequestId }),
    a.client.rpc("send_message_v2", { p_chat_id: entityIds.chat, p_text: `${marker} retry`, p_image_url: null, p_client_request_id: messageRequestId }),
  ]);
  const { data: messageRows, error: messageRowsError } = await admin.from("messages").select("id").eq("chat_id", entityIds.chat).eq("sender_id", a.id).eq("text", `${marker} retry`);
  assert.ifError(messageRowsError);
  const foreignRead = await c.client.from("messages").select("id").eq("chat_id", entityIds.chat);
  const foreignWrite = await c.client.from("messages").insert({ chat_id: entityIds.chat, sender_id: c.id, text: marker });

  process.stdout.write(`${JSON.stringify({
    result: "PROBE_COMPLETE",
    follow: { callsSucceeded: followResults.filter((r) => !r.error).length, finalRelations: followCount, selfBlocked: Boolean(selfFollow.error), foreignDeleteRows: foreignUnfollow.data?.length ?? -1 },
    reactions: { callsSucceeded: reactionResults.filter((r) => !r.error).length, finalRelations: reactionRows.length, storedCount: postAfterReactions.like_count },
    comments: { callsSucceeded: duplicateCommentResults.filter((r) => !r.error).length, finalRelations: comments.length, storedCount: postAfterComments.comment_count },
    archivedSpot: {
      favoriteAccepted: !archivedFavorite.error,
      postAccepted: !archivedPost.error,
      reviewAccepted: !archivedReview.error,
      postVisibleInFeed: (feed.data ?? []).some((row) => row.post_id === entityIds.archivedPost),
      postVisibleOnProfile: (profilePosts.data ?? []).some((row) => row.post_id === entityIds.archivedPost),
    },
    moments: { callsSucceeded: [momentRetryOne, momentRetryTwo].filter((r) => !r.error).length, finalRows: momentRetryRows.length },
    messages: { callsSucceeded: duplicateMessages.filter((r) => !r.error).length, finalRows: messageRows.length, foreignReadRows: foreignRead.data?.length ?? -1, foreignWriteBlocked: Boolean(foreignWrite.error) },
  }, null, 2)}\n`);
} finally {
  await cleanup();
}
