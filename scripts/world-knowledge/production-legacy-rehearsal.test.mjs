import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const sql = readFileSync(new URL("./production-legacy-export-readonly-v1.sql", import.meta.url), "utf8").toLowerCase();
test("production query pack is explicitly read-only and bounded", () => {
  assert.match(sql, /begin transaction read only/); assert.match(sql, /statement_timeout/); assert.match(sql, /lock_timeout/);
  assert.doesNotMatch(sql, /\b(insert|update|delete|upsert|alter|create|drop|truncate|call)\b/);
});
test("production query excludes authority, commercial and user data", () => {
  for (const forbidden of ["auth.users", "owner_tier", "subscription", "billing", "user_intelligence", "admin_notes"]) assert.equal(sql.includes(`from ${forbidden}`), false);
  assert.match(sql, /public\.spots/); assert.match(sql, /public\.spot_hours/); assert.match(sql, /public\.categories/);
});
