import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "../src/canonical-json.mjs";
import { canonicalizeLegacyCheckpoint, canonicalizeProviderResponse, N6A7_ALLOWLIST, N6A7_VERSIONS } from "../src/n6a7-provider-response.mjs";
import { assertSecretFree } from "../src/n6a3-atomic-checkpointing.mjs";

const response = (encryptedContent = "gAAAA opaque provider material") => ({
  id: "resp-fixture", object: "response", model: "gpt-5.6-sol", status: "completed", created_at: 1, completed_at: 2,
  output: [{ type: "message", role: "assistant", status: "completed", encrypted_content: encryptedContent, content: [{ type: "output_text", text: "{\"ranked_candidates\":[]}" }] }],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }, unknown_internal_blob: "must-not-persist"
});

test("N6A.7 canonical response uses an allowlist and drops opaque provider fields", () => {
  const first = canonicalizeProviderResponse(response("gAAAA-one"));
  const second = canonicalizeProviderResponse(response("gAAAA-two"));
  assert.equal(first.canonicalHash, second.canonicalHash);
  assert.equal(JSON.stringify(first).includes("encrypted_content"), false);
  assert.equal(JSON.stringify(first).includes("unknown_internal_blob"), false);
  assert.deepEqual(first.output.text, "{\"ranked_candidates\":[]}");
  assert.equal(first.usage.input_tokens, 10);
  assert.equal(N6A7_VERSIONS.response, "backyrd-n6a7-canonical-provider-response-v1");
  assert.ok(N6A7_ALLOWLIST.droppedProviderFields.includes("encrypted_content"));
  assertSecretFree(first);
});

test("N6A7 canonicalization preserves all scientific inputs needed for evaluation", () => {
  const canonical = canonicalizeProviderResponse(response());
  assert.deepEqual(canonical.response, { id: "resp-fixture", object: "response", model: "gpt-5.6-sol", status: "completed", created_at: 1, completed_at: 2 });
  assert.deepEqual(canonical.usage, { input_tokens: 10, output_tokens: 5, total_tokens: 15 });
  assert.equal(typeof canonical.output.text, "string");
});

test("N6A7 migrates 30 legacy checkpoint copies without changing scientific fields", () => {
  const legacy = Array.from({ length: 30 }, (_, index) => ({
    slotId: `slot-${index}`, inputHash: `input-${index}`, parsedOutput: { ranked_candidates: [{ spot_id: `spot-${index}`, rank: 1 }] },
    validatorDisposition: { valid: index % 7 !== 0, reason: index % 7 === 0 ? "UNSUPPORTED_REASON_EVIDENCE" : null },
    inputTokens: 100 + index, outputTokens: 20 + index, latencyMs: 1000 + index, verifiedCostUsd: 0.1,
    rawOutput: response(`gAAAA-${index}`)
  }));
  const migrated = legacy.map(canonicalizeLegacyCheckpoint);
  assert.equal(migrated.length, 30);
  for (const [index, checkpoint] of migrated.entries()) {
    assert.equal(Object.hasOwn(checkpoint, "rawOutput"), false);
    assert.equal(checkpoint.canonicalProviderResponse.version, N6A7_VERSIONS.response);
    assert.deepEqual(checkpoint.parsedOutput, legacy[index].parsedOutput);
    assert.deepEqual(checkpoint.validatorDisposition, legacy[index].validatorDisposition);
    assert.equal(checkpoint.inputTokens, legacy[index].inputTokens);
    assert.equal(checkpoint.outputTokens, legacy[index].outputTokens);
    assert.equal(JSON.stringify(checkpoint).includes("encrypted_content"), false);
    assertSecretFree(checkpoint);
    assert.notEqual(contentHash(legacy[index]), contentHash(checkpoint));
  }
});

test("N6A7 fails closed for malformed or incomplete provider responses", () => {
  assert.throws(() => canonicalizeProviderResponse({ id: "missing-output", model: "gpt-5.6-sol", status: "completed" }), /N6A7_PROVIDER_RESPONSE_MALFORMED/);
  assert.throws(() => canonicalizeProviderResponse({ object: "response", status: "completed", output: [] }), /N6A7_PROVIDER_RESPONSE_IDENTITY_MISSING/);
  assert.throws(() => canonicalizeProviderResponse({ id: "bad", model: "gpt-5.6-sol", status: "completed", output: "bad" }), /N6A7_PROVIDER_RESPONSE_MALFORMED/);
});

test("N6A7 keeps real secrets fail-closed inside allowed model output", () => {
  const canonical = canonicalizeProviderResponse({ ...response(), output: [{ content: [{ type: "output_text", text: "sk-proj-abcdefghijklmnop" }] }] });
  assert.throws(() => assertSecretFree(canonical), /N6A3_SECRET_MATERIAL/);
});

