import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveInheritedPendingMigrations,
  verifyMigrationDryRun,
} from "./verify-supabase-migration-dry-run.mjs";

const migration = "20260901191833_gate5_harden_user_achievements_privacy.sql";
const plan = (names) => ({
  migrations: names.map((name) => ({ path: `supabase/migrations/${name}` })),
});

test("no planned migration requires an explicit up-to-date result", () => {
  assert.deepEqual(
    verifyMigrationDryRun(plan([]), "Remote database is up to date.\n"),
    { result: "PASS", migrations: [], inheritedPendingMigrations: [], releaseState: "VERIFIED" },
  );
  assert.throws(() => verifyMigrationDryRun(plan([]), "Finished supabase db push.\n"));
});

test("the exact planned forward migration is accepted", () => {
  assert.deepEqual(
    verifyMigrationDryRun(
      plan([migration]),
      `Would push these migrations:\n • ${migration}\nFinished supabase db push.\n`,
    ),
    { result: "PASS", migrations: [migration], inheritedPendingMigrations: [], releaseState: "VERIFIED" },
  );
});

test("an exactly attested pre-applied plan requires Production to be up to date", () => {
  const preappliedPlan = {
    migrations: [{ path: `supabase/migrations/${migration}` }],
    pendingMigrations: [],
  };
  assert.deepEqual(
    verifyMigrationDryRun(preappliedPlan, "Remote database is up to date.\n"),
    { result: "PASS", migrations: [], inheritedPendingMigrations: [], releaseState: "VERIFIED" },
  );
  assert.throws(() => verifyMigrationDryRun(
    preappliedPlan,
    `Would push these migrations:\n • ${migration}\n`,
  ));
});

test("an inherited pending migration from the exact unchanged PR base is audit-only", () => {
  const baseSha = "1".repeat(40);
  const headSha = "2".repeat(40);
  const candidatePlan = {
    baseSha,
    canonicalMainSha: headSha,
    pendingMigrations: [],
    runtimeDeploymentRequired: false,
  };
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    if (args[0] === "rev-parse") return `${headSha}\n`;
    return "";
  };
  const output = `Would push these migrations:\n • ${migration}\n`;
  const inherited = resolveInheritedPendingMigrations(candidatePlan, output, baseSha, { runGit });
  assert.deepEqual(inherited, [migration]);
  assert.deepEqual(
    verifyMigrationDryRun(candidatePlan, output, { inheritedMigrations: inherited }),
    {
      result: "PASS",
      migrations: [],
      inheritedPendingMigrations: [migration],
      releaseState: "AWAITING_EXPLICIT_RELEASE",
    },
  );
  assert.deepEqual(calls, [
    ["rev-parse", "HEAD"],
    ["cat-file", "-e", `${baseSha}:supabase/migrations/${migration}`],
    ["diff", "--quiet", baseSha, headSha, "--", `supabase/migrations/${migration}`],
  ]);
});

test("inherited pending scope fails closed for a false base, foreign migration, candidate drift or non-empty runtime scope", () => {
  const baseSha = "1".repeat(40);
  const headSha = "2".repeat(40);
  const candidatePlan = {
    baseSha,
    canonicalMainSha: headSha,
    pendingMigrations: [],
    runtimeDeploymentRequired: false,
  };
  const output = `Would push these migrations:\n • ${migration}\n`;
  assert.throws(() => resolveInheritedPendingMigrations(candidatePlan, output, "3".repeat(40)));
  assert.throws(() => resolveInheritedPendingMigrations(candidatePlan, output, baseSha, {
    runGit: (args) => {
      if (args[0] === "rev-parse") return `${headSha}\n`;
      if (args[0] === "cat-file") throw new Error("missing");
      return "";
    },
  }), /inherited_migration_missing_from_base/);
  assert.throws(() => resolveInheritedPendingMigrations(candidatePlan, output, baseSha, {
    runGit: (args) => {
      if (args[0] === "rev-parse") return `${headSha}\n`;
      if (args[0] === "diff") throw new Error("changed");
      return "";
    },
  }), /inherited_migration_changed_by_candidate/);
  assert.throws(() => resolveInheritedPendingMigrations(
    { ...candidatePlan, runtimeDeploymentRequired: true },
    output,
    baseSha,
    { runGit: () => `${headSha}\n` },
  ), /candidate_runtime_scope_not_empty/);
  assert.throws(() => verifyMigrationDryRun(candidatePlan, output), /dry_run_did_not_confirm_up_to_date/);
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
