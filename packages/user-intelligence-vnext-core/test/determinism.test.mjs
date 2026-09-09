import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, contentHash, COLD_SNAPSHOT, parseUserIntelligenceSnapshot, snapshotSemanticBody } from "../dist/index.js";

test("object key order and Unicode representation do not alter canonical bytes or hash", () => {
  const first = { z: 1, nested: { b: "é", a: true } };
  const second = { nested: { a: true, b: "e\u0301" }, z: 1 };
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(contentHash(first), contentHash(second));
});

test("semantically ordered arrays remain ordered", () => {
  assert.notEqual(contentHash({ events: ["first", "second"] }), contentHash({ events: ["second", "first"] }));
});

test("technical creation time is outside the snapshot semantic hash", () => {
  const changedClock = { ...COLD_SNAPSHOT, technicalMetadata: { createdAt: "2026-01-16T12:00:00.000Z" } };
  assert.equal(contentHash(snapshotSemanticBody(changedClock)), COLD_SNAPSHOT.snapshotHash);
  assert.equal(parseUserIntelligenceSnapshot(changedClock).snapshotHash, COLD_SNAPSHOT.snapshotHash);
});

test("non-finite values and undefined are rejected", () => {
  assert.throws(() => canonicalJson({ invalid: Number.NaN }), /non_finite/);
  assert.throws(() => canonicalJson({ invalid: undefined }), /undefined/);
});
