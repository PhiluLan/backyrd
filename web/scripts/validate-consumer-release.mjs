import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
];
for (const key of required) assert.ok(process.env[key], `${key} is required`);
assert.match(process.env.NEXT_PUBLIC_SITE_URL, /^https:\/\//, "Production site URL must use HTTPS");

const manifest = JSON.parse(await readFile(".next/server/app-paths-manifest.json", "utf8"));
for (const route of ["/page", "/decision/page", "/places/page", "/moments/page", "/spots/[id]/page", "/login/page", "/settings/page"]) {
  assert.ok(manifest[route], `Missing production route ${route}`);
}

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const staticFiles = (await files(".next/static")).filter((file) => /\.(?:js|css)$/.test(file));
const publicBundle = (await Promise.all(staticFiles.map((file) => readFile(file, "utf8")))).join("\n");
for (const forbidden of ["SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_PLACES_API_KEY", "public-spot-photo"]) {
  assert.ok(!publicBundle.includes(forbidden), `${forbidden} must not enter the browser bundle`);
}

const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/functions/v1/public-spot-photo`;
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  body: JSON.stringify({ spotId: "00000000-0000-0000-0000-000000000000" }),
});
assert.equal(response.status, 404, "public-spot-photo must remain disabled (404)");

console.log("Consumer Web production release validator: PASS");
