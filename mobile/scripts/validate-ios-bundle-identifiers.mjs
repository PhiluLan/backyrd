import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const expectedPrimaryIdentifier = "com.philipplanger.backyrd";
const ipaPath = process.argv[2];

if (!ipaPath || !fs.existsSync(ipaPath)) {
  console.error("Usage: npm run release:verify:ios-ipa -- /absolute/path/to/build.ipa");
  process.exit(2);
}

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "backyrd-ios-identifiers-"));

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  }).trim();
}

function bundleIdentifier(bundlePath) {
  return run("plutil", ["-extract", "CFBundleIdentifier", "raw", path.join(bundlePath, "Info.plist")]);
}

function embeddedBundles(directory, suffix) {
  const results = [];
  if (!fs.existsSync(directory)) return results;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith(suffix)) results.push(fullPath);
    results.push(...embeddedBundles(fullPath, suffix));
  }
  return results;
}

function provisioningApplicationIdentifier(bundlePath) {
  const profilePath = path.join(bundlePath, "embedded.mobileprovision");
  if (!fs.existsSync(profilePath)) throw new Error(`Missing provisioning profile: ${bundlePath}`);
  const profile = run("openssl", ["smime", "-inform", "der", "-verify", "-noverify", "-in", profilePath]);
  return run("plutil", ["-extract", "Entitlements.application-identifier", "raw", "-"], { input: profile });
}

try {
  run("unzip", ["-q", path.resolve(ipaPath), "-d", temporaryDirectory]);
  const payloadPath = path.join(temporaryDirectory, "Payload");
  const primaryApps = fs
    .readdirSync(payloadPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
    .map((entry) => path.join(payloadPath, entry.name));

  if (primaryApps.length !== 1) {
    throw new Error(`Expected exactly one primary .app, found ${primaryApps.length}`);
  }

  const primaryApp = primaryApps[0];
  const primaryIdentifier = bundleIdentifier(primaryApp);
  if (primaryIdentifier !== expectedPrimaryIdentifier) {
    throw new Error(
      `Primary bundle identifier mismatch: expected ${expectedPrimaryIdentifier}, received ${primaryIdentifier}`
    );
  }

  const targets = [primaryApp, ...embeddedBundles(primaryApp, ".appex"), ...embeddedBundles(primaryApp, ".app")];
  const seen = new Set();
  const verified = [];

  for (const target of targets) {
    if (seen.has(target)) continue;
    seen.add(target);
    const identifier = bundleIdentifier(target);
    const isPrimary = target === primaryApp;
    if (!isPrimary && !identifier.startsWith(`${expectedPrimaryIdentifier}.`)) {
      throw new Error(`Embedded target ${path.basename(target)} has invalid non-child identifier ${identifier}`);
    }

    const applicationIdentifier = provisioningApplicationIdentifier(target);
    if (!applicationIdentifier.endsWith(`.${identifier}`)) {
      throw new Error(
        `Provisioning identifier mismatch for ${path.basename(target)}: ${applicationIdentifier} does not sign ${identifier}`
      );
    }
    verified.push({ target: path.basename(target), identifier, applicationIdentifier });
  }

  console.log(JSON.stringify({ ipa: path.basename(ipaPath), expectedPrimaryIdentifier, verified }, null, 2));
  console.log(`iOS bundle identifier verification passed (${verified.length} signed target${verified.length === 1 ? "" : "s"}).`);
} catch (error) {
  console.error(`iOS bundle identifier verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
