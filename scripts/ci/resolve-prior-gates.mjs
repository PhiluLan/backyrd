#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const gateNames = Object.freeze({
  "Mobile focused gate": "mobile",
  "Web focused gate": "web",
  "Admin focused gate": "admin",
  "Shared contracts": "shared",
  "User Intelligence focused gate": "user",
  "World Knowledge focused gate": "world",
  "Decision vNext focused gate": "decision",
  "Database clean boot and authorization": "database",
  "Dependency and supply-chain gate": "supply-chain",
  "Delivery policy v2": "delivery-policy",
  "Product release certification": "release-certification",
});
const allReusableGates = Object.freeze([...new Set(Object.values(gateNames))].sort());

const git = (root, args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

export function successfulPriorGates(checkRuns) {
  const finalGatePassed = checkRuns.some((run) => run?.name === "Risk-based merge gate"
    && run?.status === "completed" && run?.conclusion === "success"
    && run?.app?.slug === "github-actions"
    && typeof run?.details_url === "string" && /\/actions\/runs\/\d+/.test(run.details_url));
  if (finalGatePassed) return [...allReusableGates];
  return [...new Set(checkRuns
    .filter((run) => run?.status === "completed"
      && run?.conclusion === "success"
      && run?.app?.slug === "github-actions"
      && typeof run?.details_url === "string"
      && /\/actions\/runs\/\d+/.test(run.details_url)
      && gateNames[run.name])
    .map((run) => gateNames[run.name]))].sort();
}

export function validateResumeLineage({ root, baseSha, previousHeadSha, headSha }) {
  for (const sha of [baseSha, previousHeadSha, headSha]) {
    if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("gate_resume_identity_invalid");
  }
  if (previousHeadSha === headSha || previousHeadSha === baseSha) throw new Error("gate_resume_requires_distinct_prior_head");
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", baseSha, previousHeadSha], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["merge-base", "--is-ancestor", previousHeadSha, headSha], { cwd: root, stdio: "ignore" });
  } catch {
    throw new Error("gate_resume_lineage_invalid");
  }
  return { baseSha, previousHeadSha, headSha, previousTree: git(root, ["rev-parse", `${previousHeadSha}^{tree}`]) };
}

export async function resolvePriorGates({ root, eventName, eventAction, baseSha, previousHeadSha, headSha, repository, token, fetchImpl = fetch }) {
  if (eventName !== "pull_request" || eventAction !== "synchronize" || !previousHeadSha) {
    return { eligible: false, reason: "not_incremental_pull_request", successfulGates: [] };
  }
  try {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || !token) throw new Error("github_authority_missing");
    const candidates = git(root, ["rev-list", "--first-parent", "--max-count=12", previousHeadSha, `^${baseSha}`]).split("\n").filter(Boolean);
    for (const candidateSha of candidates) {
      const lineage = validateResumeLineage({ root, baseSha, previousHeadSha: candidateSha, headSha });
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/commits/${candidateSha}/check-runs?per_page=100`, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
        },
      });
      if (!response.ok) continue;
      const payload = await response.json();
      if (!Array.isArray(payload.check_runs)) continue;
      const successfulGates = successfulPriorGates(payload.check_runs);
      if (successfulGates.length === 0) continue;
      return {
        eligible: true,
        reason: candidateSha === previousHeadSha ? "verified_incremental_pull_request" : "verified_ancestor_gate_receipt",
        ...lineage,
        successfulGates,
      };
    }
    throw new Error("no_verified_prior_gate_receipt");
  } catch (error) {
    return { eligible: false, reason: `full_rerun_required:${error.message}`, successfulGates: [] };
  }
}

const parseArgs = (argv) => Object.fromEntries(argv.reduce((items, value, index) => {
  if (value.startsWith("--")) items.push([value.slice(2), argv[index + 1]]);
  return items;
}, []));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await resolvePriorGates({
      root: resolve(args.root ?? new URL("../..", import.meta.url).pathname),
      eventName: args["event-name"],
      eventAction: args["event-action"],
      baseSha: args["base-sha"],
      previousHeadSha: args["previous-head-sha"],
      headSha: args["head-sha"],
      repository: args.repository,
      token: process.env.GITHUB_TOKEN,
    });
    if (args.output) writeFileSync(resolve(args.output), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`gate_resume_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
