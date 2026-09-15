const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

const apiUrl = required("WK_LOCAL_SUPABASE_URL").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(apiUrl)) throw new Error("local_target_required");
const anonKey = required("WK_LOCAL_SUPABASE_ANON_KEY");
const email = required("WK_LOCAL_ADMIN_EMAIL");
const password = required("WK_LOCAL_ADMIN_PASSWORD");
const observedAt = "2026-09-15T17:00:00.000Z";

const login = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anonKey, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`local_admin_login_failed:${login.status}`);
const accessToken = (await login.json()).access_token;
const headers = { apikey: anonKey, authorization: `Bearer ${accessToken}`, "content-type": "application/json" };

const emptyConditions = { dayparts: [], days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: null };
const entries = [
  { id: "1101ee26-5046-4cdc-921a-5a3bd4cb5306", name: "Volta Bräu", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "EAT_DRINK"],
    ["context.typical_dayparts", "KNOWN_VALUE", [{ daypart: "EVENING", conditions: { days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }]],
    ["context.visit_situations", "UNKNOWN", null], ["context.atmosphere", "UNKNOWN", null],
  ] },
  { id: "57cb213c-9472-40b6-80be-a810fd77b7c9", name: "ELYS Boulderloft", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "SPORT_MOVEMENT"],
    ["offering.onsite", "KNOWN_VALUE", [{ kind: "KIDS_PLAY_AREA", relationship: "PART_OF_SPOT", area: "Bewegungslandschaft" }, { kind: "CAFE", relationship: "EMBEDDED_FACILITY", area: "Familien-Bistro" }]],
    ["context.visit_situations", "KNOWN_VALUE", [{ situation: "FAMILY", conditions: { ...emptyConditions, ageContext: "MIXED_AGES", accompaniment: "ADULT" } }]],
    ["context.atmosphere", "UNKNOWN", null], ["context.typical_dayparts", "UNKNOWN", null],
  ] },
  { id: "f8ae8625-aa9c-4647-9af5-c981fc40854a", name: "Tierpark Lange Erlen", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "NATURE_ANIMAL_EXPERIENCE"],
    ["offering.onsite", "KNOWN_VALUE", [{ kind: "KIOSK", relationship: "EMBEDDED_FACILITY", area: null }, { kind: "KIDS_PLAY_AREA", relationship: "PART_OF_SPOT", area: "Spielplatz" }]],
    ["context.visit_situations", "KNOWN_VALUE", [{ situation: "FAMILY", conditions: { ...emptyConditions, ageContext: "MIXED_AGES", accompaniment: "ADULT" } }]],
    ["context.typical_dayparts", "KNOWN_VALUE", [{ daypart: "MORNING", conditions: { days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }, { daypart: "AFTERNOON", conditions: { days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }]],
    ["context.atmosphere", "UNKNOWN", null],
  ] },
  { id: "ff90b2f4-0c51-4423-adb5-e9a0ad22213e", name: "Consum Weinbar", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "EAT_DRINK"],
    ["offering.onsite", "KNOWN_VALUE", [{ kind: "HOTEL", relationship: "EMBEDDED_FACILITY", area: null }]],
    ["context.visit_situations", "UNKNOWN", null], ["context.atmosphere", "UNKNOWN", null], ["context.typical_dayparts", "UNKNOWN", null],
  ] },
  { id: "644fbd15-91f8-4ab7-8a4b-dbe06622d148", name: "Café Frühling", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "EAT_DRINK"],
    ["offering.onsite", "KNOWN_VALUE", [{ kind: "SHOP", relationship: "PART_OF_SPOT", area: null }]],
    ["context.typical_dayparts", "KNOWN_VALUE", [{ daypart: "MORNING", conditions: { days: [], area: null, occasion: "Frühstück", groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }, { daypart: "MIDDAY", conditions: { days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"], area: null, occasion: "Mittagessen", groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }]],
    ["context.visit_situations", "UNKNOWN", null], ["context.atmosphere", "UNKNOWN", null],
  ] },
];

const receipts = [];
for (const spot of entries) {
  for (const [attributeKey, knowledgeState, value] of spot.values) {
    const idempotencyKey = `slice4b-context:${spot.id}:${attributeKey}:v1`;
    const response = await fetch(`${apiUrl}/rest/v1/rpc/world_admin_submit_claim_v1`, {
      method: "POST", headers,
      body: JSON.stringify({ p_spot_id: spot.id, p_attribute_key: attributeKey, p_knowledge_state: knowledgeState, p_value: value, p_observed_at: observedAt, p_valid_from: null, p_valid_until: null, p_visibility: "PUBLIC", p_supersedes_claim_id: null, p_idempotency_key: idempotencyKey }),
    });
    if (!response.ok) throw new Error(`context_write_failed:${spot.name}:${attributeKey}:${response.status}:${await response.text()}`);
    const receipt = await response.json();
    receipts.push({ spotId: spot.id, name: spot.name, attributeKey, created: receipt.created, claimId: receipt.claimId, verificationMethod: receipt.verificationMethod });
  }
}

console.log(JSON.stringify({ scope: "LOCAL_FOUNDER_EVALUATION_ONLY", observedAt, spots: entries.length, claims: receipts.length, receipts }, null, 2));
