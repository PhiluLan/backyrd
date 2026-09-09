#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { activeDatabaseEvidence } from "./validate-database-release.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, values) => { if (value.startsWith("--")) items.push([value.slice(2), values[index + 1]]); return items; }, []));
const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
const baseSha = args["base-sha"];
const id = args.id;
if (!baseSha || !/^[a-z0-9][a-z0-9-]*$/.test(id ?? "")) throw new Error("base_sha_and_release_id_required");
const snapshot = JSON.parse(readFileSync(resolve(args.snapshot), "utf8"));
const SHA256 = /^[0-9a-f]{64}$/;
if (!SHA256.test(snapshot.publicAclSha256 ?? "") || !SHA256.test(snapshot.applicationSchemaSha256 ?? "")) throw new Error("clean_boot_snapshot_invalid");
const changed = execFileSync("git", ["diff", "--cached", "--name-status", baseSha], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean).map((line) => { const [status, first, second] = line.split("\t"); return { status, path: second ?? first }; });
const migrations = changed.filter(({ status, path }) => status === "A" && path.startsWith("supabase/migrations/")).map(({ path }) => path).sort();
const tests = changed.filter(({ status, path }) => status !== "D" && /^supabase\/tests\/.+\.sql$/.test(path)).map(({ path }) => path).sort();
if (!migrations.length || !tests.length) throw new Error("stage_at_least_one_forward_migration_and_sql_test");
const item = (path) => ({ path, sha256: createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex") });
const previous = activeDatabaseEvidence(root, baseSha).evidence;
const record = { schemaVersion: "backyrd-database-evidence-v1", kind: "release", id, previousEvidence: previous.id, previousFingerprints: previous.fingerprints, migrations: migrations.map(item), tests: tests.map(item), fingerprints: { publicAclSha256: snapshot.publicAclSha256, applicationSchemaSha256: snapshot.applicationSchemaSha256 } };
const output = resolve(root, `delivery/database-releases/${id}.json`);
writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\n`);
