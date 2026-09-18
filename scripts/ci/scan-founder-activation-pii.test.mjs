import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanFounderActivationPii } from "./scan-founder-activation-pii.mjs";

const fixture = (content) => {
  const root = mkdtempSync(join(tmpdir(), "founder-activation-pii-"));
  const path = join(root, "evidence.json"); writeFileSync(path, content); return path;
};

test("accepts sanitized activation evidence", () => {
  assert.equal(scanFounderActivationPii([fixture('{"memberCount":2,"executionAuthorized":false}')]).findings, 0);
});

test("rejects concrete email", () => {
  const value = ["person", "example.invalid"].join("@");
  assert.throws(() => scanFounderActivationPii([fixture(`{"identity":"${value}"}`)]), /sensitive_value_detected/);
});

test("rejects concrete UUID", () => {
  const value = ["123e4567", "e89b", "42d3", "a456", "426614174000"].join("-");
  assert.throws(() => scanFounderActivationPii([fixture(`{"identity":"${value}"}`)]), /sensitive_value_detected/);
});
