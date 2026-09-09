#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const RELEASE_CONFIRMATION = "DEPLOY_SUPABASE_PRODUCTION";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

const parseArgs = (argv) => {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`unexpected_argument:${value}`);
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) values[key] = true;
    else { values[key] = next; index += 1; }
  }
  return values;
};

const isAncestor = (repo, ancestor, descendant) => {
  try {
    execFileSync("git", ["-C", repo, "merge-base", "--is-ancestor", ancestor, descendant], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

export const verifyManualProductionRelease = ({ repo, eventName, requestedSha, confirmation }) => {
  if (eventName !== "workflow_dispatch") throw new Error("manual_release_event_required");
  if (confirmation !== RELEASE_CONFIRMATION) throw new Error("manual_release_confirmation_invalid");
  if (!/^[0-9a-f]{40}$/.test(requestedSha)) throw new Error("manual_release_sha_invalid");

  const canonicalMainTipSha = git(repo, ["rev-parse", "refs/remotes/origin/main^{commit}"]);
  if (!isAncestor(repo, requestedSha, canonicalMainTipSha)) throw new Error("manual_release_candidate_not_in_canonical_main_lineage");

  const checkoutSha = git(repo, ["rev-parse", "HEAD^{commit}"]);
  if (checkoutSha !== requestedSha) throw new Error("manual_release_checkout_mismatch");

  const state = JSON.parse(git(repo, ["show", `${requestedSha}:delivery/production-state.json`]));
  if (state.schemaVersion !== "backyrd-production-state-v1") throw new Error("manual_release_production_state_invalid");
  const baseSha = state.supabase?.shippedSourceSha;
  if (!/^[0-9a-f]{40}$/.test(baseSha ?? "") || !isAncestor(repo, baseSha, requestedSha)) {
    throw new Error("manual_release_shipped_baseline_invalid");
  }
  const evidence = {
    version: "backyrd-manual-production-release-authority-v2",
    eventName,
    canonicalMainTipSha,
    canonicalMainSha: requestedSha,
    checkoutSha,
    baseSha,
    baselineKind: "LAST_TECHNICALLY_SHIPPED_PRODUCTION",
    confirmation: RELEASE_CONFIRMATION,
  };
  return {
    ...evidence,
    authorizationHash: sha256(JSON.stringify(evidence)),
  };
};

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repo = resolve(args.repo ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
    const result = verifyManualProductionRelease({
      repo,
      eventName: String(args["event-name"] ?? ""),
      requestedSha: String(args["requested-sha"] ?? ""),
      confirmation: String(args.confirmation ?? ""),
    });
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    if (args.output) writeFileSync(resolve(args.output), serialized, { encoding: "utf8", flag: "wx" });
    else process.stdout.write(serialized);
  } catch (error) {
    process.stderr.write(`manual_production_release_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
