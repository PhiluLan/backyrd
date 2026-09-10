import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./production-coverage-readonly-v1.sql", import.meta.url), "utf8");

test("production coverage query is bounded, aggregate-only and transactionally read-only", () => {
  assert.match(sql, /begin transaction read only;/i);
  assert.match(sql, /set local statement_timeout = '10s';/i);
  assert.match(sql, /set local lock_timeout = '1s';/i);
  assert.match(sql, /jsonb_build_object\(/i);
  assert.match(sql, /rollback;\s*$/i);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|drop|truncate|call)\b/i);
  assert.doesNotMatch(sql, /select\s+(?:s\.)?(?:id|name|address|phone|email|owner_id|created_by)\b/i);
});

test("production coverage query never invokes application functions", () => {
  assert.doesNotMatch(sql, /\b(?:rpc|perform)\b/i);
  assert.doesNotMatch(sql, /public\.[a-z0-9_]+\s*\(/i);
});
