import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildProductionPlan } from "./supabase-production-plan.mjs";

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
const write = (repo, path, contents) => { mkdirSync(join(repo, path, ".."), { recursive: true }); writeFileSync(join(repo, path), contents); };
const fixture = () => {
  const repo = mkdtempSync(join(tmpdir(), "backyrd-deploy-plan-"));
  git(repo, ["init", "-q"]); git(repo, ["config", "user.email", "ci@backyrd.invalid"]); git(repo, ["config", "user.name", "Backyrd CI"]);
  write(repo, "supabase/config.toml", `[functions.decision-v13]\nenabled = true\nverify_jwt = true\nentrypoint = "./functions/decision-v13/index.ts"\n\n[functions.other]\nenabled = true\nverify_jwt = false\nentrypoint = "./functions/other/index.ts"\n`);
  write(repo, "supabase/functions/decision-v13/index.ts", `import { value } from "../../../packages/shared/runtime.mjs";\nconsole.log(value);\n`);
  write(repo, "supabase/functions/other/index.ts", `console.log("other");\n`);
  write(repo, "packages/shared/runtime.mjs", `export const value = 1;\n`);
  write(repo, "docs/identity.json", `{"version":1}\n`);
  git(repo, ["add", "."]); git(repo, ["commit", "-qm", "base"]);
  return { repo, base: git(repo, ["rev-parse", "HEAD"]) };
};
const commit = (repo, message = "change") => { git(repo, ["add", "."]); git(repo, ["commit", "-qm", message]); return git(repo, ["rev-parse", "HEAD"]); };
const plan = ({ repo, base }, head) => buildProductionPlan({ repo, baseSha: base, headSha: head });
const authConfig = (password_min_length = 8) => `${JSON.stringify({
  version: "backyrd-production-auth-config-v1",
  projectRef: "hjgcrrzfjchzqoegcywn",
  config: {
    site_url: "https://www.backyrd.ch",
    uri_allow_list: "https://www.backyrd.ch/auth/callback**,backyrd://auth/**",
    password_min_length,
    mailer_subjects_confirmation: "Confirm",
    mailer_subjects_recovery: "Recover",
    mailer_templates_confirmation_content: "Confirmation template",
    mailer_templates_recovery_content: "Recovery template",
  },
}, null, 2)}\n`;

test("Decision source changed -> deploy", () => { const f=fixture(); write(f.repo,"supabase/functions/decision-v13/index.ts",`import { value } from "../../../packages/shared/runtime.mjs";\nconsole.log(value + 1);\n`); assert.deepEqual(plan(f,commit(f.repo)).deployFunctions,["decision-v13"]); });
test("Decision transitive source changed -> deploy", () => { const f=fixture(); write(f.repo,"packages/shared/runtime.mjs",`export const value = 2;\n`); assert.deepEqual(plan(f,commit(f.repo)).deployFunctions,["decision-v13"]); });
test("Decision verify_jwt changed -> deploy", () => { const f=fixture(); const path=join(f.repo,"supabase/config.toml"); const source=execFileSync("sed",["-n","1,99p",path],{encoding:"utf8"}).replace("verify_jwt = true","verify_jwt = false"); writeFileSync(path,source); assert.deepEqual(plan(f,commit(f.repo)).deployFunctions,["decision-v13"]); });
test("Unrelated declared Edge Function changed -> only affected scope", () => { const f=fixture(); write(f.repo,"supabase/functions/other/index.ts",`console.log("other-v2");\n`); assert.deepEqual(plan(f,commit(f.repo)).deployFunctions,["other"]); });
test("New Forward Migration -> apply", () => { const f=fixture(); write(f.repo,"supabase/migrations/20260902000000_forward.sql","select 1;\n"); const result=plan(f,commit(f.repo)); assert.equal(result.migrations.length,1); assert.deepEqual(result.deployFunctions,[]); });
test("Identity-only -> no Decision deploy", () => { const f=fixture(); write(f.repo,"docs/identity.json",`{"version":2}\n`); const result=plan(f,commit(f.repo)); assert.equal(result.runtimeDeploymentRequired,false); });
test("Evidence/docs-only -> no runtime deploy", () => { const f=fixture(); write(f.repo,"docs/evidence.md","evidence\n"); const result=plan(f,commit(f.repo)); assert.equal(result.runtimeDeploymentRequired,false); });
test("Production Auth config -> bounded config deploy only", () => { const f=fixture(); write(f.repo,"supabase/production/auth-config.json",authConfig()); const result=plan(f,commit(f.repo)); assert.equal(result.authConfig.deploy,true); assert.equal(result.runtimeDeploymentRequired,true); assert.deepEqual(result.deployFunctions,[]); });
test("Unchanged Production Auth config -> no runtime deploy", () => { const f=fixture(); write(f.repo,"supabase/production/auth-config.json",authConfig()); const configured=commit(f.repo); write(f.repo,"docs/evidence.md","evidence\n"); const head=commit(f.repo); const result=buildProductionPlan({repo:f.repo,baseSha:configured,headSha:head}); assert.equal(result.authConfig.deploy,false); assert.equal(result.runtimeDeploymentRequired,false); });
test("Weak Production password policy -> fail closed", () => { const f=fixture(); write(f.repo,"supabase/production/auth-config.json",authConfig(6)); const head=commit(f.repo); assert.throws(()=>plan(f,head),/password_policy_invalid/); });
test("Unknown Production config scope -> fail closed", () => { const f=fixture(); write(f.repo,"supabase/production/unknown.json","{}\n"); const head=commit(f.repo); assert.throws(()=>plan(f,head),/unknown_production_config_scope/); });
test("Unknown dependency state -> fail closed", () => { const f=fixture(); write(f.repo,"supabase/functions/decision-v13/index.ts",`const target = "./unknown.ts";\nawait import(target);\n`); const head=commit(f.repo); assert.throws(()=>plan(f,head),/non_literal_dynamic_dependency/); });
test("Changed undeclared Edge source -> fail closed", () => { const f=fixture(); write(f.repo,"supabase/functions/undeclared/index.ts",`console.log("unsafe");\n`); const head=commit(f.repo); assert.throws(()=>plan(f,head),/no_declared_deployment_scope/); });
test("Published migration mutation -> fail closed", () => { const f=fixture(); write(f.repo,"supabase/migrations/20260901000000_existing.sql","select 1;\n"); const withMigration=commit(f.repo,"migration"); write(f.repo,"supabase/migrations/20260901000000_existing.sql","select 2;\n"); const head=commit(f.repo,"mutate"); assert.throws(()=>buildProductionPlan({repo:f.repo,baseSha:withMigration,headSha:head}),/published_migration_is_not_immutable/); });
test("Audited failed canonical migration -> recover exact unchanged scope once", () => { const f=fixture(); const migration="supabase/migrations/20260901191833_gate5_forward.sql"; const source="select 1;\n"; write(f.repo,migration,source); const failedMain=commit(f.repo,"failed canonical main"); const digest=execFileSync("sha256sum",[join(f.repo,migration)],{encoding:"utf8"}).split(/\s+/)[0]; write(f.repo,"supabase/production/pending-migration-recovery.json",`${JSON.stringify({version:"backyrd-pending-migration-recovery-v1",projectRef:"hjgcrrzfjchzqoegcywn",failedCanonicalMainSha:failedMain,failedDeploymentRunId:33552000155,failureStage:"BEFORE_MIGRATION_APPLY",migrations:[{path:migration,sha256:digest}]},null,2)}\n`); const head=commit(f.repo,"recovery"); const result=buildProductionPlan({repo:f.repo,baseSha:failedMain,headSha:head}); assert.deepEqual(result.migrations,[{path:migration,sha256:digest}]); assert.equal(result.migrationRecovery.failedCanonicalMainSha,failedMain); assert.equal(result.runtimeDeploymentRequired,true); });
test("Migration recovery with a different base or bytes fails closed", () => { const f=fixture(); const migration="supabase/migrations/20260901191833_gate5_forward.sql"; write(f.repo,migration,"select 1;\n"); const failedMain=commit(f.repo,"failed canonical main"); const document={version:"backyrd-pending-migration-recovery-v1",projectRef:"hjgcrrzfjchzqoegcywn",failedCanonicalMainSha:"0".repeat(40),failedDeploymentRunId:33552000155,failureStage:"BEFORE_MIGRATION_APPLY",migrations:[{path:migration,sha256:"0".repeat(64)}]}; write(f.repo,"supabase/production/pending-migration-recovery.json",`${JSON.stringify(document,null,2)}\n`); const head=commit(f.repo,"invalid recovery"); assert.throws(()=>buildProductionPlan({repo:f.repo,baseSha:failedMain,headSha:head}),/migration_recovery_base_mismatch/); });
