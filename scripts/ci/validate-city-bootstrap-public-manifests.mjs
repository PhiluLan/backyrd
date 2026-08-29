#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(process.cwd(), "docs/spot-intelligence/manifests");
const forbiddenKeys = new Set(["identityKey", "sourceFingerprint", "googlePlaceId"]);
const secretPatterns = [
  /^AIza[0-9A-Za-z_-]{30,}$/,
  /^sk-[A-Za-z0-9_-]{20,}$/,
  /^sb_secret_[A-Za-z0-9_-]{20,}$/,
  /^[0-9a-f]{64}$/i,
  /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/
];

function validate(value, path, failures) {
  if (typeof value === "string" && secretPatterns.some((pattern) => pattern.test(value))) failures.push(`${path}: credential-like or operational fingerprint value`);
  if (Array.isArray(value)) { value.forEach((entry, index) => validate(entry, `${path}[${index}]`, failures)); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) failures.push(`${path}.${key}: operational identifier key`);
    validate(entry, `${path}.${key}`, failures);
  }
}

const failures = [];
for (const name of (await readdir(directory)).filter((file) => file.endsWith(".json")).sort()) {
  const value = JSON.parse(await readFile(resolve(directory, name), "utf8"));
  validate(value, name, failures);
}
if (failures.length) {
  console.error(`City Bootstrap public manifest boundary failed:\n${failures.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log("City Bootstrap public manifest boundary passed.");
