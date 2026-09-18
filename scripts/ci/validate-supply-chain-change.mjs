#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const git = (root, args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
}).trim();

const packageSections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "overrides", "resolutions", "packageManager"];
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  return value;
};
const stable = (value) => JSON.stringify(normalize(value));
const packagePolicy = (document) => Object.fromEntries(packageSections.map((key) => [key, document?.[key] ?? null]));
const lockForManifest = (path) => {
  if (path === "package.json" || path.startsWith("packages/")) return "package-lock.json";
  return `${dirname(path)}/package-lock.json`;
};
const installRootForManifest = (path) => {
  if (path === "package.json" || path.startsWith("packages/")) return ".";
  return dirname(path);
};
const readJsonAt = (root, revision, path) => JSON.parse(git(root, ["show", `${revision}:${path}`]));

export function validateActionPins(root) {
  const failures = [];
  const workflowPaths = git(root, ["ls-files", ".github/workflows/*.yml", ".github/workflows/*.yaml"]).split("\n").filter(Boolean);
  for (const path of workflowPaths) {
    const lines = readFileSync(resolve(root, path), "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = line.match(/\buses:\s*([^\s#]+)/);
      if (!match || match[1].startsWith("./")) return;
      const ref = match[1].split("@")[1] ?? "";
      if (!/^[0-9a-f]{40}$/.test(ref)) failures.push(`${path}:${index + 1}:action_not_pinned_to_commit`);
    });
  }
  return failures;
}

export function validateSupplyChainChange({ root, baseSha, headSha }) {
  const changes = git(root, ["diff", "--name-only", `${baseSha}..${headSha}`]).split("\n").filter(Boolean);
  const changed = new Set(changes);
  const manifests = changes.filter((path) => /(?:^|\/)package\.json$/.test(path));
  const installRoots = new Set();
  const failures = validateActionPins(root);

  for (const path of manifests) {
    let before;
    let after;
    try { before = readJsonAt(root, baseSha, path); } catch { before = {}; }
    try { after = readJsonAt(root, headSha, path); } catch { after = {}; }
    if (stable(packagePolicy(before)) === stable(packagePolicy(after))) continue;
    const lock = lockForManifest(path);
    if (!changed.has(lock)) failures.push(`${path}:dependency_change_without_${lock}`);
    if (!existsSync(resolve(root, lock))) failures.push(`${path}:missing_lockfile_${lock}`);
    installRoots.add(installRootForManifest(path));
  }

  for (const path of changes.filter((candidate) => /(?:^|\/)package-lock\.json$/.test(candidate))) {
    installRoots.add(dirname(path) === "." ? "." : dirname(path));
  }
  return { failures: [...new Set(failures)].sort(), installRoots: [...installRoots].sort() };
}

const args = Object.fromEntries(process.argv.slice(2).flatMap((value, index, all) => value.startsWith("--") ? [[value.slice(2), all[index + 1]]] : []));
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
  const result = validateSupplyChainChange({ root, baseSha: args["base-sha"], headSha: args["head-sha"] ?? "HEAD" });
  if (args.output) writeFileSync(resolve(args.output), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failures.length) process.exitCode = 2;
}
