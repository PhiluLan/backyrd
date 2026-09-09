import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_VERSIONS,
  DecisionExecutionEnvelopeSchema,
  DecisionRequestSchema,
  ContractValidationError,
  parseDecisionRequest,
} from "../dist/index.js";
import { execution, request, world } from "./helpers.mjs";

test("request schema is strict, versioned and rejects client identity injection", () => {
  const valid = request();
  assert.deepEqual(parseDecisionRequest(valid), valid);
  assert.throws(() => DecisionRequestSchema.parse({ ...valid, contractVersion: "unknown" }), ContractValidationError);
  const { client, ...missing } = valid;
  assert.ok(client);
  assert.throws(() => DecisionRequestSchema.parse(missing), /required field missing/);
  assert.throws(() => DecisionRequestSchema.parse({ ...valid, hardConstraints: [{ kind: "unapproved", value: true }] }), /no union variant matched/);
  assert.throws(() => DecisionRequestSchema.parse({ ...valid, userId: "foreign-user" }), /unknown field/);
  assert.throws(() => DecisionRequestSchema.parse({ ...valid, authenticatedActor: { kind: "user", userId: "foreign-user" } }), /unknown field/);
});

test("execution authority is a distinct server-only contract", () => {
  const syntheticWorld = world();
  const envelope = execution(undefined, syntheticWorld);
  assert.equal(DecisionExecutionEnvelopeSchema.parse(envelope).contractVersion, CONTRACT_VERSIONS.executionEnvelope);
  assert.throws(() => DecisionExecutionEnvelopeSchema.parse(request()), /unknown field|required field missing/);
  assert.throws(() => DecisionExecutionEnvelopeSchema.parse({ ...envelope, client: request().client }), /unknown field/);
  assert.throws(() => DecisionExecutionEnvelopeSchema.parse({ ...envelope, authenticatedActor: { kind: "user" } }), /no union variant matched/);
});

test("discriminated evidence and optional values fail closed", async () => {
  const { EvidenceItemSchema } = await import("../dist/index.js");
  assert.throws(() => EvidenceItemSchema.parse({ kind: "popularity", value: { city: "wrong" } }), /no union variant matched/);
  assert.throws(() => DecisionRequestSchema.parse({ ...request(), freeText: undefined }), /undefined is not a contract value/);
});
