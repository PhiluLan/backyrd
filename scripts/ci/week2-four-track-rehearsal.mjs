#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWeek2Documents, validateWeek2Documents } from "./week2-dark-wiring.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
const git = (root, args, options = {}) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    GIT_AUTHOR_NAME: "Backyrd Week 2 Rehearsal",
    GIT_AUTHOR_EMAIL: "week2-rehearsal@example.invalid",
    GIT_COMMITTER_NAME: "Backyrd Week 2 Rehearsal",
    GIT_COMMITTER_EMAIL: "week2-rehearsal@example.invalid",
    GIT_AUTHOR_DATE: "2026-09-17T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-09-17T00:00:00Z",
  },
  ...options,
}).trim();

const parseArgs = (argv) => Object.fromEntries(argv.reduce((items, value, index) => {
  if (value.startsWith("--")) items.push([value.slice(2), argv[index + 1]]);
  return items;
}, []));

const changedFiles = (root, base, head) => new Set(git(root, ["diff", "--name-only", `${base}..${head}`]).split("\n").filter(Boolean));
const intersections = (left, right) => [...left].filter((value) => right.has(value)).sort();

function mergeStep(root, left, right, label) {
  try {
    const output = git(root, ["merge-tree", "--write-tree", left, right]);
    const treeSha = output.split("\n")[0].trim();
    requireValue(/^[0-9a-f]{40}$/.test(treeSha), `week2_merge_tree_invalid:${label}`);
    const commitSha = git(root, ["commit-tree", treeSha, "-p", left, "-p", right, "-m", `Week 2 rehearsal: ${label}`]);
    return { label, left, right, treeSha, commitSha, conflicts: [] };
  } catch (error) {
    const details = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n");
    throw new Error(`week2_merge_conflict:${label}:${details}`);
  }
}

export function rehearseFourTrack({ root = ROOT, integrationHead = "HEAD" }) {
  const documents = loadWeek2Documents(root);
  const state = validateWeek2Documents(documents);
  requireValue(state.boundDomainCandidates === 3, "week2_all_domain_candidates_required");
  const baseSha = documents.manifest.canonicalBaseSha;
  const integrationHeadSha = git(root, ["rev-parse", `${integrationHead}^{commit}`]);
  const ordered = [
    ...documents.manifest.domainCandidates.map(({ track, headSha }) => ({ track, headSha })),
    { track: "INTEGRATION", headSha: integrationHeadSha },
  ];
  const changes = Object.fromEntries(ordered.map(({ track, headSha }) => [track, changedFiles(root, baseSha, headSha)]));
  const overlaps = [];
  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      const files = intersections(changes[ordered[left].track], changes[ordered[right].track]);
      if (files.length) overlaps.push({ left: ordered[left].track, right: ordered[right].track, files });
    }
  }

  let current = baseSha;
  const steps = [];
  for (const item of ordered) {
    const step = mergeStep(root, current, item.headSha, item.track);
    steps.push(step);
    current = step.commitSha;
  }
  return {
    contractVersion: "backyrd.week2-four-track-rehearsal@1.0",
    status: "MERGEABLE_WITHOUT_CONFLICT",
    executionAuthorized: false,
    baseSha,
    integrationHeadSha,
    orderedHeads: ordered,
    steps,
    combinedCommitSha: current,
    combinedTreeSha: steps.at(-1).treeSha,
    conflictCount: 0,
    overlaps,
    productionActionPerformed: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = rehearseFourTrack({ root: resolve(args.root ?? ROOT), integrationHead: args["integration-head"] ?? "HEAD" });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`week2_four_track_rehearsal_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
