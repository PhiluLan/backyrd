import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { recordDatabaseGateReceipt, verifyDatabaseGateReceipt } from "./database-gate-receipt.mjs";

const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-db-receipt-"));
  put(root, "supabase/config.toml", "project_id='fixture'\n");
  put(root, "supabase/migrations/20260101000000_fixture.sql", "select 1;\n");
  put(root, "supabase/tests/fixture.sql", "select 1;\n");
  put(root, "scripts/ci/validate-supabase-current.sh", "gate\n");
  return root;
};
const snapshot = { publicAclSha256: "a".repeat(64), applicationSchemaSha256: "b".repeat(64) };

test("an input-identical receipt reuses the successful database execution", () => {
  const root = fixture();
  const receipt = recordDatabaseGateReceipt({ root, output: join(root, ".local/receipt.json"), snapshot, supabaseCliVersion: "2.80.0", databaseImage: "postgres:17" });
  assert.equal(verifyDatabaseGateReceipt({ root, receipt, supabaseCliVersion: "2.80.0", databaseImage: "postgres:17" }).receiptHash, receipt.receiptHash);
});

test("migration, SQL test, harness or toolchain drift requires a full rerun", () => {
  for (const mutate of [
    (root) => put(root, "supabase/migrations/20260101000000_fixture.sql", "select 2;\n"),
    (root) => put(root, "supabase/tests/fixture.sql", "select 2;\n"),
    (root) => put(root, "scripts/ci/validate-supabase-current.sh", "changed gate\n"),
  ]) {
    const root = fixture();
    const receipt = recordDatabaseGateReceipt({ root, output: join(root, ".local/receipt.json"), snapshot, supabaseCliVersion: "2.80.0", databaseImage: "postgres:17" });
    mutate(root);
    assert.throws(() => verifyDatabaseGateReceipt({ root, receipt, supabaseCliVersion: "2.80.0", databaseImage: "postgres:17" }), /inputs_changed_full_rerun_required/);
  }
  const root = fixture();
  const receipt = recordDatabaseGateReceipt({ root, output: join(root, ".local/receipt.json"), snapshot, supabaseCliVersion: "2.80.0", databaseImage: "postgres:17" });
  assert.throws(() => verifyDatabaseGateReceipt({ root, receipt, supabaseCliVersion: "2.81.0", databaseImage: "postgres:17" }), /inputs_changed_full_rerun_required/);
});

test("downstream release evidence does not invalidate a green database receipt", () => {
  const root = fixture();
  const receipt = recordDatabaseGateReceipt({ root, output: join(root, ".local/receipt.json"), snapshot, supabaseCliVersion: "2.80.0", databaseImage: "postgres:17" });
  put(root, "delivery/database-releases/new-release.json", "{}\n");
  assert.equal(verifyDatabaseGateReceipt({ root, receipt, supabaseCliVersion: "2.80.0", databaseImage: "postgres:17" }).receiptHash, receipt.receiptHash);
});
