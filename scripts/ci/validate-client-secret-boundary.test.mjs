import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateClientSecretBoundary } from "./validate-client-secret-boundary.mjs";

const fixture = (path, source) => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-client-secret-")); execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), source);
  execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["-c", "user.name=CI", "-c", "user.email=ci@invalid", "commit", "-qm", "fixture"], { cwd: root }); return root;
};

test("public client configuration is accepted", () => {
  assert.equal(validateClientSecretBoundary({ root: fixture("mobile/config.ts", "export const url = process.env.EXPO_PUBLIC_SUPABASE_URL;\n") }).outcome, "PASS");
});
test("service role names and private values in client code fail closed", () => {
  for (const source of ["export const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n", "export const key = 'sb_secret_abcdefghijk';\n", "export const key = process.env.EXPO_PUBLIC_PROVIDER_SECRET;\n"]) {
    assert.throws(() => validateClientSecretBoundary({ root: fixture("mobile/config.ts", source) }), /service_role|private_or_service|privileged_secret/);
  }
});
