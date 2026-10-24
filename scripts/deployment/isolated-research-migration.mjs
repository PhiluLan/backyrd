// A narrowly bounded first isolated release. Other release modes remain unchanged.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const RESEARCH_MIGRATION = Object.freeze({"path": "supabase/migrations/20261024113000_world_research_current_profile_import_v3.sql", "sha256": "7be9ad6a4ee3c824fe8017cd5a29d7250833f9a44c8a24fef32e287f5cc3ce8b"});
export const VOLTA_MIGRATIONS = Object.freeze([
  { path: "supabase/migrations/20261024160151_correct_volta_venue_coordinates.sql", sha256: "dffad38aaf3155538b0f1a8a6c258ef7f0dfe12d747ed9cc36022bae1973241b" },
  { path: "supabase/migrations/20261024162056_align_volta_spots_to_verified_location.sql", sha256: "686acecb3ef27cfdb4407000cfdc8a31711df19f2913cd475556ecbf82fd35af" },
]);
export const DEFERRED_BOOKING_MIGRATIONS = Object.freeze([{"path": "supabase/migrations/20261020184245_booking_restaurant_service_lifecycle_v1.sql", "sha256": "281f102648d780ec6e4ca4fad8a22929747767f656a517288430ec1cfc3388b9"}, {"path": "supabase/migrations/20261020185443_booking_reservation_amendments_v1.sql", "sha256": "23ec32e5ccac1f445ca143dd93e34b631bc939eacffb91538e37793b5c1300bc"}, {"path": "supabase/migrations/20261020192107_booking_restaurant_walk_ins_v1.sql", "sha256": "69d98e0afa071cc4c531f3743d5fb79084b84cd7d8e324dfc3968b74cdc71bb2"}, {"path": "supabase/migrations/20261020195933_booking_restaurant_table_layout_v1.sql", "sha256": "7451adfe549f187623ab51be089d3ddc7554764b125903454d564acac4a1505d"}]);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const canonicalRows = rows => rows.map(({path,sha256})=>({path,sha256})).sort((a,b)=>a.path.localeCompare(b.path));
export function researchAppliedReceipt(state, read, isAncestor) {
  const receipt = state?.supabase?.isolatedResearchRelease;
  if (!receipt) return null;
  if (receipt.status !== "APPLIED_AND_VERIFIED" || !equal(receipt.migration,RESEARCH_MIGRATION)
    || !/^[0-9a-f]{40}$/.test(receipt.sourceSha ?? "") || !isAncestor(receipt.sourceSha)
    || !Number.isSafeInteger(receipt.deploymentRunId) || receipt.deploymentRunId < 1
    || !/^[0-9a-f]{64}$/.test(receipt.manifestHash ?? "")
    || createHash("sha256").update(read(RESEARCH_MIGRATION.path)).digest("hex") !== RESEARCH_MIGRATION.sha256)
    throw new Error("isolated_research_receipt_invalid");
  return receipt;
}
export function scopeResearchMigrations({pending,scope,baseSha,deployFunctions,authDeploy,applied}) {
  if (!scope) return {pendingMigrations:pending, deferredMigrations:[], isolatedResearchScope:null};
  if (scope.contractVersion !== "backyrd.isolated-research-migration-scope@1.0"
    || scope.executionAuthorized !== false || scope.baseSha !== baseSha
    || !equal(scope.migrations,[RESEARCH_MIGRATION])
    || !equal(scope.deferredMigrations,DEFERRED_BOOKING_MIGRATIONS)
    || !Number.isSafeInteger(scope.backupRunId) || scope.backupRunId < 1
    || deployFunctions.length || authDeploy)
    throw new Error("isolated_research_scope_invalid");
  const selected = applied ? [] : [RESEARCH_MIGRATION];
  if (!equal(canonicalRows(pending),canonicalRows([...DEFERRED_BOOKING_MIGRATIONS,...selected])))
    throw new Error("isolated_research_pending_scope_changed");
  return {pendingMigrations:selected, deferredMigrations:DEFERRED_BOOKING_MIGRATIONS,
    isolatedResearchScope:scope};
}
export function scopeVoltaMigrations({pending,scope,baseSha,deployFunctions,authDeploy,appliedResearch,appliedVolta}) {
  if (scope?.contractVersion !== "backyrd.isolated-volta-migration-scope@1.0"
    || scope.executionAuthorized !== false || scope.baseSha !== baseSha
    || !equal(scope.migrations,VOLTA_MIGRATIONS)
    || !equal(scope.deferredMigrations,DEFERRED_BOOKING_MIGRATIONS)
    || !Number.isSafeInteger(scope.backupRunId) || scope.backupRunId < 1
    || !appliedResearch || deployFunctions.length || authDeploy)
    throw new Error("isolated_volta_scope_invalid");
  const selected = appliedVolta ? [] : VOLTA_MIGRATIONS;
  if (!equal(canonicalRows(pending),canonicalRows([...DEFERRED_BOOKING_MIGRATIONS,...selected])))
    throw new Error("isolated_volta_pending_scope_changed");
  return {pendingMigrations:selected,deferredMigrations:DEFERRED_BOOKING_MIGRATIONS,isolatedVoltaScope:scope};
}
export function voltaAppliedReceipt(state, read, isAncestor) {
  const receipt=state?.supabase?.isolatedVoltaRelease;
  if (!receipt) return null;
  if (receipt.status!=="APPLIED_AND_VERIFIED"
    || !equal(receipt.migrations,VOLTA_MIGRATIONS)
    || !/^[0-9a-f]{40}$/.test(receipt.sourceSha??"") || !isAncestor(receipt.sourceSha)
    || !Number.isSafeInteger(receipt.deploymentRunId) || receipt.deploymentRunId<1
    || !/^[0-9a-f]{64}$/.test(receipt.manifestHash??"")
    || VOLTA_MIGRATIONS.some((migration)=>createHash("sha256").update(read(migration.path)).digest("hex")!==migration.sha256))
    throw new Error("isolated_volta_receipt_invalid");
  return receipt;
}
/** Copy config + exact tracked migrations; remove only the four explicitly deferred files. */
export function prepareResearchMigrationWorkspace(plan,root,output) {
  const scoped=plan.isolatedVoltaScope
    ? scopeVoltaMigrations({pending:[...plan.pendingMigrations,...(plan.deferredMigrations??[])],scope:plan.isolatedVoltaScope,
      baseSha:plan.baseSha,deployFunctions:plan.deployFunctions,authDeploy:plan.authConfig?.deploy===true,
      appliedResearch:plan.appliedResearch,appliedVolta:plan.appliedVolta})
    : scopeResearchMigrations({pending:[...plan.pendingMigrations,...(plan.deferredMigrations??[])],scope:plan.isolatedResearchScope,
      baseSha:plan.baseSha,deployFunctions:plan.deployFunctions,authDeploy:plan.authConfig?.deploy===true,applied:plan.appliedResearch});
  if (!(scoped.isolatedResearchScope||scoped.isolatedVoltaScope) || !equal(plan.deferredMigrations,scoped.deferredMigrations)
    || !equal(plan.pendingMigrations,scoped.pendingMigrations)) throw new Error("isolated_research_workspace_plan_invalid");
  const digest=path=>createHash("sha256").update(readFileSync(resolve(root,path))).digest("hex");
  for(const entry of [...plan.pendingMigrations,...plan.deferredMigrations])
    if(digest(entry.path)!==entry.sha256)throw new Error("isolated_research_workspace_bytes_changed");
  mkdirSync(resolve(output,"supabase"),{recursive:true});
  cpSync(resolve(root,"supabase/config.toml"),resolve(output,"supabase/config.toml"));
  cpSync(resolve(root,"supabase/migrations"),resolve(output,"supabase/migrations"),{recursive:true,errorOnExist:true,force:false});
  for(const entry of scoped.deferredMigrations) rmSync(resolve(output,"supabase/migrations",basename(entry.path)));
  writeFileSync(resolve(output,"scope.json"),JSON.stringify({pending:plan.pendingMigrations,deferred:plan.deferredMigrations}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [planPath,output]=process.argv.slice(2);
  if(!planPath||!output)throw new Error("plan_and_output_required");
  prepareResearchMigrationWorkspace(JSON.parse(readFileSync(planPath,"utf8")),process.cwd(),output);
}
