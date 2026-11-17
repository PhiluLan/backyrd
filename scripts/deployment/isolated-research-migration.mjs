// A narrowly bounded first isolated release. Other release modes remain unchanged.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const BETA_SOCIAL_MIGRATION = Object.freeze({path:"supabase/migrations/20261103182149_beta_social_contact_and_mentions_v1.sql",sha256:"79c28e5de8abe18ad8c2b6f332c1f7555c2627102f1a1e0eecd0a614d0297383"});
export const BETA_SOCIAL_FUNCTIONS = Object.freeze(["generate-data-export","safety-evaluate"]);
export function scopeBetaSocialMigrations({pending,scope,baseSha,deployFunctions,authDeploy,appliedBetaSocial}) {
  if(scope?.contractVersion!=="backyrd.beta-social-delivery-scope@1.0"
    || scope.executionAuthorized!==false || scope.baseSha!==baseSha
    || !equal(scope.migrations,[BETA_SOCIAL_MIGRATION])
    || !equal(scope.deferredMigrations,DEFERRED_BOOKING_MIGRATIONS)
    || !Number.isSafeInteger(scope.backupRunId) || scope.backupRunId<1
    || !equal([...deployFunctions].sort(),appliedBetaSocial ? [] : BETA_SOCIAL_FUNCTIONS)
    || authDeploy)throw new Error("beta_social_scope_invalid");
  const selected=appliedBetaSocial ? [] : [BETA_SOCIAL_MIGRATION];
  if(!equal(canonicalRows(pending),canonicalRows([...selected,...DEFERRED_BOOKING_MIGRATIONS])))
    throw new Error("beta_social_pending_scope_changed");
  return {pendingMigrations:selected,deferredMigrations:DEFERRED_BOOKING_MIGRATIONS,isolatedResearchScope:scope};
}
export function betaSocialAppliedReceipt(state,read,isAncestor) {
  return exactResearchReceipt(state,read,isAncestor,BETA_SOCIAL_MIGRATION,"betaSocialRelease");
}
export const ANALYTICS_PRIVACY_REPAIR_MIGRATION = Object.freeze({path:"supabase/migrations/20261101203100_analytics_privacy_reference_cleanup_v1.sql",sha256:"c4e2dade77e617da3204d4a7833d573d46d2b75fcd32a6806353284d4bb2d7df"});
export const BETA_SECURITY_MIGRATION = Object.freeze({path:"supabase/migrations/20261101183602_beta_security_boundaries_v1.sql",sha256:"60269b6aca93a5fee2091d736978b85dc5ca64670efc7afe52cfb220449bdd3a"});
export const BETA_SECURITY_MIGRATIONS = Object.freeze([BETA_SECURITY_MIGRATION,ANALYTICS_PRIVACY_REPAIR_MIGRATION]);
export function analyticsPrivacyAppliedReceipt(state,read,isAncestor) {
 return exactResearchReceipt(state,read,isAncestor,ANALYTICS_PRIVACY_REPAIR_MIGRATION,"analyticsPrivacyReferenceRelease");
}
export function betaSecurityAppliedReceipt(state,read,isAncestor) {
  return exactResearchReceipt(state,read,isAncestor,BETA_SECURITY_MIGRATION,"betaSecurityRelease");
}
/** Exactly the security/privacy migrations and one password flag; all runtime changes stay deferred. */
export function scopeBetaSecurityMigrations({pending,scope,baseSha,deployFunctions,authConfig,appliedBetaSecurity,appliedAnalyticsPrivacy}) {
  if (scope?.contractVersion !== "backyrd.beta-security-delivery-scope@1.0"
    || scope.executionAuthorized !== false || scope.baseSha !== baseSha
    || !equal(scope.migrations,BETA_SECURITY_MIGRATIONS)
    || !equal(scope.deferredMigrations,DEFERRED_BOOKING_MIGRATIONS)
    || !Number.isSafeInteger(scope.backupRunId) || scope.backupRunId < 1
    || !Number.isSafeInteger(scope.restoreDrill?.runId) || scope.restoreDrill.runId < 1
    || scope.restoreDrill.path !== "delivery/recovery/beta-security-rehearsal-v1.json"
    || !/^[a-f0-9]{64}$/.test(scope.restoreDrill.sha256??"")
    || deployFunctions.length || authConfig?.deploy !== true
    || !equal(authConfig.keys,["password_hibp_enabled"])
    || authConfig.values.password_hibp_enabled !== true
    || !equal(scope.authConfig,{path:authConfig.path,sha256:authConfig.sha256,keys:authConfig.keys}))
    throw new Error("beta_security_scope_invalid");
  const selected=[...(!appliedBetaSecurity?[BETA_SECURITY_MIGRATION]:[]),...(!appliedAnalyticsPrivacy?[ANALYTICS_PRIVACY_REPAIR_MIGRATION]:[])];
  if (!equal(canonicalRows(pending),canonicalRows([...DEFERRED_BOOKING_MIGRATIONS,...selected])))
    throw new Error("beta_security_pending_scope_changed");
  return {pendingMigrations:selected,deferredMigrations:DEFERRED_BOOKING_MIGRATIONS,isolatedResearchScope:scope};
}
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
export const NUKNUK_ACTIVITY_MIGRATION = Object.freeze({
  path: "supabase/migrations/20261116123311_nuknuk_request_activity_v1.sql",
  sha256: "9e6dfd03da110315fb61f2868b85eae7d35351a3c3a495c9fdcca658c2299496",
});
export function hasNuknukActivityRestoreIdentity(receipt) {
  return Number.isSafeInteger(receipt?.runId) && receipt.runId > 0
    && Number.isSafeInteger(receipt.artifactId) && receipt.artifactId > 0
    && /^sha256:[0-9a-f]{64}$/.test(receipt.artifactDigest ?? "");
}
export function verifyNuknukActivityRestore(receipt, bytes) {
  if (!hasNuknukActivityRestoreIdentity(receipt)) throw new Error("nuknuk_activity_restore_receipt_invalid");
  const report = JSON.parse(bytes.toString());
  if (report.version !== "backyrd-backup-restore-drill-v1" || report.status !== "PASS"
    || report.foreignKeysValidated !== true || report.proposedIntegrityRepair
    || report.sourceType !== "VERIFIED_AWS_ARCHIVE" || !/^[0-9a-f]{64}$/.test(report.sourceArchiveSha256 ?? "")
    || !/^[0-9a-f]{40}$/.test(report.sourceMainSha ?? "") || !Number.isFinite(Date.parse(report.sourceCreatedAt))
    || report.productionWrites !== 0 || report.productionCutoverTested !== false
    || ["sourceSchemaAndRowsComparedBeforeAnyRepair", "schemaAndAclMatch", "allCopiedRowsMatch",
      "sequencesMatch", "allMediaBytesMatch", "bucketControlsRestored", "databaseServicesStopped",
      "outboundNetworkDisabled", "independentDatabaseAndMediaTargets", "disposableTargetsRemoved"]
      .some(key => report[key] !== true)) throw new Error("nuknuk_activity_restore_evidence_invalid");
}
const nuknukActivityFunctions = ["decision-admin-diagnostic", "decision-v13"];
export function nuknukActivityAppliedReceipt(state, read, isAncestor) {
  return exactResearchReceipt(state, read, isAncestor, NUKNUK_ACTIVITY_MIGRATION, "nuknukActivityRelease");
}
export function scopeNuknukActivityMigrations({ pending, scope, baseSha, deployFunctions, authDeploy, appliedNuknukActivity }) {
  if (scope?.contractVersion !== "backyrd.nuknuk-activity-delivery-scope@1.0"
    || scope.executionAuthorized !== false || scope.baseSha !== baseSha
    || !equal(scope.migrations, [NUKNUK_ACTIVITY_MIGRATION])
    || !equal(scope.deferredMigrations, DEFERRED_BOOKING_MIGRATIONS)
    || !equal(scope.functions, nuknukActivityFunctions)
    || !equal(deployFunctions, nuknukActivityFunctions)
    || !Number.isSafeInteger(scope.backupRunId) || scope.backupRunId < 1 || authDeploy) {
    throw new Error("nuknuk_activity_delivery_scope_invalid");
  }
  const selected = appliedNuknukActivity ? [] : [NUKNUK_ACTIVITY_MIGRATION];
  if (!equal(canonicalRows(pending), canonicalRows([...DEFERRED_BOOKING_MIGRATIONS, ...selected]))) {
    throw new Error("nuknuk_activity_pending_scope_changed");
  }
  return { pendingMigrations: selected, deferredMigrations: DEFERRED_BOOKING_MIGRATIONS, isolatedResearchScope: scope };
}
export const ANALYTICS_PAGEVIEWS_SCOPE = "backyrd.admin-analytics-pageviews-delivery-scope@1.0";
export const ANALYTICS_PAGEVIEWS_MIGRATION = Object.freeze({
  path: "supabase/migrations/20261116145153_admin_analytics_pageviews_v1.sql",
  sha256: "62414edad70e66d7fc2e4c7c758d500c610fd6ddc449d7c14162cb7a70961d14",
});
export const SPOT_SEARCH_FRESHNESS_SCOPE = "backyrd.spot-search-freshness-delivery-scope@1.0";
export const SPOT_SEARCH_FRESHNESS_MIGRATION = Object.freeze({
  path: "supabase/migrations/20261116175436_publish_spot_search_changes.sql",
  sha256: "f34d770c56ee2c4a7224bbcf0b34f9ba3640b24d7e0e3882b51f759cd97593f3",
});
export const BASEL_PLACE_SOURCES_SCOPE = "backyrd.basel-place-sources-delivery-scope@1.0";
export const BASEL_PLACE_SOURCES_MIGRATION = Object.freeze({
  path: "supabase/migrations/20261117085800_basel_place_sources_v1.sql",
  sha256: "9411fad4efb485d9571e3466b2e22721b9800cb3ab1e3df0c0a06451ef068f30",
});
export const BASEL_OVERTURE_SCOPE = "backyrd.basel-overture-delivery-scope@1.0";
export const BASEL_OVERTURE_MIGRATION = Object.freeze({
  path: "supabase/migrations/20261117095706_basel_overture_place_source_v1.sql",
  sha256: "4d42014c0b7b6846e8da08b72626b633fb7bf1d3d4ebf15cfdb7f1cd6526a6d8",
});
export function baselOvertureAppliedReceipt(state, read, isAncestor) {
  return exactResearchReceipt(state, read, isAncestor, BASEL_OVERTURE_MIGRATION, "baselOvertureRelease");
}
export function baselPlaceSourcesAppliedReceipt(state, read, isAncestor) {
  return exactResearchReceipt(state, read, isAncestor, BASEL_PLACE_SOURCES_MIGRATION, "baselPlaceSourcesRelease");
}
export function spotSearchFreshnessAppliedReceipt(state, read, isAncestor) {
  return exactResearchReceipt(state, read, isAncestor, SPOT_SEARCH_FRESHNESS_MIGRATION, "spotSearchFreshnessRelease");
}
export function analyticsPageviewsAppliedReceipt(state, read, isAncestor) {
  return exactResearchReceipt(state, read, isAncestor, ANALYTICS_PAGEVIEWS_MIGRATION, "analyticsPageviewsRelease");
}
export function scopeAnalyticsPageviewsMigrations({ pending, scope, baseSha, deployFunctions, authDeploy, retiredFunctions, appliedAnalyticsPageviews, appliedSpotSearchFreshness, appliedBaselPlaceSources, appliedBaselOverture }) {
  const targets = {
    [ANALYTICS_PAGEVIEWS_SCOPE]: [ANALYTICS_PAGEVIEWS_MIGRATION, appliedAnalyticsPageviews, true],
    [SPOT_SEARCH_FRESHNESS_SCOPE]: [SPOT_SEARCH_FRESHNESS_MIGRATION, appliedSpotSearchFreshness, appliedAnalyticsPageviews],
    [BASEL_PLACE_SOURCES_SCOPE]: [BASEL_PLACE_SOURCES_MIGRATION, appliedBaselPlaceSources, appliedAnalyticsPageviews && appliedSpotSearchFreshness],
    [BASEL_OVERTURE_SCOPE]: [BASEL_OVERTURE_MIGRATION, appliedBaselOverture, appliedAnalyticsPageviews && appliedSpotSearchFreshness && appliedBaselPlaceSources],
  };
  const entry = Object.hasOwn(targets, scope?.contractVersion) ? targets[scope.contractVersion] : null;
  const [target, applied, prerequisite] = entry ?? [];
  if (!prerequisite || scope.executionAuthorized !== false
    || scope.baseSha !== baseSha || !equal(scope.migrations, [target])
    || !equal(scope.deferredMigrations, DEFERRED_BOOKING_MIGRATIONS)
    || !equal(scope.functions, []) || deployFunctions.length || authDeploy || retiredFunctions.length
    || !Number.isSafeInteger(scope.backupRunId) || scope.backupRunId < 1
    || !hasNuknukActivityRestoreIdentity(scope.restoreDrill)) throw new Error("analytics_pageviews_delivery_scope_invalid");
  const selected = applied ? [] : [target];
  if (!equal(canonicalRows(pending), canonicalRows([...DEFERRED_BOOKING_MIGRATIONS, ...selected]))) {
    throw new Error("analytics_pageviews_pending_scope_changed");
  }
  return { pendingMigrations: selected, deferredMigrations: DEFERRED_BOOKING_MIGRATIONS, isolatedResearchScope: scope };
}
export const SEASONAL_EVENT_MIGRATION = Object.freeze({path:"supabase/migrations/20261101162452_seasonal_event_editions_v1.sql",sha256:"a4e1961dbbca4c283c45b3f1d901cc9df2abd2f41b6b6acd82bd6dd30855380b"});
export function seasonalEventAppliedReceipt(state,read,isAncestor) {
  return exactResearchReceipt(state,read,isAncestor,SEASONAL_EVENT_MIGRATION,"seasonalEventRelease");
}
/** Reuse the isolated SQL workspace for this exact SQL plus two authenticated runtimes. */
export function scopeSeasonalEventMigrations({pending,scope,baseSha,deployFunctions,authDeploy,appliedSeasonalEvent}) {
  if (scope?.contractVersion !== "backyrd.seasonal-event-delivery-scope@1.0"
    || scope.executionAuthorized !== false || scope.baseSha !== baseSha
    || !equal(scope.migrations,[SEASONAL_EVENT_MIGRATION])
    || !equal(scope.deferredMigrations,DEFERRED_BOOKING_MIGRATIONS)
    || !equal(scope.functions,["decision-v13","decision-admin-diagnostic"])
    || !Number.isSafeInteger(scope.backupRunId) || scope.backupRunId < 1
    || new Set(deployFunctions).size !== deployFunctions.length
    || deployFunctions.some(slug=>!scope.functions.includes(slug)) || authDeploy)
    throw new Error("seasonal_event_scope_invalid");
  const selected=appliedSeasonalEvent ? [] : [SEASONAL_EVENT_MIGRATION];
  if (!equal(canonicalRows(pending),canonicalRows([...DEFERRED_BOOKING_MIGRATIONS,...selected])))
    throw new Error("seasonal_event_pending_scope_changed");
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
  const scoped=plan.isolatedResearchScope?.contractVersion === "backyrd.beta-social-delivery-scope@1.0"
    ? scopeBetaSocialMigrations({pending:[...plan.pendingMigrations,...(plan.deferredMigrations??[])],scope:plan.isolatedResearchScope,
      baseSha:plan.baseSha,deployFunctions:plan.deployFunctions,authDeploy:plan.authConfig?.deploy===true})
    : plan.isolatedResearchScope?.contractVersion === "backyrd.beta-security-delivery-scope@1.0"
    ? scopeBetaSecurityMigrations({pending:[...plan.pendingMigrations,...(plan.deferredMigrations??[])],scope:plan.isolatedResearchScope,
      baseSha:plan.baseSha,deployFunctions:plan.deployFunctions,authConfig:plan.authConfig,appliedBetaSecurity:plan.appliedBetaSecurity,appliedAnalyticsPrivacy:plan.appliedAnalyticsPrivacy})
    : plan.isolatedResearchScope?.contractVersion === "backyrd.seasonal-event-delivery-scope@1.0"
    ? scopeSeasonalEventMigrations({pending:[...plan.pendingMigrations,...(plan.deferredMigrations??[])],scope:plan.isolatedResearchScope,
      baseSha:plan.baseSha,deployFunctions:plan.deployFunctions,authDeploy:plan.authConfig?.deploy===true,appliedSeasonalEvent:plan.appliedSeasonalEvent})
    : plan.isolatedResearchScope?.contractVersion === "backyrd.regional-decision-delivery-scope@1.0"
    ? scopeRegionalDecisionMigrations({pending:[...plan.pendingMigrations,...(plan.deferredMigrations??[])],scope:plan.isolatedResearchScope,
      baseSha:plan.baseSha,deployFunctions:plan.deployFunctions,authDeploy:plan.authConfig?.deploy===true,appliedRegionalDecision:plan.appliedRegionalDecision})
    : plan.isolatedResearchScope?.contractVersion === "backyrd.nuknuk-activity-delivery-scope@1.0"
    ? scopeNuknukActivityMigrations({ pending: [...plan.pendingMigrations, ...(plan.deferredMigrations ?? [])],
      scope: plan.isolatedResearchScope, baseSha: plan.baseSha, deployFunctions: plan.deployFunctions,
      authDeploy: plan.authConfig?.deploy === true, appliedNuknukActivity: plan.appliedNuknukActivity })
    : [ANALYTICS_PAGEVIEWS_SCOPE, SPOT_SEARCH_FRESHNESS_SCOPE, BASEL_PLACE_SOURCES_SCOPE, BASEL_OVERTURE_SCOPE].includes(plan.isolatedResearchScope?.contractVersion)
    ? scopeAnalyticsPageviewsMigrations({ pending: [...plan.pendingMigrations, ...plan.deferredMigrations],
      scope: plan.isolatedResearchScope, baseSha: plan.baseSha, deployFunctions: plan.deployFunctions,
      authDeploy: plan.authConfig?.deploy === true, retiredFunctions: plan.retiredFunctions,
      appliedAnalyticsPageviews: plan.appliedAnalyticsPageviews, appliedSpotSearchFreshness: plan.appliedSpotSearchFreshness, appliedBaselPlaceSources: plan.appliedBaselPlaceSources, appliedBaselOverture: plan.appliedBaselOverture })
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
