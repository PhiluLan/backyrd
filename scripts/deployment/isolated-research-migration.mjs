// A narrowly bounded first isolated release. Other release modes remain unchanged.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const REGIONAL_DECISION_MIGRATION = Object.freeze({path:"supabase/migrations/20261031090327_decision_regional_catalog_v1.sql",sha256:"403ddba7836468e26cea5b09a6f63cbb248a59150d616150ff1d2cd21c343d98"});
export function regionalDecisionAppliedReceipt(state,read,isAncestor) {
  return exactResearchReceipt(state,read,isAncestor,REGIONAL_DECISION_MIGRATION,"regionalDecisionRelease");
}
/** Reuse the isolated SQL workspace for this exact SQL plus two authenticated runtimes. */
export function scopeRegionalDecisionMigrations({pending,scope,baseSha,deployFunctions,authDeploy,appliedRegionalDecision}) {
  if (scope?.contractVersion !== "backyrd.regional-decision-delivery-scope@1.0"
    || scope.executionAuthorized !== false || scope.baseSha !== baseSha
    || !equal(scope.migrations,[REGIONAL_DECISION_MIGRATION])
    || !equal(scope.deferredMigrations,DEFERRED_BOOKING_MIGRATIONS)
    || !equal(scope.functions,["decision-v13","decision-admin-diagnostic"])
    || !Number.isSafeInteger(scope.backupRunId) || scope.backupRunId < 1
    || new Set(deployFunctions).size !== deployFunctions.length
    || deployFunctions.some(slug=>!scope.functions.includes(slug)) || authDeploy)
    throw new Error("regional_decision_scope_invalid");
  const selected=appliedRegionalDecision ? [] : [REGIONAL_DECISION_MIGRATION];
  if (!equal(canonicalRows(pending),canonicalRows([...DEFERRED_BOOKING_MIGRATIONS,...selected])))
    throw new Error("regional_decision_pending_scope_changed");
  return {pendingMigrations:selected,deferredMigrations:DEFERRED_BOOKING_MIGRATIONS,isolatedResearchScope:scope};
}
export const AREA_RESERVATION_MIGRATION = Object.freeze({path:"supabase/migrations/20261024171707_scoped_area_reservation_rules_v1.sql",sha256:"b8f539a7f1335754f1c8fac8810218600a2b1d37f4f2d19bda2b087dafad2ebb"});
export const ADMIN_CATEGORY_MIGRATION = Object.freeze({path:"supabase/migrations/20261028200651_admin_spots_primary_category_v1.sql",sha256:"eef85179eaf31c5c06d8bc1b90f88459c12f5d5c69c62ccbbcdac1198207b25d"});
export const RESEARCH_MIGRATION = Object.freeze({"path": "supabase/migrations/20261024113000_world_research_current_profile_import_v3.sql", "sha256": "7be9ad6a4ee3c824fe8017cd5a29d7250833f9a44c8a24fef32e287f5cc3ce8b"});
export const RESEARCH_SAFETY_MIGRATION = Object.freeze({path:"supabase/migrations/20261026215735_world_research_text_safety_word_boundary_v1.sql",sha256:"0b2060539b9ce2ef3dc7455870579b5c8df43fe64f56ce3b046aee87e2998fe3"});
export const RESEARCH_RHASSOUL_MIGRATION = Object.freeze({path:"supabase/migrations/20261027112800_world_research_rhassoul_safety_v1.sql",sha256:"09504c02d45df9a4de803714479bcb99c3f03d582e2570d3c9cef0630ac38d0d"});
export const RESEARCH_SAFETY_DEFERRED_FUNCTION_CHANGES = Object.freeze([
  Object.freeze({slug:"decision-v13",previousSourceSetHash:"0317d2a74fac0849f7ec52d7b14c55af07aceb8b841f71eba44394e6c7ea8961",sourceSetHash:"8cb7795a2e0e357640290a699fa144dd0d983f12acea65205df01358c879548e"}),
]);
export const VOLTA_MIGRATIONS = Object.freeze([
  { path: "supabase/migrations/20261024160151_correct_volta_venue_coordinates.sql", sha256: "dffad38aaf3155538b0f1a8a6c258ef7f0dfe12d747ed9cc36022bae1973241b" },
  { path: "supabase/migrations/20261024162056_align_volta_spots_to_verified_location.sql", sha256: "686acecb3ef27cfdb4407000cfdc8a31711df19f2913cd475556ecbf82fd35af" },
]);
export const DEFERRED_BOOKING_MIGRATIONS = Object.freeze([{"path": "supabase/migrations/20261020184245_booking_restaurant_service_lifecycle_v1.sql", "sha256": "281f102648d780ec6e4ca4fad8a22929747767f656a517288430ec1cfc3388b9"}, {"path": "supabase/migrations/20261020185443_booking_reservation_amendments_v1.sql", "sha256": "23ec32e5ccac1f445ca143dd93e34b631bc939eacffb91538e37793b5c1300bc"}, {"path": "supabase/migrations/20261020192107_booking_restaurant_walk_ins_v1.sql", "sha256": "69d98e0afa071cc4c531f3743d5fb79084b84cd7d8e324dfc3968b74cdc71bb2"}, {"path": "supabase/migrations/20261020195933_booking_restaurant_table_layout_v1.sql", "sha256": "7451adfe549f187623ab51be089d3ddc7554764b125903454d564acac4a1505d"}]);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export const SAFETY_DEFERRED_MIGRATIONS = Object.freeze([...DEFERRED_BOOKING_MIGRATIONS,
  AREA_RESERVATION_MIGRATION,
]);
const canonicalRows = rows => rows.map(({path,sha256})=>({path,sha256})).sort((a,b)=>a.path.localeCompare(b.path));
function exactResearchReceipt(state,read,isAncestor,target,key) {
  const receipt=state?.supabase?.[key];
  if (!receipt) return null;
  if (receipt.status !== "APPLIED_AND_VERIFIED" || !equal(receipt.migration,target)
    || !/^[0-9a-f]{40}$/.test(receipt.sourceSha ?? "") || !isAncestor(receipt.sourceSha)
    || !Number.isSafeInteger(receipt.deploymentRunId) || receipt.deploymentRunId < 1
    || !/^[0-9a-f]{64}$/.test(receipt.manifestHash ?? "")
    || createHash("sha256").update(read(target.path)).digest("hex") !== target.sha256)
    throw new Error("isolated_research_receipt_invalid");
  return receipt;
}
export function researchAppliedReceipt(state,read,isAncestor,safety=false) {
  return exactResearchReceipt(state,read,isAncestor,safety?RESEARCH_SAFETY_MIGRATION:RESEARCH_MIGRATION,
    safety?"isolatedResearchSafetyRelease":"isolatedResearchRelease");
}
export function researchRhassoulAppliedReceipt(state,read,isAncestor) {
  return exactResearchReceipt(state,read,isAncestor,RESEARCH_RHASSOUL_MIGRATION,"isolatedResearchRhassoulRelease");
}
export function adminCategoryAppliedReceipt(state,read,isAncestor) {
  return exactResearchReceipt(state,read,isAncestor,ADMIN_CATEGORY_MIGRATION,"isolatedAdminCategoryRelease");
}
export function areaReservationAppliedReceipt(state,read,isAncestor) {
  return exactResearchReceipt(state,read,isAncestor,AREA_RESERVATION_MIGRATION,"isolatedAreaReservationRelease");
}
export function scopeResearchMigrations({pending,scope,baseSha,deployFunctions,authDeploy,applied,appliedSafety,appliedRhassoul,appliedAdminCategory,appliedAreaReservation}) {
  if (!scope) return {pendingMigrations:pending, deferredMigrations:[], isolatedResearchScope:null};
  const target = equal(scope.migrations,[AREA_RESERVATION_MIGRATION]) ? AREA_RESERVATION_MIGRATION
    : equal(scope.migrations,[ADMIN_CATEGORY_MIGRATION]) ? ADMIN_CATEGORY_MIGRATION
    : equal(scope.migrations,[RESEARCH_RHASSOUL_MIGRATION]) ? RESEARCH_RHASSOUL_MIGRATION
    : equal(scope.migrations,[RESEARCH_SAFETY_MIGRATION]) ? RESEARCH_SAFETY_MIGRATION : RESEARCH_MIGRATION;
  const safety = target !== RESEARCH_MIGRATION;
  const deferred = target === AREA_RESERVATION_MIGRATION ? DEFERRED_BOOKING_MIGRATIONS : safety ? SAFETY_DEFERRED_MIGRATIONS : DEFERRED_BOOKING_MIGRATIONS;
  if (scope.deferredFunctionChanges?.length && (!safety
    || !equal(scope.deferredFunctionChanges,RESEARCH_SAFETY_DEFERRED_FUNCTION_CHANGES))) throw new Error("isolated_research_deferred_function_binding_invalid");
  if (safety && (!applied || (target === RESEARCH_RHASSOUL_MIGRATION && !appliedSafety))) throw new Error("isolated_research_prerequisite_missing");
  if (target === AREA_RESERVATION_MIGRATION && (!appliedSafety || !appliedRhassoul || !appliedAdminCategory)) throw new Error("isolated_research_prerequisite_missing");
  if (target === ADMIN_CATEGORY_MIGRATION && (!appliedSafety || !appliedRhassoul)) throw new Error("isolated_research_prerequisite_missing");
  if (deployFunctions.length) throw new Error(`isolated_research_function_deployment_not_authorized:${deployFunctions.join(",")}`);
  if (authDeploy) throw new Error("isolated_research_auth_deployment_not_authorized");
  if (scope.contractVersion !== "backyrd.isolated-research-migration-scope@1.0"
    || scope.executionAuthorized !== false || scope.baseSha !== baseSha
    || !equal(scope.migrations,[target])
    || !equal(scope.deferredMigrations,deferred)
    || !Number.isSafeInteger(scope.backupRunId) || scope.backupRunId < 1
    || deployFunctions.length || authDeploy)
    throw new Error("isolated_research_scope_invalid");
  const selected = (target === AREA_RESERVATION_MIGRATION ? appliedAreaReservation : target === ADMIN_CATEGORY_MIGRATION ? appliedAdminCategory : target === RESEARCH_RHASSOUL_MIGRATION ? appliedRhassoul : safety ? appliedSafety : applied) ? [] : [target];
  if (!equal(canonicalRows(pending),canonicalRows([...deferred,...selected])))
    throw new Error("isolated_research_pending_scope_changed");
  return {pendingMigrations:selected, deferredMigrations:deferred,
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
  const scoped=plan.isolatedResearchScope?.contractVersion === "backyrd.regional-decision-delivery-scope@1.0"
    ? scopeRegionalDecisionMigrations({pending:[...plan.pendingMigrations,...(plan.deferredMigrations??[])],scope:plan.isolatedResearchScope,
      baseSha:plan.baseSha,deployFunctions:plan.deployFunctions,authDeploy:plan.authConfig?.deploy===true,appliedRegionalDecision:plan.appliedRegionalDecision})
    : plan.isolatedVoltaScope
    ? scopeVoltaMigrations({pending:[...plan.pendingMigrations,...(plan.deferredMigrations??[])],scope:plan.isolatedVoltaScope,
      baseSha:plan.baseSha,deployFunctions:plan.deployFunctions,authDeploy:plan.authConfig?.deploy===true,
      appliedResearch:plan.appliedResearch,appliedVolta:plan.appliedVolta})
    : scopeResearchMigrations({pending:[...plan.pendingMigrations,...(plan.deferredMigrations??[])],scope:plan.isolatedResearchScope,
      baseSha:plan.baseSha,deployFunctions:plan.deployFunctions,authDeploy:plan.authConfig?.deploy===true,applied:plan.appliedResearch,appliedSafety:plan.appliedResearchSafety,appliedRhassoul:plan.appliedResearchRhassoul,appliedAdminCategory:plan.appliedAdminCategory,appliedAreaReservation:plan.appliedAreaReservation});
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
