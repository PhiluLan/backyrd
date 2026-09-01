#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
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

const sourceExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".wasm"];
const resolveLocalImport = (tree, importer, specifier) => {
  if (specifier.startsWith("/")) throw new Error(`absolute_local_import_forbidden:${importer}:${specifier}`);
  const initial = posix.normalize(posix.join(posix.dirname(importer), specifier));
  if (initial === ".." || initial.startsWith("../")) throw new Error(`dependency_escapes_repository:${importer}:${specifier}`);
  const candidates = sourceExtensions.flatMap((extension) => [`${initial}${extension}`, `${initial}/index${extension}`]);
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
    for (const [key, value] of Object.entries(importMap.imports ?? {})) aliases.set(key, value);
  }
  for (const candidate of [
    "supabase/functions/.npmrc",
    posix.join(posix.dirname(entrypoint), ".npmrc"),
    posix.join(posix.dirname(entrypoint), "deno.json"),
    posix.join(posix.dirname(entrypoint), "deno.jsonc"),
  ]) if (tree.files.has(candidate)) ambient.push(candidate);
  if (config.values.static_files !== undefined) throw new Error(`static_files_require_explicit_dependency_support:${config.slug}`);

  const visited = new Set(ambient);
  const pending = [entrypoint];
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    const source = tree.text(path);
    for (let specifier of importsFor(source, path)) {
      if (aliases.has(specifier)) specifier = aliases.get(specifier);
      if (!specifier.startsWith(".")) continue;
      const dependency = resolveLocalImport(tree, path, specifier);
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
  const recoveryChanged = changedPaths.has(recoveryPath);
  const migrationRecovery = recoveryChanged ? productionMigrationRecovery(head, baseSha) : null;
  if (recoveryChanged && changes.find((entry) => entry.paths.includes(recoveryPath))?.status !== "A") throw new Error("migration_recovery_must_be_additive");
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
  const claimedRuntimePaths = new Set();
  for (const slug of slugs) {
    const beforeConfig = baseConfig.functions.get(slug);
    const afterConfig = headConfig.functions.get(slug);
    if (!afterConfig?.enabled) {
      if (beforeConfig?.enabled) throw new Error(`function_retirement_requires_explicit_contract:${slug}`);
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
    if (!["supabase/production/auth-config.json", recoveryPath].includes(path)) throw new Error(`unknown_production_config_scope:${path}`);
  }

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
  const deployFunctions = functions.filter((item) => item.deploy).map((item) => item.slug);
  const plan = {
    version: "backyrd-supabase-production-deployment-plan-v1",
    projectRef: "hjgcrrzfjchzqoegcywn",
    baseSha,
    canonicalMainSha: headSha,
    supabaseCliVersion: "2.98.2",
    functions,
    deployFunctions,
    migrations,
    migrationRecovery: migrationRecovery ? {
      failedCanonicalMainSha: migrationRecovery.failedCanonicalMainSha,
      failedDeploymentRunId: migrationRecovery.failedDeploymentRunId,
    } : null,
    authConfig,
    runtimeDeploymentRequired: deployFunctions.length > 0 || migrations.length > 0 || authConfig?.deploy === true,
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
