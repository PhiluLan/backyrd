#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const BASE = "34c0cbec903e53087e28e46d1886648bc6ce72bc";
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const SECRET = /(?:service[_-]?role|secret[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/i;
const binary = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".woff", ".woff2", ".ttf", ".zip", ".gz", ".pdf"]);
const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();

function collect(path, values) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) collect(resolve(path, name), values);
    return;
  }
  if (!binary.has(extname(path).toLowerCase())) values.add(path);
}

export function scanFounderActivationPii(paths) {
  const findings = [];
  for (const path of paths) {
    const content = readFileSync(path, "utf8");
    for (const [kind, pattern] of [["EMAIL", EMAIL], ["UUID", UUID], ["SECRET_VALUE", SECRET]]) {
      if (pattern.test(content)) findings.push({ kind, path: path.startsWith(ROOT) ? path.slice(ROOT.length + 1) : path });
    }
  }
  if (findings.length) throw new Error(`founder_activation_sensitive_value_detected:${JSON.stringify(findings)}`);
  return { status: "PASS", scannedFiles: paths.length, findings: 0, concreteEmails: 0, concreteUuids: 0, secretValues: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = git(["diff", "--name-only", "--diff-filter=ACMR", `${BASE}..HEAD`]).split("\n").filter(Boolean).map((path) => resolve(ROOT, path));
  const paths = new Set(changed);
  for (const argument of process.argv.slice(2)) collect(resolve(ROOT, argument), paths);
  try { process.stdout.write(`${JSON.stringify(scanFounderActivationPii([...paths].filter(existsSync)))}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
