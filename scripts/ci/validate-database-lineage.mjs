#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationPattern = /^(\d{14})_([a-z0-9_]+)\.sql$/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function migrationFiles(root) {
  const directory = resolve(root, "supabase/migrations");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .map((filename) => {
      const match = filename.match(migrationPattern);
      invariant(match, `invalid migration filename: ${filename}`);
      return {
        version: match[1],
        name: match[2],
        filename,
        bytes: readFileSync(resolve(directory, filename)),
      };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

export function validateLineage(root, options = {}) {
  const manifestPath = resolve(root, "supabase/canonical/database-lineage-v1.json");
  invariant(existsSync(manifestPath), "missing database lineage manifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  invariant(manifest.version === "backyrd-database-lineage-v1", "unsupported lineage manifest version");

  const local = migrationFiles(root);
  const localByVersion = new Map();
  for (const migration of local) {
    invariant(!localByVersion.has(migration.version), `duplicate migration version: ${migration.version}`);
    localByVersion.set(migration.version, migration);
  }

  invariant(
    manifest.locked_migration_count === manifest.migrations.length,
    "locked migration count does not match manifest entries",
  );
  const lockedVersions = new Set();
  for (const expected of manifest.migrations) {
    invariant(!lockedVersions.has(expected.version), `duplicate locked version: ${expected.version}`);
    lockedVersions.add(expected.version);
    const actual = localByVersion.get(expected.version);
    invariant(actual, `locked migration missing: ${expected.filename}`);
    invariant(actual.filename === expected.filename, `locked migration renamed: ${expected.version}`);
    invariant(sha256(actual.bytes) === expected.sha256, `locked migration content changed: ${expected.filename}`);
  }

  const lockedTip = [...lockedVersions].sort().at(-1);
  invariant(lockedTip === manifest.locked_tip, "locked tip does not match locked migrations");
  for (const migration of local) {
    if (!lockedVersions.has(migration.version)) {
      invariant(
        migration.version > manifest.locked_tip,
        `unlocked migration is not a forward migration: ${migration.filename}`,
      );
    }
  }

  for (const alias of manifest.production_aliases) {
    const production = localByVersion.get(alias.production_version);
    const canonical = localByVersion.get(alias.canonical_version);
    invariant(production?.filename === alias.production_filename, `Production alias missing: ${alias.production_version}`);
    invariant(canonical?.filename === alias.canonical_filename, `canonical alias missing: ${alias.canonical_version}`);
    invariant(production.bytes.equals(canonical.bytes), `alias pair content differs: ${alias.production_version}`);
    invariant(sha256(production.bytes) === alias.canonical_file_sha256, `alias file hash differs: ${alias.production_version}`);

    let ledgerComparable = production.bytes;
    if (
      ledgerComparable.length === alias.production_ledger_bytes + 1 &&
      ledgerComparable.at(-1) === 10
    ) {
      ledgerComparable = ledgerComparable.subarray(0, ledgerComparable.length - 1);
    }
    invariant(
      ledgerComparable.length === alias.production_ledger_bytes,
      `Production ledger byte count is unexplained: ${alias.production_version}`,
    );
    invariant(
      sha256(ledgerComparable) === alias.production_ledger_sha256,
      `Production ledger content differs: ${alias.production_version}`,
    );
  }

  if (options.remoteVersions) {
    const remote = [...options.remoteVersions].filter(Boolean);
    invariant(new Set(remote).size === remote.length, "remote ledger contains duplicate versions");
    for (const version of remote) {
      invariant(localByVersion.has(version), `Production migration is absent from canonical Git: ${version}`);
    }
    if (options.requireRemoteEqual) {
      invariant(remote.length === local.length, "Production and canonical migration counts differ");
      invariant(remote.join("\n") === local.map((item) => item.version).join("\n"), "Production and canonical ledgers differ");
    }
  }

  return { manifest, local };
}

export function validateBaseDiff(root, baseSha, manifest) {
  const output = execFileSync(
    "git",
    ["-C", root, "diff", "--name-status", `${baseSha}...HEAD`, "--", "supabase/migrations"],
    { encoding: "utf8" },
  ).trim();
  if (!output) return;

  const allowedHistorical = new Set(manifest.production_aliases.map((alias) => alias.production_filename));
  const baseNames = execFileSync(
    "git",
    ["-C", root, "ls-tree", "-r", "--name-only", baseSha, "--", "supabase/migrations"],
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean).map((path) => path.split("/").at(-1));
  const baseTip = baseNames.map((name) => name.match(migrationPattern)?.[1]).filter(Boolean).sort().at(-1);

  for (const line of output.split("\n")) {
    const [status, path] = line.split("\t");
    invariant(status === "A", `historical migration changed or removed relative to base: ${line}`);
    const filename = path.split("/").at(-1);
    const version = filename.match(migrationPattern)?.[1];
    invariant(version, `invalid added migration filename: ${filename}`);
    invariant(
      version > baseTip || allowedHistorical.has(filename),
      `historical-version migration addition is not an authorized Production alias: ${filename}`,
    );
  }
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") result.root = argv[++index];
    else if (argument === "--base-sha") result.baseSha = argv[++index];
    else if (argument === "--remote-versions") result.remoteVersionsPath = argv[++index];
    else if (argument === "--require-remote-equal") result.requireRemoteEqual = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  return result;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const root = resolve(args.root ?? defaultRoot);
    const remoteVersions = args.remoteVersionsPath
      ? readFileSync(resolve(args.remoteVersionsPath), "utf8").trim().split(/\s+/).filter(Boolean)
      : undefined;
    const result = validateLineage(root, { remoteVersions, requireRemoteEqual: args.requireRemoteEqual });
    if (args.baseSha) validateBaseDiff(root, args.baseSha, result.manifest);
    process.stdout.write(`Database lineage guard passed: ${result.local.length} canonical migrations, ${result.manifest.production_aliases.length} certified aliases.\n`);
  } catch (error) {
    process.stderr.write(`Database lineage guard failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
