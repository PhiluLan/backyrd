import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_PROJECT_REF = "hjgcrrzfjchzqoegcywn";

export function verifyIosOtaExport(directory, expectedUrl, expectedAnonKey) {
  assert.equal(typeof directory, "string", "ios_ota_directory_required");
  assert.equal(typeof expectedUrl, "string", "ios_ota_expected_url_required");
  assert.equal(typeof expectedAnonKey, "string", "ios_ota_expected_public_key_required");
  assert.equal(new URL(expectedUrl).hostname, `${PRODUCTION_PROJECT_REF}.supabase.co`, "ios_ota_project_mismatch");
  assert.ok(expectedAnonKey.length > 20, "ios_ota_public_key_invalid");

  const root = resolve(directory);
  const metadata = JSON.parse(readFileSync(resolve(root, "metadata.json"), "utf8"));
  const bundle = metadata.fileMetadata?.ios?.bundle;
  assert.equal(typeof bundle, "string", "ios_ota_bundle_missing");
  const bundlePath = resolve(root, bundle);
  assert.ok(bundlePath.startsWith(`${root}${sep}`), "ios_ota_bundle_outside_export");
  const bytes = readFileSync(bundlePath);
  assert.ok(bytes.includes(Buffer.from(expectedUrl)), "ios_ota_url_not_embedded");
  assert.ok(bytes.includes(Buffer.from(expectedAnonKey)), "ios_ota_public_key_not_embedded");
  assert.ok(!bytes.includes(Buffer.from("https://example.invalid")), "ios_ota_placeholder_embedded");
  return { bundle, bytes: bytes.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyIosOtaExport(
      process.argv[2],
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    );
    console.log(`Production iOS OTA export verified (${result.bytes} bytes).`);
  } catch (error) {
    console.error(`Production iOS OTA export blocked: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
