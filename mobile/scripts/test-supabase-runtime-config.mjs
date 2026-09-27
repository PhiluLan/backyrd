import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { verifyIosOtaExport } from "./verify-ios-ota-export.mjs";

const source = fs.readFileSync(new URL("../lib/supabaseRuntimeConfig.ts", import.meta.url), "utf8");
const storage = fs.readFileSync(new URL("../lib/supabaseStorage.ts", import.meta.url), "utf8");
const appConfigSource = fs.readFileSync(new URL("../app.config.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

const nativeUrl = "https://native.supabase.co";
const updateUrl = "https://update.supabase.co";
const nativeKey = "n".repeat(32);
const updateKey = "u".repeat(32);

function releaseConfig(env) {
  const output = {};
  const code = ts.transpileModule(appConfigSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports: output,
    require: (name) => {
      assert.equal(name, "dotenv/config");
      return {};
    },
    process: { env },
  });
  return output.default({ config: {} });
}

function boot(nativeExtra, updateEnv) {
  const output = {};
  vm.runInNewContext(compiled, {
    exports: output,
    require: (name) => {
      assert.equal(name, "expo-constants");
      return { expoConfig: { extra: nativeExtra } };
    },
    process: { env: updateEnv },
    URL,
  });
  return JSON.parse(JSON.stringify(output.supabaseRuntimeConfig));
}

const bundled = {
  EXPO_PUBLIC_SUPABASE_URL: updateUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: updateKey,
};

assert.deepEqual(
  boot({ supabaseUrl: nativeUrl, supabaseAnonKey: nativeKey }, bundled),
  { valid: true, url: nativeUrl, anonKey: nativeKey },
  "a complete native pair remains authoritative"
);
assert.deepEqual(
  boot({ supabaseUrl: "", supabaseAnonKey: "" }, bundled),
  { valid: true, url: updateUrl, anonKey: updateKey },
  "empty legacy Expo extras must not mask the verified OTA pair"
);
assert.deepEqual(
  boot({ supabaseUrl: nativeUrl, supabaseAnonKey: "" }, bundled),
  { valid: true, url: updateUrl, anonKey: updateKey },
  "an incomplete native pair must not mix its URL with the OTA key"
);
assert.deepEqual(
  boot({ supabaseUrl: nativeUrl, supabaseAnonKey: "" }, {
    EXPO_PUBLIC_SUPABASE_URL: "",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: updateKey,
  }),
  { valid: false, url: null, anonKey: null },
  "two incomplete sources must remain fail-closed"
);
assert.deepEqual(
  boot({ supabaseUrl: "http://native.supabase.co", supabaseAnonKey: nativeKey }, bundled),
  { valid: true, url: updateUrl, anonKey: updateKey },
  "a non-HTTPS native endpoint must not hide a valid OTA pair"
);
assert.deepEqual(
  boot({}, {}),
  { valid: false, url: null, anonKey: null },
  "a genuinely unconfigured app must still show the start guard"
);
assert.match(storage, /supabaseRuntimeConfig\.url/, "auth storage must resolve the same project as the client");
assert.doesNotMatch(storage, /Constants\.expoConfig\?\.extra\?\.supabaseUrl/, "auth storage must not retain a second URL selector");
assert.throws(
  () => releaseConfig({ APP_VARIANT: "prod", BACKYRD_RELEASE_BUILD: "1" }),
  /Missing required production runtime configuration: EXPO_PUBLIC_SUPABASE_URL/,
  "the guarded Production export must fail without the EAS environment"
);
assert.throws(
  () => releaseConfig({ APP_VARIANT: "prod", BACKYRD_RELEASE_BUILD: "1", EXPO_PUBLIC_SUPABASE_URL: "https://hjgcrrzfjchzqoegcywn.supabase.co" }),
  /Missing required production runtime configuration: EXPO_PUBLIC_SUPABASE_ANON_KEY/,
  "a missing public key must fail Production manifest construction"
);
assert.throws(
  () => releaseConfig({ APP_VARIANT: "prod", BACKYRD_RELEASE_BUILD: "1", EXPO_PUBLIC_SUPABASE_URL: updateUrl, EXPO_PUBLIC_SUPABASE_ANON_KEY: updateKey }),
  /Production releases must use the bound Production Supabase project/,
  "Production may not silently point to another Supabase project"
);
assert.equal(
  releaseConfig({ APP_VARIANT: "prod", BACKYRD_RELEASE_BUILD: "1", EXPO_PUBLIC_SUPABASE_URL: "https://hjgcrrzfjchzqoegcywn.supabase.co", EXPO_PUBLIC_SUPABASE_ANON_KEY: updateKey }).extra.supabaseAnonKey,
  updateKey,
  "a correctly bound Production OTA remains buildable"
);

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "backyrd-ios-ota-"));
const expectedUrl = "https://hjgcrrzfjchzqoegcywn.supabase.co";
try {
  const bundlePath = "_expo/static/js/ios/entry.hbc";
  fs.mkdirSync(path.join(fixture, path.dirname(bundlePath)), { recursive: true });
  fs.writeFileSync(path.join(fixture, "metadata.json"), JSON.stringify({ fileMetadata: { ios: { bundle: bundlePath } } }));
  fs.writeFileSync(path.join(fixture, bundlePath), `prefix ${expectedUrl} ${updateKey} suffix`);
  assert.equal(verifyIosOtaExport(fixture, expectedUrl, updateKey).bundle, bundlePath);
  fs.writeFileSync(path.join(fixture, bundlePath), `prefix https://example.invalid ${updateKey} suffix`);
  assert.throws(() => verifyIosOtaExport(fixture, expectedUrl, updateKey), /ios_ota_url_not_embedded/);
  fs.writeFileSync(path.join(fixture, bundlePath), `prefix ${expectedUrl} suffix`);
  assert.throws(() => verifyIosOtaExport(fixture, expectedUrl, updateKey), /ios_ota_public_key_not_embedded/);
  fs.writeFileSync(path.join(fixture, bundlePath), `prefix ${expectedUrl} ${updateKey} https://example.invalid suffix`);
  assert.throws(() => verifyIosOtaExport(fixture, expectedUrl, updateKey), /ios_ota_placeholder_embedded/);
  assert.throws(() => verifyIosOtaExport(fixture, updateUrl, updateKey), /ios_ota_project_mismatch/);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log("Supabase runtime configuration recovery passed.");
