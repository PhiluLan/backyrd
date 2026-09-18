#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }).trim();
const walk = (root) => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(root, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

export function buildProductReleaseManifest({ root, sourceSha = "HEAD", outputDir, mobileBundle }) {
  const canonicalSha = git(root, ["rev-parse", sourceSha]);
  const treeSha = git(root, ["rev-parse", `${canonicalSha}^{tree}`]);
  const tracked = git(root, ["ls-tree", "-r", "--name-only", canonicalSha, "--", "supabase/functions/decision-v13", "supabase/migrations", "supabase/config.toml", "supabase/production"])
    .split("\n").filter(Boolean).sort();
  const bundleRoot = resolve(outputDir, "bundle");
  mkdirSync(bundleRoot, { recursive: true });
  const files = [];
  for (const path of tracked) {
    const content = execFileSync("git", ["show", `${canonicalSha}:${path}`], { cwd: root });
    const target = resolve(bundleRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    files.push({ path, bytes: content.length, sha256: sha256(content) });
  }
  if (mobileBundle) {
    const source = resolve(mobileBundle);
    const targetRoot = resolve(bundleRoot, "mobile-update");
    cpSync(source, targetRoot, { recursive: true });
    for (const path of walk(targetRoot).sort()) {
      if (!statSync(path).isFile()) continue;
      const content = readFileSync(path);
      files.push({ path: `mobile-update/${relative(targetRoot, path)}`, bytes: content.length, sha256: sha256(content) });
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const body = {
    contractVersion: "backyrd.product-release-manifest@2.0",
    sourceSha: canonicalSha,
    sourceTreeSha: treeSha,
    buildOnceDeploySameArtifact: true,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    components: {
      productRuntime: files.filter(({ path }) => path.startsWith("supabase/functions/decision-v13/")),
      database: files.filter(({ path }) => path.startsWith("supabase/migrations/")),
      releaseConfiguration: files.filter(({ path }) => path === "supabase/config.toml" || path.startsWith("supabase/production/")),
      mobileUpdate: files.filter(({ path }) => path.startsWith("mobile-update/")),
    },
  };
  const manifest = { ...body, manifestHash: sha256(JSON.stringify(body)) };
  writeFileSync(resolve(outputDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function verifyProductReleaseManifest({ artifactDir, expectedHash, expectedSourceSha, checkoutRoot }) {
  const manifest = JSON.parse(readFileSync(resolve(artifactDir, "release-manifest.json"), "utf8"));
  const { manifestHash, ...body } = manifest;
  if (manifest.contractVersion !== "backyrd.product-release-manifest@2.0") throw new Error("release_manifest_contract_invalid");
  if (sha256(JSON.stringify(body)) !== manifestHash || manifestHash !== expectedHash) throw new Error("release_manifest_hash_mismatch");
  if (manifest.sourceSha !== expectedSourceSha) throw new Error("release_manifest_source_mismatch");
  const componentFiles = [
    ...manifest.components.productRuntime,
    ...manifest.components.database,
    ...manifest.components.releaseConfiguration,
    ...manifest.components.mobileUpdate,
  ];
  for (const file of componentFiles) {
    const content = readFileSync(resolve(artifactDir, "bundle", file.path));
    if (content.length !== file.bytes || sha256(content) !== file.sha256) throw new Error(`release_artifact_file_mismatch:${file.path}`);
    if (checkoutRoot && file.path.startsWith("supabase/")) {
      const checkedOut = readFileSync(resolve(checkoutRoot, file.path));
      if (sha256(checkedOut) !== file.sha256) throw new Error(`release_checkout_file_mismatch:${file.path}`);
    }
  }
  return manifest;
}

const args = Object.fromEntries(process.argv.slice(3).flatMap((value, index, all) => value.startsWith("--") ? [[value.slice(2), all[index + 1]]] : []));
const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
    if (process.argv[2] === "build") {
      const result = buildProductReleaseManifest({ root, sourceSha: args["source-sha"] ?? "HEAD", outputDir: resolve(args.output), mobileBundle: args["mobile-bundle"] });
      process.stdout.write(`${JSON.stringify({ status: "PASS", manifestHash: result.manifestHash })}\n`);
    } else if (process.argv[2] === "verify") {
      const result = verifyProductReleaseManifest({ artifactDir: resolve(args.artifact), expectedHash: args["expected-hash"], expectedSourceSha: args["expected-source-sha"], checkoutRoot: args["checkout-root"] ? resolve(args["checkout-root"]) : undefined });
      process.stdout.write(`${JSON.stringify({ status: "PASS", manifestHash: result.manifestHash })}\n`);
    } else throw new Error("release_manifest_command_invalid");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
