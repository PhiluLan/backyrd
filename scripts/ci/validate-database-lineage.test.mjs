import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateLineage } from "./validate-database-lineage.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "backyrd-lineage-test-"));
  cpSync(resolve(repositoryRoot, "supabase/migrations"), resolve(root, "supabase/migrations"), { recursive: true });
  cpSync(
    resolve(repositoryRoot, "supabase/canonical/database-lineage-v1.json"),
    resolve(root, "supabase/canonical/database-lineage-v1.json"),
    { recursive: true },
  );
  return root;
}

test("accepts the certified lineage and a later forward migration", () => {
  const root = fixture();
  try {
    validateLineage(root);
    writeFileSync(resolve(root, "supabase/migrations/20260901000000_future_feature.sql"), "select 1;\n");
    validateLineage(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a changed historical migration", () => {
  const root = fixture();
  try {
    const manifest = JSON.parse(readFileSync(resolve(root, "supabase/canonical/database-lineage-v1.json")));
    const path = resolve(root, "supabase/migrations", manifest.migrations[0].filename);
    writeFileSync(path, `${readFileSync(path)}\n-- mutation\n`);
    assert.throws(() => validateLineage(root), /content changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a missing Production alias", () => {
  const root = fixture();
  try {
    const manifest = JSON.parse(readFileSync(resolve(root, "supabase/canonical/database-lineage-v1.json")));
    unlinkSync(resolve(root, "supabase/migrations", manifest.production_aliases[0].production_filename));
    assert.throws(() => validateLineage(root), /locked migration missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an unlocked migration inserted into history", () => {
  const root = fixture();
  try {
    writeFileSync(resolve(root, "supabase/migrations/20260801000000_illegal_history.sql"), "select 1;\n");
    assert.throws(() => validateLineage(root), /not a forward migration/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects Production-only migration truth", () => {
  assert.throws(
    () => validateLineage(repositoryRoot, { remoteVersions: ["19990101000000"] }),
    /absent from canonical Git/,
  );
});
