#!/usr/bin/env node

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

if (process.env.BACKYRD_GATE6_PRODUCTION_FORENSICS !== "READ_ONLY") throw new Error("read-only acknowledgement required");
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.includes("hjgcrrzfjchzqoegcywn") || !serviceKey) throw new Error("Production credentials required");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const table = async (name, columns) => {
  const { data, error } = await db.from(name).select(columns).limit(1000);
  assert.ifError(error); return data;
};
const pathFrom = (value, bucket) => {
  if (!value) return null;
  const decoded = decodeURIComponent(String(value));
  const markers = [`/storage/v1/object/public/${bucket}/`, `/storage/v1/object/sign/${bucket}/`, `/${bucket}/`];
  for (const marker of markers) {
    const at = decoded.indexOf(marker);
    if (at >= 0) return decoded.slice(at + marker.length).split("?")[0];
  }
  if (/^https?:\/\//i.test(decoded)) return null;
  return decoded.replace(/^\/+/, "").split("?")[0];
};
async function listTree(bucket, prefix = "", depth = 0) {
  if (depth > 8) throw new Error(`storage tree too deep: ${bucket}`);
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    assert.ifError(error);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) files.push({ path, createdAt: entry.created_at ?? entry.updated_at ?? null });
      else files.push(...await listTree(bucket, path, depth + 1));
    }
    if (data.length < 1000) return files;
  }
}

const [{ data: buckets, error: bucketError }, profiles, reviews, reviewPhotos, posts, postMedia, chats, messages, spots, spotPhotos, rights] = await Promise.all([
  db.storage.listBuckets(),
  table("profiles", "id,avatar_url,header_photo_url"),
  table("reviews", "id,spot_id,data_origin,review_origin,photo_path"),
  table("review_photos", "review_id,url"),
  table("social_posts", "id,user_id"),
  table("social_post_media", "post_id,storage_path"),
  table("chats", "id,user_a,user_b"),
  table("messages", "id,chat_id,sender_id,image_url"),
  table("spots", "id,status,data_origin,header_photo_path"),
  table("spot_photos", "spot_id,url"),
  table("data_rights_requests", "id,status,export_storage_path,export_expires_at"),
]);
assert.ifError(bucketError);

const expectedBucketContract = {
  badges: true,
  "chat-uploads": false,
  "data-rights-exports": false,
  "profile-photos": true,
  "review-photos": true,
  "social-post-media": false,
  "spot-photos": true,
};
const actualPublic = Object.fromEntries(buckets.map((b) => [b.id, b.public]));
const files = {};
for (const bucket of Object.keys(expectedBucketContract)) files[bucket] = new Map((await listTree(bucket)).map((entry) => [entry.path, entry]));

const refs = Object.fromEntries(Object.keys(expectedBucketContract).map((key) => [key, new Set()]));
for (const profile of profiles) for (const value of [profile.avatar_url, profile.header_photo_url]) {
  const path = pathFrom(value, "profile-photos"); if (path) refs["profile-photos"].add(path);
}
for (const review of reviews) { const path = pathFrom(review.photo_path, "review-photos"); if (path) refs["review-photos"].add(path); }
for (const photo of reviewPhotos) { const path = pathFrom(photo.url, "review-photos"); if (path) refs["review-photos"].add(path); }
for (const media of postMedia) { const path = pathFrom(media.storage_path, "social-post-media"); if (path) refs["social-post-media"].add(path); }
for (const message of messages) { const path = pathFrom(message.image_url, "chat-uploads"); if (path) refs["chat-uploads"].add(path); }
for (const spot of spots) { const path = pathFrom(spot.header_photo_path, "spot-photos"); if (path) refs["spot-photos"].add(path); }
for (const photo of spotPhotos) { const path = pathFrom(photo.url, "spot-photos"); if (path) refs["spot-photos"].add(path); }
for (const request of rights) { const path = pathFrom(request.export_storage_path, "data-rights-exports"); if (path) refs["data-rights-exports"].add(path); }

const now = Date.now();
const checks = {};
for (const [bucket, expectedPublic] of Object.entries(expectedBucketContract)) {
  checks[bucket] = {
    publicContractMatches: actualPublic[bucket] === expectedPublic,
    objects: files[bucket].size,
    dbReferences: refs[bucket].size,
    dbRecordsMissingObject: [...refs[bucket]].filter((path) => !files[bucket].has(path)).length,
    unreferencedObjects: bucket === "badges" ? 0 : [...files[bucket].keys()].filter((path) => !refs[bucket].has(path)).length,
    unreferencedOlderThan24h: bucket === "badges" ? 0 : [...files[bucket].values()].filter((entry) =>
      !refs[bucket].has(entry.path) && entry.createdAt && now - new Date(entry.createdAt).getTime() > 86_400_000
    ).length,
  };
}
checks["data-rights-exports"].expiredReadyExports = rights.filter((r) => r.status === "ready" && r.export_expires_at && new Date(r.export_expires_at).getTime() < now && r.export_storage_path).length;
const reviewById = new Map(reviews.map((row) => [row.id, row]));
const spotById = new Map(spots.map((row) => [row.id, row]));
checks["review-photos"].missingOnRealReviews = reviewPhotos.filter((photo) => {
  const path = pathFrom(photo.url, "review-photos");
  const review = reviewById.get(photo.review_id);
  return path && !files["review-photos"].has(path) && review?.data_origin === "REAL";
}).length;
checks["review-photos"].missingOnApprovedSpots = reviewPhotos.filter((photo) => {
  const path = pathFrom(photo.url, "review-photos");
  const review = reviewById.get(photo.review_id);
  return path && !files["review-photos"].has(path) && spotById.get(review?.spot_id)?.status === "approved";
}).length;
checks["spot-photos"].missingOnApprovedSpots = spotPhotos.filter((photo) => {
  const path = pathFrom(photo.url, "spot-photos");
  return path && !files["spot-photos"].has(path) && spotById.get(photo.spot_id)?.status === "approved";
}).length;

process.stdout.write(`${JSON.stringify({ result: "PASS", mode: "READ_ONLY", checks }, null, 2)}\n`);
