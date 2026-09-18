#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const TARGET = "mobile/lib/decision/founderLiveRelease.generated.ts";

export function renderFounderLiveBinding(manifest) {
  const value = manifest.releaseBinding;
  return `// Generated from delivery/integration/founder-live-manifest.json. Do not hand-edit.\nimport type { FounderReleaseBinding } from "@backyrd/founder-live-control-plane";\n\nexport const FOUNDER_LIVE_RELEASE_BINDING: FounderReleaseBinding = Object.freeze(${JSON.stringify(value, null, 2)});\n`;
}

export function verifyFounderLiveBinding(root = ROOT) {
  const manifest = JSON.parse(readFileSync(resolve(root, "delivery/integration/founder-live-manifest.json"), "utf8"));
  const generated = readFileSync(resolve(root, TARGET), "utf8");
  if (generated !== renderFounderLiveBinding(manifest)) throw new Error("founder_live_generated_binding_drift");
  return { status: "PASS", target: TARGET, releaseHash: manifest.releaseBinding.releaseHash, bindingHash: manifest.releaseBinding.bindingHash };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(verifyFounderLiveBinding(resolve(process.argv[2] ?? ROOT)))}\n`); }
  catch (error) { process.stderr.write(`founder_live_binding_blocked:${error.message}\n`); process.exitCode = 1; }
}
