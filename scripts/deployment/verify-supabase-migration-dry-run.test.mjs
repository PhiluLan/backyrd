import test from "node:test";
import assert from "node:assert/strict";
import { verifyMigrationDryRun } from "./verify-supabase-migration-dry-run.mjs";

const migration = "20260901191833_gate5_harden_user_achievements_privacy.sql";
const plan = (names) => ({
  migrations: names.map((name) => ({ path: `supabase/migrations/${name}` })),
});

test("no planned migration requires an explicit up-to-date result", () => {
  assert.deepEqual(
    verifyMigrationDryRun(plan([]), "Remote database is up to date.\n"),
    { result: "PASS", migrations: [] },
  );
  assert.throws(() => verifyMigrationDryRun(plan([]), "Finished supabase db push.\n"));
});

test("the exact planned forward migration is accepted", () => {
  assert.deepEqual(
    verifyMigrationDryRun(
      plan([migration]),
      `Would push these migrations:\n • ${migration}\nFinished supabase db push.\n`,
    ),
    { result: "PASS", migrations: [migration] },
  );
});

test("missing, extra, duplicate, malformed and contradictory scopes fail closed", () => {
  const pending = (lines) => `Would push these migrations:\n${lines.join("\n")}\n`;
  assert.throws(() => verifyMigrationDryRun(plan([migration]), pending([])));
  assert.throws(() =>
    verifyMigrationDryRun(plan([]), pending([` • ${migration}`])),
  );
  assert.throws(() =>
    verifyMigrationDryRun(
      plan([migration]),
      pending([` • ${migration}`, ` • ${migration}`]),
    ),
  );
  assert.throws(() =>
    verifyMigrationDryRun(plan([migration]), pending([" • ../../escape.sql"])),
  );
  assert.throws(() =>
    verifyMigrationDryRun(
      plan([migration]),
      `Remote database is up to date.\n${pending([` • ${migration}`])}`,
    ),
  );
});
