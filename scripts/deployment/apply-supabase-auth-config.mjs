#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, values) => {
  if (value.startsWith("--")) items.push([value.slice(2), values[index + 1]]);
  return items;
}, []));
const plan = JSON.parse(readFileSync(args.plan, "utf8"));
const auth = plan.authConfig;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error("SUPABASE_ACCESS_TOKEN required");
if (!auth?.deploy || auth.path !== "supabase/production/auth-config.json") throw new Error("bound auth deployment plan required");
const source = readFileSync(auth.path);
const sourceHash = createHash("sha256").update(source).digest("hex");
if (sourceHash !== auth.sha256) throw new Error("auth config source identity mismatch");
const document = JSON.parse(source);
if (document.projectRef !== plan.projectRef) throw new Error("auth config project mismatch");
const endpoint = `https://api.supabase.com/v1/projects/${plan.projectRef}/config/auth`;
const request = async (method, body) => {
  const response = await fetch(endpoint, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`auth config ${method} failed:${response.status}`);
  return response.json();
};
const before = await request("GET");
const expected = document.config;
const changedKeys = Object.keys(expected).filter((key) => before[key] !== expected[key]);
if (changedKeys.length) await request("PATCH", expected);
const after = await request("GET");
for (const [key, value] of Object.entries(expected)) {
  if (after[key] !== value) throw new Error(`auth config verification failed:${key}`);
}
writeFileSync(args.audit, `${JSON.stringify({
  result: changedKeys.length ? "AUTH_CONFIG_DEPLOYED" : "AUTH_CONFIG_ALREADY_CURRENT",
  canonicalMainSha: plan.canonicalMainSha,
  planHash: plan.planHash,
  sourceHash,
  changedKeys,
  verified: Object.fromEntries(Object.keys(expected).map((key) => [key, after[key]])),
}, null, 2)}\n`, { flag: "wx" });
