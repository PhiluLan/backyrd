#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { isExactPreappliedPriorityReceipt } from "../ci/product-additive-migration-scope.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const HASH = /^[0-9a-f]{64}$/;
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

const git = (repo, args, options = {}) => execFileSync("git", ["-C", repo, ...args], {
  encoding: "utf8",
  stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
}).trimEnd();

const parseArgs = (argv) => {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`unexpected_argument:${value}`);
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) values[key] = true;
    else { values[key] = next; index += 1; }
  }
  return values;
};

const parseScalar = (source) => {
  const value = source.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^"(?:[^"\\]|\\.)*"$/.test(value)) return JSON.parse(value);
  if (/^\[.*\]$/.test(value)) return JSON.parse(value);
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  throw new Error(`unsupported_config_value:${value}`);
};

export const parseSupabaseFunctionConfig = (source) => {
  const functions = new Map();
  const globalLines = [];
  let current = null;
  for (const originalLine of source.split(/\r?\n/)) {
    const line = originalLine.trim();
    const section = line.match(/^\[functions\.([^\]]+)\]$/);
    if (section) {
      current = section[1];
      if (functions.has(current)) throw new Error(`duplicate_function_config:${current}`);
      functions.set(current, { slug: current, values: {}, normalizedLines: [] });
      continue;
    }
    if (/^\[[^\]]+\]$/.test(line)) current = null;
    if (!current) {
      if (line && !line.startsWith("#")) globalLines.push(line);
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const assignment = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!assignment) throw new Error(`unsupported_function_config_line:${current}:${line}`);
    const [, key, raw] = assignment;
    const parsed = parseScalar(raw);
    functions.get(current).values[key] = parsed;
    functions.get(current).normalizedLines.push(`${key}=${stable(parsed)}`);
  }
  for (const item of functions.values()) {
    item.configHash = sha256(item.normalizedLines.sort().join("\n"));
    item.enabled = item.values.enabled !== false;
    item.verifyJwt = item.values.verify_jwt !== false;
    item.entrypoint = item.values.entrypoint;
    if (item.enabled && typeof item.entrypoint !== "string") throw new Error(`enabled_function_entrypoint_missing:${item.slug}`);
  }
  return { functions, globalHash: sha256(globalLines.join("\n")) };
};

const repositoryAt = (repo, ref) => {
  const files = new Set(git(repo, ["ls-tree", "-r", "--name-only", ref]).split("\n").filter(Boolean));
  const read = (path) => {
    if (!files.has(path)) throw new Error(`repository_file_missing:${ref}:${path}`);
    return execFileSync("git", ["-C", repo, "show", `${ref}:${path}`]);
  };
  return { files, read, text: (path) => read(path).toString("utf8") };
};

const productionAuthConfig = (tree) => {
  const path = "supabase/production/auth-config.json";
  if (!tree.files.has(path)) return null;
  const document = JSON.parse(tree.text(path));
  const allowedKeys = new Set([
    "site_url",
    "uri_allow_list",
    "password_min_length",
    "mailer_subjects_confirmation",
    "mailer_subjects_recovery",
    "mailer_templates_confirmation_content",
    "mailer_templates_recovery_content",
  ]);
  if (document.version !== "backyrd-production-auth-config-v1") throw new Error("unsupported_production_auth_config_version");
  if (document.projectRef !== "hjgcrrzfjchzqoegcywn") throw new Error("production_auth_project_mismatch");
  if (!document.config || Array.isArray(document.config) || typeof document.config !== "object") throw new Error("production_auth_config_object_required");
  for (const key of Object.keys(document.config)) if (!allowedKeys.has(key)) throw new Error(`production_auth_config_key_not_allowed:${key}`);
  if ([...allowedKeys].some((key) => !(key in document.config))) throw new Error("production_auth_config_required_key_missing");
  if (document.config.site_url !== "https://www.backyrd.ch") throw new Error("production_auth_site_url_invalid");
  if (document.config.uri_allow_list !== "https://www.backyrd.ch/auth/callback**,backyrd://auth/**") throw new Error("production_auth_redirect_scope_invalid");
  if (!Number.isInteger(document.config.password_min_length) || document.config.password_min_length < 8 || document.config.password_min_length > 72) throw new Error("production_auth_password_policy_invalid");
  for (const key of [...allowedKeys].filter((value) => value !== "password_min_length")) {
    if (typeof document.config[key] !== "string" || !document.config[key].trim()) throw new Error(`production_auth_config_value_invalid:${key}`);
  }
  return { path, sha256: sha256(tree.read(path)), values: document.config };
};

const productionMigrationRecovery = (tree, baseSha) => {
  const path = "supabase/production/pending-migration-recovery.json";
  if (!tree.files.has(path)) return null;
  const document = JSON.parse(tree.text(path));
  if (document.version !== "backyrd-pending-migration-recovery-v1") throw new Error("unsupported_migration_recovery_version");
  if (document.projectRef !== "hjgcrrzfjchzqoegcywn") throw new Error("migration_recovery_project_mismatch");
  if (document.failedCanonicalMainSha !== baseSha) throw new Error("migration_recovery_base_mismatch");
  if (!Number.isInteger(document.failedDeploymentRunId) || document.failedDeploymentRunId <= 0) throw new Error("migration_recovery_run_invalid");
  if (document.failureStage !== "BEFORE_MIGRATION_APPLY") throw new Error("migration_recovery_stage_invalid");
  if (!Array.isArray(document.migrations) || document.migrations.length === 0) throw new Error("migration_recovery_scope_required");
  const migrations = document.migrations.map((entry) => {
    if (!entry || typeof entry.path !== "string" || !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(entry.path)) throw new Error("migration_recovery_path_invalid");
    if (typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error("migration_recovery_hash_invalid");
    if (!tree.files.has(entry.path) || sha256(tree.read(entry.path)) !== entry.sha256) throw new Error(`migration_recovery_bytes_mismatch:${entry.path}`);
    return { path: entry.path, sha256: entry.sha256 };
  });
  if (new Set(migrations.map((entry) => entry.path)).size !== migrations.length) throw new Error("migration_recovery_duplicate_path");
  return {
    path,
    failedCanonicalMainSha: document.failedCanonicalMainSha,
    failedDeploymentRunId: document.failedDeploymentRunId,
    migrations,
  };
};

const productionPreappliedMigrationImport = (tree, baseSha) => {
  const path = "supabase/production/preapplied-migration-import.json";
  if (!tree.files.has(path)) return null;
  const document = JSON.parse(tree.text(path));
  if (document.version !== "backyrd-preapplied-migration-import-v2") throw new Error("unsupported_preapplied_migration_import_version");
  if (document.projectRef !== "hjgcrrzfjchzqoegcywn") throw new Error("preapplied_migration_project_mismatch");
  if (document.canonicalBaseSha !== baseSha) throw new Error("preapplied_migration_base_mismatch");
  if (document.remoteState !== "REMOTE_UP_TO_DATE") throw new Error("preapplied_migration_remote_state_invalid");
  if (document.authorization !== "Founder-authorized Events V1 evidence re-certification") throw new Error("preapplied_migration_authorization_invalid");
  if (typeof document.verifiedAt !== "string" || !/^2026-09-06T\d{2}:\d{2}:\d{2}Z$/.test(document.verifiedAt)) throw new Error("preapplied_migration_verified_at_invalid");
  const evidence = document.productionEvidence;
  if (!evidence || evidence.migrationLedger !== "STATEMENT_CONTENT_MATCH" || evidence.externalEventSourcesEnabled !== false) throw new Error("preapplied_migration_production_evidence_invalid");
  if (!Number.isInteger(evidence.applicationSchemaEntryCount) || evidence.applicationSchemaEntryCount <= 0) throw new Error("preapplied_migration_schema_count_invalid");
  for (const key of ["applicationSchemaSha256", "publicAclSha256"]) {
    if (typeof evidence[key] !== "string" || !/^[0-9a-f]{64}$/.test(evidence[key])) throw new Error(`preapplied_migration_${key}_invalid`);
  }
  if (tree.text("supabase/canonical/application-schema-events-v1.sha256").trim() !== evidence.applicationSchemaSha256) throw new Error("preapplied_migration_schema_contract_mismatch");
  if (tree.text("supabase/canonical/public-acl-events-v1.sha256").trim() !== evidence.publicAclSha256) throw new Error("preapplied_migration_acl_contract_mismatch");
  if (!Array.isArray(document.migrations) || document.migrations.length === 0) throw new Error("preapplied_migration_scope_required");
  const migrations = document.migrations.map((entry) => {
    if (!entry || typeof entry.path !== "string" || !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(entry.path)) throw new Error("preapplied_migration_path_invalid");
    if (typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error("preapplied_migration_hash_invalid");
    if (!Number.isInteger(entry.productionStatementCount) || entry.productionStatementCount <= 0) throw new Error("preapplied_migration_statement_count_invalid");
    if (typeof entry.productionStatementSha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.productionStatementSha256)) throw new Error("preapplied_migration_statement_hash_invalid");
    if (!tree.files.has(entry.path) || sha256(tree.read(entry.path)) !== entry.sha256) throw new Error(`preapplied_migration_bytes_mismatch:${entry.path}`);
    return {
      path: entry.path,
      sha256: entry.sha256,
      productionStatementCount: entry.productionStatementCount,
      productionStatementSha256: entry.productionStatementSha256,
    };
  });
  if (new Set(migrations.map((entry) => entry.path)).size !== migrations.length) throw new Error("preapplied_migration_duplicate_path");
  return { path, evidence, migrations };
};

// One-time reconciliation of the 13 Founder-authorized Product migrations
// already recorded in Production. This observes history; it never repairs it.
const productPreappliedMigrationImport = (tree, baseSha) => {
  const path = "supabase/production/preapplied-product-migrations-v1.json";
  const document = JSON.parse(tree.text(path));
  if (document.version !== "backyrd-preapplied-product-migrations-v1"
    || document.projectRef !== "hjgcrrzfjchzqoegcywn"
    || document.canonicalBaseSha !== baseSha
    || document.observation !== "READ_ONLY_PRODUCTION_LEDGER_NOT_APPLY_RECEIPT"
    || document.restoreProbe !== "NOT_PERFORMED_FOUNDER_RISK_ACCEPTED"
    || !/^2026-09-19T\d{2}:\d{2}:\d{2}Z$/.test(document.observedAt ?? "")
    || document.remoteMigrationCount !== 152
    || document.remoteMigrationTip !== "20260919090423"
    || !Number.isSafeInteger(document.backupRunId) || document.backupRunId <= 0) {
    throw new Error("product_preapplied_observation_invalid");
  }
  if (!Array.isArray(document.migrations) || document.migrations.length !== 13) {
    throw new Error("product_preapplied_scope_invalid");
  }
  const migrations = document.migrations.map((entry) => {
    if (!/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(entry?.path ?? "")
      || !HASH.test(entry?.sha256) || !Number.isInteger(entry?.productionStatementCount)
      || entry.productionStatementCount < 1 || !HASH.test(entry?.productionStatementSha256)
      || !tree.files.has(entry.path) || sha256(tree.read(entry.path)) !== entry.sha256) {
      throw new Error(`product_preapplied_migration_identity_invalid:${entry?.path ?? "missing"}`);
    }
    return entry;
  });
  if (new Set(migrations.map(({ path: migrationPath }) => migrationPath)).size !== 13) {
    throw new Error("product_preapplied_duplicate_migration");
  }
  return { path, document, migrations };
};

const functionRetirementContract = (tree) => {
  const path = "supabase/production/function-retirements.json";
  if (!tree.files.has(path)) return null;
  const document = JSON.parse(tree.text(path));
  if (!["backyrd-function-retirements-v1", "backyrd-function-retirements-v2"].includes(document.version) || document.projectRef !== "hjgcrrzfjchzqoegcywn") throw new Error("function_retirement_contract_invalid");
  const cutover = document.version === "backyrd-function-retirements-v2";
  const requiredPreconditions = ["EXACT_POST_MERGE_MAIN_AND_ARTIFACT", "CURRENT_REMOTE_FUNCTION_IDENTITY_MATCHES", "PRODUCT_BACKEND_OFF_SMOKE_GREEN", "OLD_CLIENT_INCOMPATIBILITY_FAILS_CLOSED", "EXACT_MOBILE_OTA_AND_IPHONE_SMOKE_GREEN", "EMERGENCY_OFF_READY"];
  if (document.remoteState !== "NOT_QUERIED" || document.productionAction !== (cutover ? "DELETE_AFTER_VERIFIED_SINGLE_ROUTE_CUTOVER" : "NONE_NOT_AUTHORIZED")
    || document.executionAuthorized !== false || (cutover && JSON.stringify(document.requiredPreconditions) !== JSON.stringify(requiredPreconditions))) throw new Error("function_retirement_authority_open");
  if (!Array.isArray(document.retirements) || document.retirements.length === 0) throw new Error("function_retirement_scope_required");
  const retirements = document.retirements.map((entry) => {
    for (const key of ["slugSha256", "previousConfigHash", "previousSourceSetHash"]) if (!HASH.test(entry?.[key])) throw new Error(`function_retirement_hash_invalid:${key}`);
    if (entry.repositoryDisposition !== "DELETE_SOURCE_AND_CONFIG" || entry.reason !== (cutover ? "SINGLE_ROUTE_CUTOVER_WITH_UNPROVEN_HISTORICAL_CLIENT_USAGE" : "NO_ACTIVE_PRODUCT_CONSUMER")) throw new Error("function_retirement_disposition_invalid");
    return entry;
  });
  if (new Set(retirements.map(({ slugSha256 }) => slugSha256)).size !== retirements.length) throw new Error("function_retirement_duplicate_identity");
  return { path, retirements, productionAction: document.productionAction, requiredPreconditions: cutover ? requiredPreconditions : [] };
};

const sourceExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".wasm"];
const resolveLocalImport = (tree, importer, specifier) => {
  if (specifier.startsWith("/")) throw new Error(`absolute_local_import_forbidden:${importer}:${specifier}`);
  const initial = posix.normalize(posix.join(posix.dirname(importer), specifier));
  if (initial === ".." || initial.startsWith("../")) throw new Error(`dependency_escapes_repository:${importer}:${specifier}`);
  const emittedExtension = initial.match(/\.(?:mjs|cjs|js|jsx)$/)?.[0];
  const sourceStem = emittedExtension ? initial.slice(0, -emittedExtension.length) : initial;
  const emittedSourceCandidates = emittedExtension
    ? [".ts", ".tsx", ".mts", ".cts"].map((extension) => `${sourceStem}${extension}`)
    : [];
  const deploySource = /^packages\/(?:decision-vnext-core|user-intelligence-vnext-core|world-knowledge-core)\/dist\/(.+)\.js$/.exec(initial);
  const generatedSourceCandidate = deploySource ? [initial.replace("/dist/", "/src/").replace(/\.js$/, ".ts")] : [];
  const candidates = [initial, ...generatedSourceCandidate, ...emittedSourceCandidates, ...sourceExtensions.flatMap((extension) => [`${initial}${extension}`, `${initial}/index${extension}`])];
  const matches = [...new Set(candidates)].filter((candidate) => tree.files.has(candidate));
  if (matches.length !== 1) throw new Error(`${matches.length ? "ambiguous" : "unresolved"}_local_dependency:${importer}:${specifier}`);
  return matches[0];
};

const importsFor = (source, path) => {
  const specifiers = [];
  const staticPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^"'();]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(staticPattern)) specifiers.push(match[1]);
  const dynamicPattern = /\bimport\s*\(([^)]*)\)/g;
  for (const match of source.matchAll(dynamicPattern)) {
    const argument = match[1].trim();
    const literal = argument.match(/^(["'])([^"']+)\1$/);
    if (!literal) throw new Error(`non_literal_dynamic_dependency:${path}:${argument}`);
    specifiers.push(literal[2]);
  }
  const runtimeReadPattern = /\bDeno\.(?:readFile|readTextFile|open)\s*\(/;
  if (runtimeReadPattern.test(source)) throw new Error(`unbound_runtime_file_dependency:${path}`);
  return [...new Set(specifiers)];
};

const expandFunctionSourceSet = (tree, config) => {
  const entrypoint = posix.normalize(posix.join("supabase", config.entrypoint.replace(/^\.\//, "")));
  if (!tree.files.has(entrypoint)) throw new Error(`function_entrypoint_missing:${config.slug}:${entrypoint}`);
  const importMapPath = typeof config.values.import_map === "string"
    ? posix.normalize(posix.join("supabase", config.values.import_map.replace(/^\.\//, "")))
    : null;
  const aliases = new Map();
  const ambient = [];
  if (importMapPath) {
    const importMap = JSON.parse(tree.text(importMapPath));
    ambient.push(importMapPath);
    for (const [key, value] of Object.entries(importMap.imports ?? {})) aliases.set(key, { value, importer: importMapPath });
  }
  for (const candidate of [
    "supabase/functions/.npmrc",
    posix.join(posix.dirname(entrypoint), ".npmrc"),
    posix.join(posix.dirname(entrypoint), "deno.json"),
    posix.join(posix.dirname(entrypoint), "deno.jsonc"),
  ]) if (tree.files.has(candidate)) ambient.push(candidate);
  const denoConfigPath = posix.join(posix.dirname(entrypoint), "deno.json");
  if (tree.files.has(denoConfigPath)) {
    const denoConfig = JSON.parse(tree.text(denoConfigPath));
    for (const [key, value] of Object.entries(denoConfig.imports ?? {})) aliases.set(key, { value, importer: denoConfigPath });
  }
  if (config.values.static_files !== undefined) throw new Error(`static_files_require_explicit_dependency_support:${config.slug}`);

  const visited = new Set(ambient);
  const pending = [entrypoint];
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    const source = tree.text(path);
    for (let specifier of importsFor(source, path)) {
      let importer = path;
      if (aliases.has(specifier)) {
        const alias = aliases.get(specifier);
        specifier = alias.value;
        importer = alias.importer;
      }
      if (!specifier.startsWith(".")) continue;
      const dependency = resolveLocalImport(tree, importer, specifier);
      if (!visited.has(dependency)) pending.push(dependency);
    }
  }
  const files = [...visited].sort().map((path) => ({ path, sha256: sha256(tree.read(path)) }));
  return {
    files,
    sourceSetHash: sha256(stable({ configHash: config.configHash, files })),
    entrypoint,
    configHash: config.configHash,
    verifyJwt: config.verifyJwt,
  };
};

const diffEntries = (repo, base, head) => git(repo, ["diff", "--name-status", "--find-renames", base, head])
  .split("\n").filter(Boolean).map((line) => {
    const [status, first, second] = line.split("\t");
    return { status, paths: [first, second].filter(Boolean) };
  });

export const buildProductionPlan = ({ repo, baseSha, headSha }) => {
  const base = repositoryAt(repo, baseSha);
  const head = repositoryAt(repo, headSha);
  const baseConfig = parseSupabaseFunctionConfig(base.text("supabase/config.toml"));
  const headConfig = parseSupabaseFunctionConfig(head.text("supabase/config.toml"));
  const changes = diffEntries(repo, baseSha, headSha);
  const changedPaths = new Set(changes.flatMap((entry) => entry.paths));
  if (baseConfig.globalHash !== headConfig.globalHash) throw new Error("ambiguous_global_supabase_config_change");
  const beforeAuthConfig = productionAuthConfig(base);
  const afterAuthConfig = productionAuthConfig(head);
  const recoveryPath = "supabase/production/pending-migration-recovery.json";
  const preappliedImportPath = "supabase/production/preapplied-migration-import.json";
  const productPreappliedPath = "supabase/production/preapplied-product-migrations-v1.json";
  const retirementPath = "supabase/production/function-retirements.json";
  const recoveryChanged = changedPaths.has(recoveryPath);
  const preappliedImportChanged = changedPaths.has(preappliedImportPath);
  const productPreappliedChanged = changedPaths.has(productPreappliedPath);
  const retirementChanged = changedPaths.has(retirementPath);
  const migrationRecovery = recoveryChanged ? productionMigrationRecovery(head, baseSha) : null;
  const preappliedMigrationImport = preappliedImportChanged ? productionPreappliedMigrationImport(head, baseSha) : null;
  const productPreappliedImport = productPreappliedChanged ? productPreappliedMigrationImport(head, baseSha) : null;
  const retirementContract = retirementChanged ? functionRetirementContract(head) : null;
  if (recoveryChanged && changes.find((entry) => entry.paths.includes(recoveryPath))?.status !== "A") throw new Error("migration_recovery_must_be_additive");
  if (preappliedImportChanged && changes.find((entry) => entry.paths.includes(preappliedImportPath))?.status !== "A") throw new Error("preapplied_migration_import_must_be_additive");
  if (productPreappliedChanged && changes.find((entry) => entry.paths.includes(productPreappliedPath))?.status !== "A") throw new Error("product_preapplied_import_must_be_additive");
  if (retirementChanged && changes.find((entry) => entry.paths.includes(retirementPath))?.status !== "A") throw new Error("function_retirement_contract_must_be_additive");
  if ([migrationRecovery, preappliedMigrationImport, productPreappliedImport].filter(Boolean).length > 1) throw new Error("migration_release_modes_conflict");
  if (beforeAuthConfig && !afterAuthConfig) throw new Error("production_auth_config_removal_forbidden");
  const authConfig = afterAuthConfig
    ? {
        ...afterAuthConfig,
        deploy: !beforeAuthConfig || beforeAuthConfig.sha256 !== afterAuthConfig.sha256,
        previousSha256: beforeAuthConfig?.sha256 ?? null,
      }
    : null;

  const slugs = [...new Set([...baseConfig.functions.keys(), ...headConfig.functions.keys()])].sort();
  const functions = [];
  const retiredFunctions = [];
  const claimedRuntimePaths = new Set();
  for (const slug of slugs) {
    const beforeConfig = baseConfig.functions.get(slug);
    const afterConfig = headConfig.functions.get(slug);
    if (!afterConfig?.enabled) {
      if (beforeConfig?.enabled) {
        const before = expandFunctionSourceSet(base, beforeConfig);
        for (const item of before.files) claimedRuntimePaths.add(item.path);
        const slugSha256 = sha256(slug);
        const contract = retirementContract?.retirements.find((entry) => entry.slugSha256 === slugSha256);
        if (!contract || contract.previousConfigHash !== before.configHash || contract.previousSourceSetHash !== before.sourceSetHash) throw new Error(`function_retirement_requires_explicit_contract:${slug}`);
        retiredFunctions.push({ slug, slugSha256, previousConfigHash: before.configHash, previousSourceSetHash: before.sourceSetHash, productionAction: retirementContract.productionAction, requiredPreconditions: retirementContract.requiredPreconditions, executionAuthorized: false });
      }
      continue;
    }
    const after = expandFunctionSourceSet(head, afterConfig);
    const before = beforeConfig?.enabled ? expandFunctionSourceSet(base, beforeConfig) : null;
    for (const item of after.files) claimedRuntimePaths.add(item.path);
    for (const item of before?.files ?? []) claimedRuntimePaths.add(item.path);
    const deploy = !before || before.sourceSetHash !== after.sourceSetHash;
    functions.push({
      slug,
      deploy,
      reason: !before ? "NEW_ENABLED_FUNCTION" : deploy ? "BOUND_SOURCE_OR_CONFIG_CHANGED" : "UNCHANGED",
      ...after,
      previousSourceSetHash: before?.sourceSetHash ?? null,
    });
  }

  for (const path of changedPaths) {
    if (!path?.startsWith("supabase/functions/")) continue;
    if (claimedRuntimePaths.has(path)) continue;
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) continue;
    throw new Error(`changed_edge_source_has_no_declared_deployment_scope:${path}`);
  }
  for (const path of changedPaths) {
    if (!path?.startsWith("supabase/production/")) continue;
    if (!["supabase/production/auth-config.json", recoveryPath, preappliedImportPath, productPreappliedPath, retirementPath].includes(path)) throw new Error(`unknown_production_config_scope:${path}`);
  }
  if ((retirementContract?.retirements.length ?? 0) !== retiredFunctions.length) throw new Error("function_retirement_contract_scope_mismatch");

  const migrations = [];
  for (const change of changes) {
    for (const path of change.paths.filter((value) => value?.startsWith("supabase/migrations/"))) {
      if (change.status !== "A") throw new Error(`published_migration_is_not_immutable:${change.status}:${path}`);
      if (!/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(path)) throw new Error(`invalid_forward_migration_path:${path}`);
      migrations.push({ path, sha256: sha256(head.read(path)) });
    }
  }
  for (const migration of migrationRecovery?.migrations ?? []) {
    if (!base.files.has(migration.path) || sha256(base.read(migration.path)) !== migration.sha256) throw new Error(`migration_recovery_base_bytes_mismatch:${migration.path}`);
    if (!migrations.some((entry) => entry.path === migration.path)) migrations.push(migration);
  }
  migrations.sort((left, right) => left.path.localeCompare(right.path));
  const preappliedMigrations = preappliedMigrationImport?.migrations ?? productPreappliedImport?.migrations ?? [];
  const observedPriorityReceipt = head.files.has("delivery/product-authority-v1.json")
    ? JSON.parse(head.text("delivery/product-authority-v1.json"))
      .additiveProductMigrationScope?.preappliedPriorityReceipt ?? null
    : null;
  const priorityReceipt = migrations.some((entry) => entry.path === observedPriorityReceipt?.path)
    ? observedPriorityReceipt : null;
  if (priorityReceipt) {
    const priority = migrations[0];
    if (!isExactPreappliedPriorityReceipt(priorityReceipt)
      || priority?.path !== priorityReceipt.path || priority?.sha256 !== priorityReceipt.sha256
      || preappliedMigrations.length > 0) throw new Error("product_priority_preapplied_receipt_invalid");
  }
  if (preappliedMigrationImport) {
    const planned = migrations.map((entry) => `${entry.path}:${entry.sha256}`).sort();
    const attested = preappliedMigrations.map((entry) => `${entry.path}:${entry.sha256}`).sort();
    if (JSON.stringify(planned) !== JSON.stringify(attested)) throw new Error("preapplied_migration_scope_mismatch");
  }
  if (productPreappliedImport) {
    const expectedPrefix = migrations.slice(0, 13).map(({ path, sha256: digest }) => `${path}:${digest}`);
    const observedPrefix = preappliedMigrations.map(({ path, sha256: digest }) => `${path}:${digest}`);
    if (migrations.length < 14 || JSON.stringify(expectedPrefix) !== JSON.stringify(observedPrefix)
      || migrations[12].path.slice(20, 34) !== productPreappliedImport.document.remoteMigrationTip) {
      throw new Error("product_preapplied_scope_mismatch");
    }
  }
  const preappliedPaths = new Set([...preappliedMigrations.map((entry) => entry.path), ...(priorityReceipt ? [priorityReceipt.path] : [])]);
  const pendingMigrations = migrations.filter((entry) => !preappliedPaths.has(entry.path));
  const deployFunctions = functions.filter((item) => item.deploy).map((item) => item.slug);
  const plan = {
    version: "backyrd-supabase-production-deployment-plan-v1",
    projectRef: "hjgcrrzfjchzqoegcywn",
    baseSha,
    canonicalMainSha: headSha,
    supabaseCliVersion: "2.98.2",
    functions,
    retiredFunctions,
    deployFunctions,
    migrations,
    pendingMigrations,
    additivePreappliedPriority: priorityReceipt,
    preappliedMigrationImport: preappliedMigrationImport ? {
      path: preappliedMigrationImport.path,
      canonicalBaseSha: baseSha,
      productionEvidence: preappliedMigrationImport.evidence,
      migrations: preappliedMigrations,
    } : null,
    productPreappliedImport: productPreappliedImport ? {
      path: productPreappliedImport.path,
      observedAt: productPreappliedImport.document.observedAt,
      remoteMigrationCount: productPreappliedImport.document.remoteMigrationCount,
      remoteMigrationTip: productPreappliedImport.document.remoteMigrationTip,
      backupRunId: productPreappliedImport.document.backupRunId,
      restoreProbe: productPreappliedImport.document.restoreProbe,
      migrations: preappliedMigrations,
    } : null,
    migrationRecovery: migrationRecovery ? {
      failedCanonicalMainSha: migrationRecovery.failedCanonicalMainSha,
      failedDeploymentRunId: migrationRecovery.failedDeploymentRunId,
    } : null,
    authConfig,
    runtimeDeploymentRequired: deployFunctions.length > 0 || pendingMigrations.length > 0 || authConfig?.deploy === true,
  };
  return { ...plan, planHash: sha256(stable(plan)) };
};

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repo = resolve(args.repo ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
    const baseSha = String(args["base-sha"] ?? "");
    const headSha = String(args["head-sha"] ?? "HEAD");
    if (!/^[0-9a-f]{40}$/.test(baseSha)) throw new Error("valid_base_sha_required");
    const resolvedHead = git(repo, ["rev-parse", headSha]);
    if (!/^[0-9a-f]{40}$/.test(resolvedHead)) throw new Error("valid_head_sha_required");
    if (args["assert-canonical-main"] && process.env.GITHUB_REF !== "refs/heads/main") throw new Error("production_deployment_requires_canonical_main_ref");
    if (args["assert-canonical-main"] && process.env.GITHUB_SHA !== resolvedHead) throw new Error("production_deployment_sha_mismatch");
    const plan = buildProductionPlan({ repo, baseSha, headSha: resolvedHead });
    const serialized = `${JSON.stringify(plan, null, 2)}\n`;
    if (args.output) writeFileSync(resolve(args.output), serialized, { encoding: "utf8", flag: "wx" });
    else process.stdout.write(serialized);
  } catch (error) {
    process.stderr.write(`supabase_production_plan_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
