#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required");
const client = (key = anonKey) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = client(serviceKey);
const password = `Gate4-${randomUUID()}-Strong!`;
const nextPassword = `${password}-Next`;
const marker = `g4-${randomUUID().replaceAll("-", "").slice(0, 14)}`;
const emails = {
  unverified: `${marker}-u@backyrd.ch`,
  verified: `${marker}-v@backyrd.ch`,
  foreign: `${marker}-f@backyrd.ch`,
};
const created = [];
const report = {};
const ok = (name, detail = true) => { report[name] = detail; };

async function removeIsolatedUser(id) {
  const safety = await admin.from("safety_content_items").delete().eq("actor_user_id", id);
  if (safety.error) throw safety.error;
  const removed = await admin.auth.admin.deleteUser(id);
  if (removed.error) throw removed.error;
}

async function generateVerified(email, userPassword) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "signup", email, password: userPassword, options: { redirectTo: "https://www.backyrd.ch/auth/callback?next=/onboarding" } });
  assert.ifError(error);
  assert(data.user?.id);
  created.push(data.user.id);
  assert(data.properties?.hashed_token);
  assert(data.properties?.action_link.includes(encodeURIComponent("https://www.backyrd.ch/auth/callback?next=/onboarding")) || data.properties?.action_link.includes("www.backyrd.ch"));
  const verification = client();
  const { data: verified, error: verifyError } = await verification.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "signup" });
  assert.ifError(verifyError);
  assert(verified.session?.access_token);
  return { id: data.user.id, token: data.properties.hashed_token };
}

if (process.argv.includes("--cleanup-stale")) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.ifError(error);
  const isolated = data.users.filter((user) => /^g4-[0-9a-f]{14}-[uvf]@backyrd\.ch$/.test(user.email ?? ""));
  for (const user of isolated) await removeIsolatedUser(user.id);
  process.stdout.write(`${JSON.stringify({ result: "PASS", removedIsolatedUsers: isolated.length })}\n`);
  process.exit(0);
}

try {
  const invalidEmail = await client().auth.signUp({ email: "not-an-email", password });
  assert(invalidEmail.error);
  const weakPassword = await client().auth.signUp({ email: `${marker}-w@backyrd.ch`, password: "1234567" });
  assert(weakPassword.error);
  assert.equal(weakPassword.error.code, "weak_password");
  ok("invalid_email_and_password_policy");

  const signup = client();
  const first = await signup.auth.signUp({ email: emails.unverified, password, options: { emailRedirectTo: "https://www.backyrd.ch/auth/callback?next=/onboarding" } });
  if (first.error?.code === "over_email_send_rate_limit") {
    ok("signup_rate_boundary", "Production email-send rate limit enforced; no load test performed");
  } else {
    assert.ifError(first.error);
    assert(first.data.user?.id);
    created.push(first.data.user.id);
    assert.equal(first.data.session, null);
    const duplicate = await client().auth.signUp({ email: emails.unverified, password, options: { emailRedirectTo: "https://www.backyrd.ch/auth/callback?next=/onboarding" } });
    assert.ifError(duplicate.error);
    assert.equal(duplicate.data.session, null);
    ok("signup_and_duplicate_non_enumerating");
  }

  const verified = await generateVerified(emails.verified, password);
  const foreign = await generateVerified(emails.foreign, password);
  ok("verification_link");

  const a = client();
  const b = client();
  const loginA = await a.auth.signInWithPassword({ email: emails.verified, password });
  const loginB = await b.auth.signInWithPassword({ email: emails.verified, password });
  assert.ifError(loginA.error); assert.ifError(loginB.error);
  assert.equal(loginA.data.user.id, loginB.data.user.id);
  const profile = await a.from("profiles").select("id").eq("id", verified.id).single();
  assert.ifError(profile.error); assert.equal(profile.data.id, verified.id);
  const refresh = await b.auth.refreshSession();
  assert.ifError(refresh.error); assert.equal(refresh.data.user?.id, verified.id);
  ok("profile_cross_surface_and_refresh");

  const foreignBefore = await admin.from("profiles").select("id,display_name").eq("id", foreign.id).single();
  assert.ifError(foreignBefore.error);
  const forbidden = await a.from("profiles").update({ display_name: "gate4-forbidden" }).eq("id", foreign.id).select("id");
  assert.ifError(forbidden.error); assert.equal(forbidden.data.length, 0);
  const foreignAfter = await admin.from("profiles").select("id,display_name").eq("id", foreign.id).single();
  assert.ifError(foreignAfter.error); assert.deepEqual(foreignAfter.data, foreignBefore.data);
  const serviceOnly = await a.rpc("admin_erase_account_data_v1", { p_request_id: randomUUID() });
  assert(serviceOnly.error);
  ok("authorization_boundary");

  const logoutA = await a.auth.signOut({ scope: "local" });
  assert.ifError(logoutA.error);
  const stillValidB = await b.auth.getUser();
  assert.ifError(stillValidB.error); assert.equal(stillValidB.data.user?.id, verified.id);
  ok("multi_session_local_logout", "one client logout does not revoke the other valid session");

  const recovery = await admin.auth.admin.generateLink({ type: "recovery", email: emails.verified, options: { redirectTo: "https://www.backyrd.ch/auth/callback?next=/reset-password" } });
  assert.ifError(recovery.error); assert(recovery.data.properties?.hashed_token);
  assert(recovery.data.properties.action_link.includes(encodeURIComponent("https://www.backyrd.ch/auth/callback?next=/reset-password")) || recovery.data.properties.action_link.includes("www.backyrd.ch"));
  const recoveryClient = client();
  const recovered = await recoveryClient.auth.verifyOtp({ token_hash: recovery.data.properties.hashed_token, type: "recovery" });
  assert.ifError(recovered.error); assert(recovered.data.session);
  const changed = await recoveryClient.auth.updateUser({ password: nextPassword });
  assert.ifError(changed.error);
  const oldLogin = await client().auth.signInWithPassword({ email: emails.verified, password });
  assert(oldLogin.error);
  const newLogin = await client().auth.signInWithPassword({ email: emails.verified, password: nextPassword });
  assert.ifError(newLogin.error);
  const reused = await client().auth.verifyOtp({ token_hash: recovery.data.properties.hashed_token, type: "recovery" });
  assert(reused.error);
  ok("recovery_password_change_and_single_use");

  const rightsClient = client();
  const rightsLogin = await rightsClient.auth.signInWithPassword({ email: emails.verified, password: nextPassword });
  assert.ifError(rightsLogin.error);
  const requested = await rightsClient.rpc("request_my_account_deletion_v1", { p_user_note: "Gate 4 isolated acceptance; cancel immediately" });
  assert.ifError(requested.error);
  const listed = await rightsClient.rpc("get_my_data_rights_requests_v1");
  assert.ifError(listed.error); assert(Array.isArray(listed.data));
  const cancelled = await rightsClient.rpc("cancel_my_account_deletion_v1");
  assert.ifError(cancelled.error);
  ok("data_rights_request_and_cancel");

  const malformed = await fetch("https://www.backyrd.ch/auth/callback?code=invalid-gate4&next=https://example.invalid", { redirect: "manual" });
  assert([302, 303, 307, 308].includes(malformed.status));
  const location = malformed.headers.get("location") ?? "";
  assert(location.startsWith("https://www.backyrd.ch/auth/error"));
  ok("malformed_callback_and_open_redirect");

  process.stdout.write(`${JSON.stringify({ result: "PASS", scenarios: Object.keys(report).length, report }, null, 2)}\n`);
} finally {
  for (const id of [...new Set(created)]) {
    try {
      await removeIsolatedUser(id);
    } catch (error) {
      process.stderr.write(`cleanup_failed:${id.slice(0, 8)}:${error instanceof Error ? error.message : "unknown"}\n`);
    }
  }
}
