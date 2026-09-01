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

test("Decision source changed -> deploy", () => { const f=fixture(); write(f.repo,"supabase/functions/decision-v13/index.ts",`import { value } from "../../../packages/shared/runtime.mjs";\nconsole.log(value + 1);\n`); assert.deepEqual(plan(f,commit(f.repo)).deployFunctions,["decision-v13"]); });
test("Decision transitive source changed -> deploy", () => { const f=fixture(); write(f.repo,"packages/shared/runtime.mjs",`export const value = 2;\n`); assert.deepEqual(plan(f,commit(f.repo)).deployFunctions,["decision-v13"]); });
test("Decision verify_jwt changed -> deploy", () => { const f=fixture(); const path=join(f.repo,"supabase/config.toml"); const source=execFileSync("sed",["-n","1,99p",path],{encoding:"utf8"}).replace("verify_jwt = true","verify_jwt = false"); writeFileSync(path,source); assert.deepEqual(plan(f,commit(f.repo)).deployFunctions,["decision-v13"]); });
test("Unrelated declared Edge Function changed -> only affected scope", () => { const f=fixture(); write(f.repo,"supabase/functions/other/index.ts",`console.log("other-v2");\n`); assert.deepEqual(plan(f,commit(f.repo)).deployFunctions,["other"]); });
test("New Forward Migration -> apply", () => { const f=fixture(); write(f.repo,"supabase/migrations/20260902000000_forward.sql","select 1;\n"); const result=plan(f,commit(f.repo)); assert.equal(result.migrations.length,1); assert.deepEqual(result.deployFunctions,[]); });
test("Identity-only -> no Decision deploy", () => { const f=fixture(); write(f.repo,"docs/identity.json",`{"version":2}\n`); const result=plan(f,commit(f.repo)); assert.equal(result.runtimeDeploymentRequired,false); });
test("Evidence/docs-only -> no runtime deploy", () => { const f=fixture(); write(f.repo,"docs/evidence.md","evidence\n"); const result=plan(f,commit(f.repo)); assert.equal(result.runtimeDeploymentRequired,false); });
test("Unknown dependency state -> fail closed", () => { const f=fixture(); write(f.repo,"supabase/functions/decision-v13/index.ts",`const target = "./unknown.ts";\nawait import(target);\n`); const head=commit(f.repo); assert.throws(()=>plan(f,head),/non_literal_dynamic_dependency/); });
test("Changed undeclared Edge source -> fail closed", () => { const f=fixture(); write(f.repo,"supabase/functions/undeclared/index.ts",`console.log("unsafe");\n`); const head=commit(f.repo); assert.throws(()=>plan(f,head),/no_declared_deployment_scope/); });
test("Published migration mutation -> fail closed", () => { const f=fixture(); write(f.repo,"supabase/migrations/20260901000000_existing.sql","select 1;\n"); const withMigration=commit(f.repo,"migration"); write(f.repo,"supabase/migrations/20260901000000_existing.sql","select 2;\n"); const head=commit(f.repo,"mutate"); assert.throws(()=>buildProductionPlan({repo:f.repo,baseSha:withMigration,headSha:head}),/published_migration_is_not_immutable/); });
