const apiUrl = process.env.API_URL;
const serviceKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
if (!apiUrl || !serviceKey || !anonKey || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(apiUrl)) throw new Error("local_supabase_environment_required");

const password = "FounderLocal4A!";
const roles = [
  { key: "admin", id: "4a000000-0000-4000-8000-000000000001", email: "founder-admin@local.backyrd.test", admin: true },
  { key: "basic", id: "4a000000-0000-4000-8000-000000000002", email: "owner-basic@local.backyrd.test", admin: false },
  { key: "pro", id: "4a000000-0000-4000-8000-000000000003", email: "owner-pro@local.backyrd.test", admin: false },
];
const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
const request = async (path, init = {}) => {
  const response = await fetch(`${apiUrl}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${path}:${response.status}:${body?.message ?? body?.error ?? text}`);
  return body;
};
for (const role of roles) {
  try {
    await request("/auth/v1/admin/users", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ id: role.id, email: role.email, password, email_confirm: true, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { local_fixture: true } }) });
  } catch (error) {
    if (!String(error).includes(":422:")) throw error;
  }
  await request(`/rest/v1/profiles?id=eq.${role.id}`, { method: "PATCH", headers: { ...serviceHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ is_admin: role.admin }) });
}
const signIn = async (email) => request("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
const adminSession = await signIn(roles[0].email);
const createSpot = async (name, ownerId, idempotencyKey) => request("/rest/v1/rpc/world_founder_create_spot_v1", { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${adminSession.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_name: name, p_owner_id: ownerId, p_idempotency_key: idempotencyKey }) });
const basicSpot = await createSpot("Founder Basic Testspot", roles[1].id, "local-fixture-owner-basic");
const proSpot = await createSpot("Founder Pro Testspot", roles[2].id, "local-fixture-owner-pro");
await request("/rest/v1/backyrd_spot_owner_intelligence_entitlements_v1?on_conflict=spot_id", { method: "POST", headers: { ...serviceHeaders, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ spot_id: proSpot.spotId, owner_id: roles[2].id, tier: "PREMIUM", source: "TEST_FIXTURE", valid_from: new Date(Date.now() - 60_000).toISOString(), contract_version: "backyrd-owner-free-premium-boundary-v1" }) });

console.log(JSON.stringify({ scope: "FOUNDER_EVALUATION_ONLY", apiUrl, roles: roles.map(({ key, email }) => ({ role: key, email, password })), spots: { basic: basicSpot.spotId, pro: proSpot.spotId } }, null, 2));
