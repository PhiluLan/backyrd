/** Isolated anonymous read fixture. Run with `node e2e/fixtures/spot-api.mjs`.
 * Point the local Next server at http://127.0.0.1:4311 with a synthetic anon key.
 * No production credentials or writes are involved. */
import { createServer } from "node:http";
const field = (attributeKey, value, knowledgeState = "KNOWN_VALUE") => ({
  attributeKey,
  value,
  knowledgeState,
  sectionKey: "PUBLIC",
  sortOrder: 0,
  scope: "SPOT",
  trust: "VERIFIED",
  freshness: "CURRENT",
});
const id = "10000000-0000-4000-8000-000000000001";
const base = {
  spot: {
    id,
    name: "Alter Name",
    address: "Teststrasse 1, 4056 Basel",
    city: "Basel",
    country: "CH",
    header_photo_path: null,
    price_level: null,
    website: "https://stale.test",
    phone: null,
    email: null,
    category: null,
    description: "Veraltete Beschreibung",
    description_source: null,
  },
  opening_hours: [
    {
      day_of_week: "Dienstag",
      open_time: "01:00",
      close_time: "02:00",
      idx: 0,
    },
  ],
  photos: [],
  top_moods: [],
  reviews: [
    {
      id: "impression",
      text: "Ein ruhiger Abend.",
      mood_a: "Gemütlich",
      mood_b: null,
      created_at: "2026-11-20T17:00:00Z",
      user: { first_name: "Lea" },
      photos: [],
    },
  ],
};
const world = {
  contractVersion: "backyrd.spot-detail-product-profile@1.0",
  surface: "WEB",
  worldManifestHash: "a".repeat(64),
  publicDescription: "Frisches Bier und Platz für einen ruhigen Abend.",
  spot: {
    spotId: id,
    name: "Test Brauerei",
    addressLine1: "Teststrasse 1",
    locality: "Basel",
    countryCode: "CH",
    latitude: 47.571,
    longitude: 7.582,
    regularHours: [
      { day: "MONDAY", intervals: [] },
      { day: "FRIDAY", intervals: [{ start: "17:00", end: "00:30" }] },
    ],
    source: "WORLD_KNOWLEDGE",
    headerPhotoPath: null,
  },
  fields: [
    field("classification.place_types", ["BAR", "BREWERY", "PUB"]),
    field("operation.price_level", "MEDIUM"),
    field("contact.website", "https://example.test"),
    field("contact.instagram", "javascript:alert(1)"),
    field("hours.special", [
      { date: "2026-12-24", status: "CLOSED", intervals: [] },
    ]),
    field("context.atmosphere", [
      { atmosphere: "COZY", conditions: { dayparts: ["EVENING"] } },
    ]),
    field("internal.private", { raw: "Secret" }),
    field("accessibility.elevator", false, "KNOWN_FALSE"),
  ],
  experienceProfile: {
    contractVersion: "backyrd.world-knowledge.experience-profile@1.0",
    reviewed: true,
    offers: [
      {
        id: "beer",
        name: "Degustation",
        prices: [],
        schedule: [{ weekday: 5, start: "17:00", end: "23:00" }],
        areaIds: ["terrace"],
        properties: [
          { key: "food.dish", state: "KNOWN", value: "Pizza", conditions: {} },
          {
            key: "participation.booking",
            state: "KNOWN",
            value: "Empfohlen",
            conditions: {},
          },
        ],
      },
    ],
    areas: [{ id: "terrace", name: "Terrasse", properties: [] }],
    properties: [
      { key: "access.arrival", state: "KNOWN", value: "ÖV", conditions: {} },
    ],
  },
};
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.end();
    return;
  }
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(text) : {};
  const path = new URL(req.url, "http://fixture.test").pathname;
  let value = [];
  if (path.endsWith("/backyrd_web_spot_detail_v1")) {
    if (body.p_spot_id.endsWith("009")) {
      value = { message: "fixture unavailable" };
      res.statusCode = 503;
    } else value = body.p_spot_id.endsWith("008") ? null : base;
  } else if (path.endsWith("/spot_detail_product_profile_v1")) {
    if (body.p_spot_id.endsWith("007")) {
      value = { message: "projection unavailable" };
      res.statusCode = 503;
    } else
      value = body.p_spot_id.endsWith("006")
        ? { ...world, spot: { ...world.spot, regularHours: [] }, fields: [] }
        : world;
  } else if (path.endsWith("/spot_place_source_credit_v1"))
    value = {
      credit: "Öffentliche Testquelle",
      source_url: "https://example.test/source",
      license_url: "https://example.test/license",
    };
  else if (path.endsWith("/distribution_trust_spot_catalog_v1"))
    value = [
      {
        id: "20000000-0000-4000-8000-000000000001",
        name: "Nebenan",
        address: "Nachbarstrasse 2",
        city: "Basel",
        lat: 47.572,
        lng: 7.582,
        category_name: "Café",
      },
    ];
  else if (path.endsWith("/user")) {
    res.statusCode = 401;
    value = { msg: "not authenticated" };
  }
  res.end(JSON.stringify(value));
});
server.listen(4311, "127.0.0.1", () => console.log("Spot fixture API on 4311"));
