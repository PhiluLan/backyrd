#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateCandidateEvidence, writeCandidateEvidence } from "./recertification-generate.mjs";
import { verifyCandidateEvidence, writeVerificationReceipt } from "./recertification-verify.mjs";
import { applyCandidateEvidence } from "./recertification-apply.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);
const args = process.argv.slice(2); const command = args.shift();
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const required = (name) => { const value = option(name); if (!value) throw new Error(`Missing --${name}`); return value; };
const load = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

if (command === "generate") {
  const out = required("out");
  const artifact = await generateCandidateEvidence({ root, baseVersion: required("base"), baseMainSha: required("base-sha"), candidateSha: required("candidate"), requestedScope: required("scope"), evidencePaths: required("evidence").split(",").filter(Boolean) });
  await writeCandidateEvidence(resolve(root, out), artifact);
  process.stdout.write(`${JSON.stringify({ generated: true, out, artifactHash: artifact.artifactHash }, null, 2)}\n`);
} else if (command === "verify") {
  const artifact = await load(args[0]); const receiptPath = required("receipt");
  const receipt = await verifyCandidateEvidence({ root, artifact, trustedBaseSha: required("trusted-base") });
  if (receipt.valid) await writeVerificationReceipt(resolve(root, receiptPath), receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`); if (!receipt.valid) process.exitCode = 1;
} else if (command === "apply") {
  const artifact = await load(args[0]); const receipt = await load(required("receipt"));
  const result = await applyCandidateEvidence({ root, artifact, receipt, trustedBaseSha: required("trusted-base") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write("Usage:\n  recertification generate --base v44 --base-sha <sha> --candidate <sha> --scope evidence-only|presentation --evidence <path,...> --out <artifact>\n  recertification verify <artifact> --trusted-base <sha> --receipt <receipt>\n  recertification apply <artifact> --trusted-base <sha> --receipt <receipt>\n");
  if (command) process.exitCode = 1;
}
