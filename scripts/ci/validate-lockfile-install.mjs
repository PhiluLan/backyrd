#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function lockfileInstallProblems(root) {
  const committed = readJson(join(root, "package-lock.json"));
  const installed = readJson(join(root, "node_modules/.package-lock.json"));
  const problems = [];
  if (committed.lockfileVersion !== installed.lockfileVersion) {
    problems.push("installed lockfile version differs from committed lockfile");
  }

  const committedPackages = committed.packages ?? {};
  const installedPackages = installed.packages ?? {};
  const identityFields = ["version", "resolved", "integrity", "link"];
  for (const [path, installedRecord] of Object.entries(installedPackages)) {
    const committedRecord = committedPackages[path];
    if (!committedRecord) {
      problems.push(`installed package is absent from committed lockfile: ${path}`);
      continue;
    }
    for (const field of identityFields) {
      if ((installedRecord[field] ?? null) !== (committedRecord[field] ?? null)) {
        problems.push(`installed package ${field} differs from committed lockfile: ${path}`);
      }
    }
    if (!installedRecord.link && installedRecord.version) {
      let packageJson;
      try {
        packageJson = readJson(join(root, path, "package.json"));
      } catch {
        problems.push(`installed package metadata is missing: ${path}`);
        continue;
      }
      const actualVersion = String(packageJson.version ?? "").replace(/^v(?=\d)/, "");
      const lockedVersion = String(installedRecord.version).replace(/^v(?=\d)/, "");
      if (actualVersion !== lockedVersion) {
        problems.push(`installed package version differs from lockfile: ${path}`);
      }
    }
  }

  const rootRecord = committedPackages[""] ?? {};
  const directNames = new Set([
    ...Object.keys(rootRecord.dependencies ?? {}),
    ...Object.keys(rootRecord.devDependencies ?? {}),
  ]);
  for (const name of directNames) {
    const path = `node_modules/${name}`;
    if (!installedPackages[path]) problems.push(`direct lockfile dependency is missing: ${name}`);
  }
  return problems;
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1
    ? resolve(dirname(fileURLToPath(import.meta.url)), "../..")
    : resolve(process.argv[rootIndex + 1]);
  let problems;
  try {
    problems = lockfileInstallProblems(root);
  } catch (error) {
    process.stderr.write(`Lockfile-installed repository dependencies are missing or unreadable: ${error.message}\n`);
    process.exit(1);
  }
  if (problems.length) {
    process.stderr.write(`${problems.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write("Repository dependencies match the committed lockfile identities.\n");
}
