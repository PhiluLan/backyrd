import { SLICE4B_FOUNDER_CONTEXT_ENTRIES as entries, SLICE4B_FOUNDER_CONTEXT_OBSERVED_AT as observedAt } from "./slice4b-founder-context-fixture.mjs";

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

const login = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anonKey, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`local_admin_login_failed:${login.status}`);
const accessToken = (await login.json()).access_token;
const headers = { apikey: anonKey, authorization: `Bearer ${accessToken}`, "content-type": "application/json" };


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
