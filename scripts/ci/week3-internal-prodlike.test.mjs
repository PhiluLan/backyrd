import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInternalAllowlistEnvelope, loadWeek3Documents, rehearseInternalProductLike, resolveWeek3Controls, sha256, validateInternalAllowlistEnvelope, validateWeek3Documents } from "./week3-internal-prodlike.mjs";
import { verifySecurityDefinerSources } from "./week3-internal-prodlike-preflight.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const fixture = JSON.parse(readFileSync(resolve(ROOT, "delivery/integration/fixtures/week3-internal-prodlike-synthetic.json"), "utf8"));
const releaseHash = sha256("week3-test-release"); const requestHash = sha256(fixture.requestBody);
const envelope = () => createInternalAllowlistEnvelope({ ...fixture, releaseHash, requestHash });
const authority = () => ({ status: "SYNTHETIC_TEST_AUTHORITY", subjectPseudonym: fixture.subjectPseudonym, purpose: fixture.purpose, environment: fixture.environment, releaseHash });
const on = { environment: "PROD_LIKE_TEST", internalTestOn: true, globalKillSwitch: "DISENGAGED", WORLD_KILL_SWITCH: "DISENGAGED", USER_KILL_SWITCH: "DISENGAGED", DECISION_KILL_SWITCH: "DISENGAGED" };

test("Week 3 documents remain closed and internally consistent", () => assert.equal(validateWeek3Documents(loadWeek3Documents(ROOT)).boundDomainCandidates, 3));
test("missing and unknown configuration are OFF", () => { assert.equal(resolveWeek3Controls().enabled, false); assert.equal(resolveWeek3Controls({ surprise: true }).reason, "UNKNOWN_CONFIGURATION_DENIED"); });
for (const key of ["globalKillSwitch", "WORLD_KILL_SWITCH", "USER_KILL_SWITCH", "DECISION_KILL_SWITCH"]) test(`${key} independently aborts activation`, () => assert.equal(resolveWeek3Controls({ ...on, [key]: "ENGAGED" }).enabled, false));
test("valid synthetic allowlist envelope is accepted", () => assert.equal(validateInternalAllowlistEnvelope(envelope(), authority(), fixture.now), true));
test("NOT_CONFIGURED authority denies", () => assert.throws(() => validateInternalAllowlistEnvelope(envelope(), { ...authority(), status: "NOT_CONFIGURED" }, fixture.now), /not_configured/));
test("expired authority denies", () => assert.throws(() => validateInternalAllowlistEnvelope(envelope(), authority(), "2026-09-17T14:00:00.000Z"), /expired_or_not_current/));
for (const [name, change] of [["purpose", { purpose: "WRONG" }], ["environment", { environment: "LOCAL_TEST" }], ["release", { releaseHash: sha256("wrong") }]]) test(`${name} mismatch denies`, () => assert.throws(() => validateInternalAllowlistEnvelope(envelope(), { ...authority(), ...change }, fixture.now), /mismatch/));
test("request tamper denies", () => { const value = { ...envelope(), requestHash: sha256("tampered") }; assert.throws(() => validateInternalAllowlistEnvelope(value, authority(), fixture.now), /tampered/); });
test("unknown envelope field denies", () => assert.throws(() => validateInternalAllowlistEnvelope({ ...envelope(), extra: true }, authority(), fixture.now), /unknown_or_missing/));
test("OFF to TEST-ON to Emergency-OFF preserves zero side effects", () => { const result = rehearseInternalProductLike({ fixture, configuration: on, envelope: envelope(), authority: authority(), emergencyAfterWorldRead: true }); assert.equal(result.aborted, true); assert.deepEqual(result.phases.emergencyOff, { worldReads: 0, userProjections: 0, decisionEvaluations: 0, writes: 0, networkCalls: 0, productOutputs: 0 }); assert.equal(result.productOutput, null); });
test("repeated OFF is idempotent", () => assert.deepEqual(rehearseInternalProductLike({ fixture, configuration: {} }), rehearseInternalProductLike({ fixture, configuration: {} })));
test("reports are byte-identical twice", () => { const first = rehearseInternalProductLike({ fixture, configuration: on, envelope: envelope(), authority: authority() }); const second = rehearseInternalProductLike({ fixture, configuration: on, envelope: envelope(), authority: authority() }); assert.equal(JSON.stringify(first), JSON.stringify(second)); });
test("unsafe SECURITY DEFINER search path fails", () => assert.throws(() => verifySecurityDefinerSources([{ path: "bad.sql", source: "create function private.bad() returns void language sql security definer as $$ select 1 $$; revoke execute on function private.bad() from public;" }]), /search_path_unsafe/));
test("SECURITY DEFINER without revoke fails", () => assert.throws(() => verifySecurityDefinerSources([{ path: "bad.sql", source: "create function private.bad() returns void language sql security definer set search_path = '' as $$ select 1 $$;" }]), /execute_not_revoked/));
test("safe SECURITY DEFINER boundary passes", () => assert.deepEqual(verifySecurityDefinerSources([{ path: "safe.sql", source: "create function private.safe() returns void language sql security definer set search_path = '' as $$ select 1 $$; revoke execute on function private.safe() from public;" }]), { unsafeSecurityDefinerCount: 0 }));
