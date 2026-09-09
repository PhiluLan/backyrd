#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const forbiddenPublicName = /(?:EXPO_PUBLIC|NEXT_PUBLIC)_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE_KEY|ACCESS_TOKEN)/;
const secretValue = /\bsb_secret_[A-Za-z0-9_-]{10,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;

export function validateClientSecretBoundary({ root, headSha = "HEAD" }) {
  const files = git(root, ["ls-tree", "-r", "--name-only", headSha]).split("\n").filter(Boolean);
  const failures = [];
  for (const path of files) {
    if (!/^(mobile|web|admin-dashboard)\//.test(path) || /(?:package-lock\.json|\.(?:png|jpg|jpeg|gif|webp|woff2?))$/.test(path)) continue;
    let source;
    try { source = git(root, ["show", `${headSha}:${path}`]); } catch { continue; }
    const clientReachable = path.startsWith("mobile/") || /^\s*["']use client["'];/m.test(source);
    if (forbiddenPublicName.test(source)) failures.push(`${path}:privileged_secret_named_public`);
    if (secretValue.test(source)) failures.push(`${path}:private_or_service_secret_literal`);
    if (clientReachable && /SUPABASE_SERVICE_ROLE_KEY|\bservice_role\b/.test(source)) failures.push(`${path}:service_role_in_client_reachable_source`);
  }
  if (failures.length) throw new Error(failures.join(","));
  return { schemaVersion: "backyrd-client-secret-boundary-v1", scannedFiles: files.length, outcome: "PASS" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateClientSecretBoundary({ root: resolve(new URL("../..", import.meta.url).pathname) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`client_secret_boundary_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
