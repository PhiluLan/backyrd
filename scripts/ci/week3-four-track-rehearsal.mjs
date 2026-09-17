#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
const git = (root, args) => execFileSync("git", args, {
  cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_AUTHOR_NAME: "Backyrd Week 3 Rehearsal", GIT_AUTHOR_EMAIL: "week3-rehearsal@example.invalid", GIT_COMMITTER_NAME: "Backyrd Week 3 Rehearsal", GIT_COMMITTER_EMAIL: "week3-rehearsal@example.invalid", GIT_AUTHOR_DATE: "2026-09-17T00:00:00Z", GIT_COMMITTER_DATE: "2026-09-17T00:00:00Z" },
}).trim();
const changedFiles = (root, base, head) => new Set(git(root, ["diff", "--name-only", `${base}..${head}`]).split("\n").filter(Boolean));
const intersection = (left, right) => [...left].filter((item) => right.has(item)).sort();

function mergeStep(root, left, right, label) {
  try {
    const output = git(root, ["merge-tree", "--write-tree", left, right]);
    const treeSha = output.split("\n")[0].trim();
    requireValue(/^[0-9a-f]{40}$/.test(treeSha), `week3_merge_tree_invalid:${label}`);
    const commitSha = git(root, ["commit-tree", treeSha, "-p", left, "-p", right, "-m", `Week 3 rehearsal: ${label}`]);
    return { label, left, right, treeSha, commitSha, conflicts: [] };
  } catch (error) {
    throw new Error(`week3_merge_conflict:${label}:${[error.stdout, error.stderr, error.message].filter(Boolean).join("\n")}`);
  }
}

export function rehearseWeek3FourTrack({ root = ROOT, integrationHead = "HEAD" }) {
  const manifest = JSON.parse(readFileSync(resolve(root, "delivery/integration/week3-internal-prodlike-manifest.json"), "utf8"));
  const integrationHeadSha = git(root, ["rev-parse", `${integrationHead}^{commit}`]);
  const ordered = [...manifest.domainCandidates.map(({ track, baseSha, headSha }) => ({ track, baseSha, headSha })), { track: "INTEGRATION_FINAL_REVALIDATION", baseSha: manifest.canonicalBaseSha, headSha: integrationHeadSha }];
  const changes = Object.fromEntries(ordered.map(({ track, baseSha, headSha }) => [track, changedFiles(root, baseSha, headSha)]));
  const overlaps = [];
  for (let left = 0; left < ordered.length; left += 1) for (let right = left + 1; right < ordered.length; right += 1) {
    const files = intersection(changes[ordered[left].track], changes[ordered[right].track]);
    if (files.length) overlaps.push({ left: ordered[left].track, right: ordered[right].track, files });
  }
  const domainLineage = manifest.domainCandidates.map(({ track, headSha, treeSha, mergeSha, mergeTreeSha, mergeParents }) => ({ track, headSha, treeSha, mergeSha, mergeTreeSha, mergeParents }));
  const integrationStep = mergeStep(root, manifest.canonicalBaseSha, integrationHeadSha, "INTEGRATION_FINAL_REVALIDATION");
  return {
    contractVersion: "backyrd.week3-four-track-rehearsal@1.0",
    status: "MERGEABLE_WITHOUT_CONFLICT",
    executionAuthorized: false,
    baseSha: manifest.canonicalBaseSha,
    integrationHeadSha,
    orderedHeads: ordered.map(({ track, headSha }) => ({ track, headSha })),
    domainLineage,
    steps: [integrationStep],
    combinedCommitSha: integrationStep.commitSha,
    combinedTreeSha: integrationStep.treeSha,
    conflictCount: 0,
    overlaps,
    conflictResolutions: [],
    productionActionPerformed: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(rehearseWeek3FourTrack({ integrationHead: process.argv[2] ?? "HEAD" }), null, 2)}\n`); }
  catch (error) { process.stderr.write(`week3_four_track_rehearsal_blocked:${error.message}\n`); process.exitCode = 1; }
}
