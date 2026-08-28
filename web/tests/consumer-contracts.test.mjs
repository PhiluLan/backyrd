import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Web Decision keeps the canonical Mobile option keys and labels", async () => {
  const [web, mobile] = await Promise.all([
    read("web/lib/decision-web-api.ts"),
    read("mobile/app/(tabs)/decision.tsx"),
  ]);
  const expected = [
    ["restaurant", "Essen"],
    ["cafe", "Café"],
    ["bar", "Drinks"],
    ["culture", "Kultur"],
    ["activity", "Aktivität"],
    ["outing", "Ausflug"],
    ["kids", "Mit Kind"],
    ["date", "Date"],
    ["friends", "Freunde"],
    ["solo", "Allein"],
    ["cozy", "Cozy"],
    ["quiet", "Ruhig"],
    ["inspiring", "Inspirierend"],
    ["urban", "Urban"],
    ["chic", "Chic"],
    ["lively", "Lebhaft"],
  ];
  for (const [key, label] of expected) {
    const pattern = new RegExp(`key:\\s*["']${key}["'][\\s\\S]{0,100}label:\\s*["']${label}["']`);
    assert.match(web, pattern);
    assert.match(mobile, pattern);
  }
});

test("Web Decision invokes the same frozen Engine and action contracts", async () => {
  const [source, experience] = await Promise.all([
    read("web/lib/decision-web-api.ts"),
    read("web/components/consumer/decision-experience.tsx"),
  ]);
  assert.match(source, /functions\.invoke<Response>\(\s*["']decision-v13["']/);
  for (const field of [
    "city",
    "moodA",
    "moodB",
    "query",
    "preferredPlaceTypes",
    "audience",
    "strictCategoryIntent",
    "inputMode",
    "rawFreeText",
    "limit",
    "v12Limit",
    "semanticLimit",
  ]) assert.match(source, new RegExp(`\\b${field}\\b`));
  assert.match(source, /backyrd_record_visible_decision_impression_v1/);
  assert.match(experience, /window\.setTimeout[\s\S]*750/);
  assert.match(source, /action === "like" \? "exact_mood" : "not_there"/);
  assert.match(source, /continuationDecisionId/);
  assert.match(source, /continuationRequestId/);
});

test("Consumer navigation and canonical terminology are stable", async () => {
  const shell = await read("web/components/consumer/consumer-shell.tsx");
  for (const label of ["Entdecken", "Für jetzt", "Orte", "Momente"]) {
    assert.match(shell, new RegExp(`label:\\s*["']${label}["']`));
  }
  assert.doesNotMatch(shell, /label:\s*["']Karte["']/);
});

test("Public Web image boundary is Owner/Admin then local fallback only", async () => {
  const [image, api, allConsumer] = await Promise.all([
    read("web/components/canonical-spot-image.tsx"),
    read("web/lib/consumer-api.ts"),
    Promise.all([
      read("web/components/consumer/home-experience.tsx"),
      read("web/components/consumer/spot-card.tsx"),
      read("web/components/consumer/places-experience.tsx"),
      read("web/components/consumer/decision-experience.tsx"),
      read("web/components/consumer/profile-experience.tsx"),
    ]).then((parts) => parts.join("\n")),
  ]);
  assert.match(image, /ownerAdminImageUrl/);
  assert.match(image, /b-spot-fallback/);
  assert.doesNotMatch(image + api + allConsumer, /public-spot-photo/);
  assert.doesNotMatch(image + api + allConsumer, /google[_-]?place[_-]?photo/i);
  assert.match(api, /backyrd_web_canonical_spot_image_headers_v1/);
});

test("Moment media remains separate from canonical Spot imagery", async () => {
  const source = await read("web/components/consumer/moment-card.tsx");
  assert.match(source, /resolveMomentMedia\(moment\.media/);
  assert.doesNotMatch(source, /CanonicalSpotImage/);
});

test("Private mutations remain authenticated Supabase operations", async () => {
  const [api, auth, server] = await Promise.all([
    read("web/lib/consumer-api.ts"),
    read("web/components/consumer/auth-form.tsx"),
    read("web/lib/supabase/server.ts"),
  ]);
  assert.match(api, /supabase\.auth\.getUser\(\)/);
  assert.match(auth, /signInWithPassword/);
  assert.match(auth, /emailRedirectTo/);
  assert.match(server, /getClaims\(\)/);
  assert.doesNotMatch(api + auth + server, /service[_-]?role/i);
});

test("personal Consumer route families share the canonical authentication gate", async () => {
  const families = [
    "settings",
    "profile",
    "messages",
    "favorites",
    "achievements",
    "notifications",
    "reviews",
    "onboarding",
  ];
  for (const family of families) {
    const layout = await read(`web/app/${family}/layout.tsx`);
    assert.match(layout, /AuthGate/);
  }
  const gate = await read("web/components/consumer/auth-gate.tsx");
  assert.match(gate, /supabase\.auth\.getUser\(\)/);
  assert.match(gate, /\/login\?next=/);
});
