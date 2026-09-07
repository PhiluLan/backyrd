#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateCandidateEvidence, writeCandidateEvidence } from "./recertification-generate.mjs";
import { verifyPreMergeCandidate, writeVerificationReceipt } from "./recertification-verify.mjs";
import { applyCandidateEvidence } from "./recertification-apply.mjs";
import { validatePostMergeActiveChain } from "./recertification-consumer.mjs";

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
} else if (command === "verify-candidate") {
  const artifact = await load(args[0]); const receiptPath = required("receipt");
  const receipt = await verifyPreMergeCandidate({ root, artifact, prBaseSha: required("pr-base"), prHeadSha: required("pr-head") });
  if (receipt.valid) await writeVerificationReceipt(resolve(root, receiptPath), receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`); if (!receipt.valid) process.exitCode = 1;
} else if (command === "apply") {
  const artifact = await load(args[0]); const receipt = await load(required("receipt"));
  const result = await applyCandidateEvidence({ root, artifact, receipt, trustedBaseSha: required("pr-base") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === "consume-active") {
  const result = await validatePostMergeActiveChain({ root, canonicalMainSha: option("canonical-main", null), candidateSha: option("candidate", null) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.valid) process.exitCode = 1;
} else {
  process.stdout.write("Usage:\n  recertification generate --base v44 --base-sha <canonical-pr-base> --candidate <exact-pr-head> --scope evidence-only|presentation --evidence <path,...> --out <artifact>\n  recertification verify-candidate <artifact> --pr-base <canonical-pr-base> --pr-head <exact-pr-head> --receipt <receipt>\n  recertification apply <artifact> --pr-base <canonical-pr-base> --receipt <receipt>\n  recertification consume-active [--canonical-main <exact-origin-main-tip>] [--candidate <merged-candidate>]\n");
  if (command) process.exitCode = 1;
}
