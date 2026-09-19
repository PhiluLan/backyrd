import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifyAlreadyAppliedProductMigrations } from "./verify-already-applied-product-migrations.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-preapplied-"));
  const pendingMigrations = Array.from({ length: 13 }, (_, index) => {
    const version = `20260919${String(index).padStart(6, "0")}`;
    const path = `supabase/migrations/${version}_fixture.sql`;
    const content = `select ${index};\n`;
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content);
    return { path, sha256: hash(content) };
  });
  const expectedVersions = ["20260909073004", ...pendingMigrations.map((item) => item.path.match(/\d{14}/)[0])];
  const listing = expectedVersions.map((version) => `   ${version} | ${version} | 2026-09-19`).join("\n");
  return { root, expectedVersions, pendingMigrations, listing };
};

test("only the exact fully applied ordered migration ledger is a no-SQL continuation", () => {
  const f = fixture();
  assert.equal(verifyAlreadyAppliedProductMigrations(f).status, "PASS_ALREADY_APPLIED_NO_SQL");
  assert.throws(() => verifyAlreadyAppliedProductMigrations({ ...f, listing: f.listing.replace(/20260919000012 \| 20260919000012/, "20260919000012 | ") }), /lineage_drift/);
  assert.throws(() => verifyAlreadyAppliedProductMigrations({ ...f, listing: f.listing.split("\n").slice(0, -1).join("\n") }), /count_drift/);
  assert.throws(() => verifyAlreadyAppliedProductMigrations({ ...f, pendingMigrations: f.pendingMigrations.map((item, index) => index === 0 ? { ...item, sha256: "0".repeat(64) } : item) }), /bytes_invalid/);
});
