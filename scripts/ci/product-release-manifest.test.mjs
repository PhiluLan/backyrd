import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildProductReleaseManifest, verifyProductReleaseManifest } from "./product-release-manifest.mjs";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-release-manifest-"));
  git(root, ["init", "--quiet", "-b", "main"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "Fixture"]);
  put(root, "supabase/config.toml", "project_id='fixture'\n");
  put(root, "supabase/functions/decision-v13/index.ts", "export default true;\n");
  put(root, "supabase/functions/legacy-decision/index.ts", "throw new Error('retired');\n");
  put(root, "mobile-export/index.html", "mobile\n");
  git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", "fixture"]);
  return root;
};

test("a release manifest binds source, tree and every deployable byte", () => {
  const root = fixture();
  const output = join(root, "release");
  mkdirSync(output);
  const manifest = buildProductReleaseManifest({ root, outputDir: output, mobileBundle: join(root, "mobile-export") });
  assert.equal(verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: manifest.sourceSha }).manifestHash, manifest.manifestHash);
  assert.deepEqual(manifest.components.productRuntime.map(({ path }) => path), ["supabase/functions/decision-v13/index.ts"]);
  assert.equal(JSON.stringify(manifest).includes("legacy-decision"), false);
  put(output, "bundle/supabase/config.toml", "tampered\n");
  assert.throws(() => verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: manifest.sourceSha }), /release_artifact_file_mismatch/);
});

test("a different release identity cannot replay the artifact", () => {
  const root = fixture();
  const output = join(root, "release"); mkdirSync(output);
  const manifest = buildProductReleaseManifest({ root, outputDir: output, mobileBundle: join(root, "mobile-export") });
  assert.throws(() => verifyProductReleaseManifest({ artifactDir: output, expectedHash: "0".repeat(64), expectedSourceSha: manifest.sourceSha }), /release_manifest_hash_mismatch/);
  assert.match(readFileSync(join(output, "release-manifest.json"), "utf8"), /buildOnceDeploySameArtifact/);
});
