#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChangeContext } from "./resolve-change-context.mjs";

const git = (root, args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
}).trim();
const startsWithAny = (path, prefixes) => prefixes.some((prefix) => path === prefix || path.startsWith(prefix));
const unique = (values) => [...new Set(values)].sort();

const migrationSecurityPattern = /\b(?:create|alter|drop)\s+policy\b|\brow\s+level\s+security\b|\b(?:grant|revoke)\b|\bsecurity\s+definer\b|\bauth\.|\bstorage\./i;
const destructivePattern = /\btruncate\b|\bdrop\s+(?:table|schema|column|type)\b|\bdelete\s+from\b|\balter\s+table\b[^;]*\bdrop\b/i;
const provablyNonExecutableDocumentation = (path) => (
  /^(?:docs\/.*\.md|README\.md|AGENTS\.md)$/.test(path)
);

const normalizedStatements = (text) => text
  .replace(/--[^\n]*/g, "")
  .split(";")
  .map((statement) => statement.trim().replace(/\s+/g, " "))
  .filter(Boolean);

const canonicalSql = (text) => text
  .replace(/--[^\n]*/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const founderLivePurgeSignature = "public.backyrd_founder_live_idempotency_purge_expired_v1(integer)";
const certifiedFounderLivePurge = canonicalSql(`
create function public.backyrd_founder_live_idempotency_purge_expired_v1(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  perform founder_live_private.assert_service_authority_v1();
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'founder_live_idempotency_purge_limit_invalid' using errcode = '22023';
  end if;
  perform set_config('backyrd.founder_live_expired_purge', 'v1', true);
  with expired_keys as materialized (
    select scope_version, purpose, release_hash, artifact_hash, source_set_hash,
      response_contract_version, subject_digest, idempotency_key_digest
    from founder_live_private.idempotency_records_v1
    where expires_at <= clock_timestamp()
    order by expires_at
    limit p_limit
    for update skip locked
  )
  delete from founder_live_private.idempotency_records_v1 as target
  using expired_keys
  where target.scope_version = expired_keys.scope_version
    and target.purpose = expired_keys.purpose
    and target.release_hash = expired_keys.release_hash
    and target.artifact_hash = expired_keys.artifact_hash
    and target.source_set_hash = expired_keys.source_set_hash
    and target.response_contract_version = expired_keys.response_contract_version
    and target.subject_digest = expired_keys.subject_digest
    and target.idempotency_key_digest = expired_keys.idempotency_key_digest;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;`);

function withoutCertifiedFounderLivePurge(text) {
  const definitions = [...text.matchAll(/create\s+function\s+public\.backyrd_founder_live_idempotency_purge_expired_v1\s*\(p_limit\s+integer\s+default\s+500\)[\s\S]*?\$\$\s*;/gi)];
  if (definitions.length !== 1 || canonicalSql(definitions[0][0]) !== certifiedFounderLivePurge) return text;
  const acl = normalizedStatements(text).map((statement) => statement.toLowerCase()).filter((statement) =>
    /^(?:grant|revoke)\b/.test(statement) && statement.includes("backyrd_founder_live_idempotency_purge_expired_v1"));
  const expectedAcl = [
    `revoke all on function ${founderLivePurgeSignature} from public, anon, authenticated`,
    `grant execute on function ${founderLivePurgeSignature} to service_role`,
  ].sort();
  if (JSON.stringify(acl.sort()) !== JSON.stringify(expectedAcl)) return text;
  const remainder = text.replace(definitions[0][0], "");
  if (/\b(?:delete\s+from|update|truncate)\s+founder_live_private\.idempotency_records_v1\b/i.test(remainder)) return text;
  return remainder;
}

export function isDestructiveMigration(text) {
  const statements = normalizedStatements(withoutCertifiedFounderLivePurge(text));
  for (const statement of statements) {
    if (!destructivePattern.test(statement)) continue;
    const replacement = statement.match(/^alter table ([a-z0-9_."]+) drop constraint(?: if exists)? ([a-z0-9_"]+)$/i);
    if (replacement) {
      const [, relation, constraint] = replacement;
      const addPattern = new RegExp(`^alter table ${relation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} add constraint ${constraint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} check \\(`, "i");
      if (statements.some((candidate) => addPattern.test(candidate))) continue;
    }
    return true;
  }
  return false;
}

export function classifyChange({ root, context, policy }) {
  const statusLines = git(root, ["diff", "--name-status", `${context.baseSha}..${context.headSha}`]).split("\n").filter(Boolean);
  const changes = statusLines.map((line) => {
    const [status, first, second] = line.split("\t");
    return { status, path: second ?? first };
  });
  const changedFiles = changes.map(({ path }) => path);
  const trustAnchor = JSON.parse(git(root, ["show", `${context.baseSha}:${policy.decisionTrustAnchor}`]));
  const protectedDecisionPaths = new Set(trustAnchor.protectedSemanticSourceSet?.paths ?? []);
  const newMigrations = changes.filter(({ status, path }) => status === "A" && path.startsWith("supabase/migrations/"));
  const migrationMutations = changes.filter(({ status, path }) => status !== "A" && path.startsWith("supabase/migrations/"));
  const migrationTexts = newMigrations.map(({ path }) => git(root, ["show", `${context.headSha}:${path}`]));
  const migrationText = migrationTexts.join("\n");
  const testDeletion = changes.some(({ status, path }) => status === "D" && (path.includes("/test/") || /(?:^|\.)test\.[cm]?[jt]sx?$/.test(path)));
  const decisionConsumer = changedFiles.some((path) => startsWithAny(path, policy.decisionConsumerPrefixes ?? []));
  const pipelineControl = changedFiles.some((path) => startsWithAny(path, policy.decisionPipelineControlPrefixes ?? []));
  const unknown = changedFiles.some((path) => !startsWithAny(path, policy.knownRepositoryPrefixes ?? []));
  const workflowChange = changedFiles.some((path) => path.startsWith(".github/workflows/") || path === "package.json" || path === "package-lock.json");
  const deploymentControl = changedFiles.some((path) => path.startsWith("scripts/deployment/") || path.startsWith("supabase/production/") || path === ".github/workflows/supabase-production.yml");
  const documentationOnly = changedFiles.length > 0 && changedFiles.every(provablyNonExecutableDocumentation);
  const machineReadableDocumentation = changedFiles.some((path) => path.startsWith("docs/") && !path.endsWith(".md"));
  const integrationControl = changedFiles.some((path) => startsWithAny(path, policy.integrationControlPrefixes ?? []));
  const fullScopeRouting = unknown || workflowChange || machineReadableDocumentation || integrationControl;

  const flags = {
    mobile: fullScopeRouting || changedFiles.some((path) => startsWithAny(path, policy.surfacePrefixes.mobile)),
    web: fullScopeRouting || changedFiles.some((path) => startsWithAny(path, policy.surfacePrefixes.web)),
    admin: fullScopeRouting || changedFiles.some((path) => startsWithAny(path, policy.surfacePrefixes.admin)),
    shared: fullScopeRouting || changedFiles.some((path) => startsWithAny(path, policy.surfacePrefixes.shared)),
    database: fullScopeRouting || deploymentControl || changedFiles.some((path) => startsWithAny(path, [...policy.databasePrefixes, ...(policy.databaseControlPrefixes ?? [])])),
    privilegedServer: changedFiles.some((path) => startsWithAny(path, policy.privilegedServerPrefixes ?? [])),
    authorizationBoundary: changedFiles.some((path) => startsWithAny(path, policy.authorizationPrefixes)) || migrationSecurityPattern.test(migrationText),
    decisionSemantics: changedFiles.some((path) => protectedDecisionPaths.has(path) || startsWithAny(path, policy.decisionSemanticPrefixes)),
    decisionEvaluation: changedFiles.some((path) => startsWithAny(path, policy.decisionEvaluationPrefixes)) || decisionConsumer || pipelineControl || testDeletion || fullScopeRouting,
    decisionConsumer,
    pipelineControl,
    testDeletion,
    unknown,
    workflowChange,
    deploymentControl,
    fullScopeRouting,
    documentationOnly,
    machineReadableDocumentation,
    integrationControl,
    deliveryControl: changedFiles.some((path) => startsWithAny(path, policy.deliveryControlPrefixes)),
    releaseEvidence: changedFiles.some((path) => startsWithAny(path, policy.releaseEvidencePrefixes)),
    destructive: migrationTexts.some(isDestructiveMigration),
    migrationMutation: migrationMutations.length > 0,
  };
  const classes = [
    ...(flags.mobile ? ["mobile"] : []),
    ...(flags.web ? ["web"] : []),
    ...(flags.admin ? ["admin"] : []),
    ...(flags.shared ? ["shared-contract"] : []),
    ...(flags.database ? [flags.authorizationBoundary ? "authorization-boundary" : newMigrations.length ? "database-additive" : "database-control"] : []),
    ...(flags.privilegedServer ? ["privileged-server"] : []),
    ...(flags.decisionSemantics ? ["decision-semantics"] : []),
    ...(!flags.decisionSemantics && flags.decisionEvaluation ? ["decision-evaluation"] : []),
    ...(flags.decisionConsumer ? ["decision-consumer-contract"] : []),
    ...(flags.pipelineControl ? ["decision-pipeline-control"] : []),
    ...(flags.testDeletion ? ["test-routing-change"] : []),
    ...(flags.unknown ? ["unknown-change"] : []),
    ...(flags.workflowChange ? ["workflow-or-package-control"] : []),
    ...(flags.deploymentControl ? ["deployment-control"] : []),
    ...(flags.documentationOnly ? ["documentation-only"] : []),
    ...(flags.machineReadableDocumentation ? ["machine-readable-documentation-contract"] : []),
    ...(flags.integrationControl ? ["integration-control-plane"] : []),
    ...(flags.deliveryControl ? ["delivery-control"] : []),
    ...(flags.releaseEvidence ? ["release-evidence"] : []),
    ...(flags.destructive ? ["destructive-production-operation"] : []),
  ];
  return {
    schemaVersion: "backyrd-change-plan-v1",
    context,
    changedFiles: unique(changedFiles),
    classes: unique(classes.length ? classes : ["repository-only"]),
    flags,
    newMigrations: newMigrations.map(({ path }) => path).sort(),
    migrationMutations: migrationMutations.map(({ status, path }) => ({ status, path })),
    requiredGates: unique([
      "repository-security",
      ...(flags.mobile ? ["mobile"] : []),
      ...(flags.web ? ["web"] : []),
      ...(flags.admin ? ["admin"] : []),
      ...(flags.shared ? ["shared"] : []),
      ...(flags.database ? ["database"] : []),
      ...(flags.decisionSemantics || flags.decisionEvaluation ? ["decision"] : []),
      ...(flags.deliveryControl || flags.releaseEvidence || flags.database || flags.privilegedServer || flags.pipelineControl || flags.testDeletion || flags.fullScopeRouting ? ["delivery-contract"] : []),
    ]),
    blockedReasons: unique([
      ...(flags.migrationMutation ? ["published_migration_mutation"] : []),
      ...(flags.destructive ? ["destructive_migration_requires_separate_founder_cto_authorization"] : []),
    ]),
  };
}

const parseArgs = (argv) => Object.fromEntries(argv.reduce((items, value, index) => {
  if (value.startsWith("--")) items.push([value.slice(2), argv[index + 1]]);
  return items;
}, []));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
    const policy = JSON.parse(readFileSync(resolve(root, "delivery/change-policy.json"), "utf8"));
    const context = resolveChangeContext({
      root,
      eventName: args["event-name"] ?? "local",
      baseSha: args["base-sha"],
      headSha: args["head-sha"] ?? "HEAD",
      checkoutSha: args["checkout-sha"] ?? "HEAD",
      canonicalMainRef: args["canonical-main-ref"] ?? "refs/remotes/origin/main",
    });
    const plan = classifyChange({ root, context, policy });
    if (args.output) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(resolve(args.output), `${JSON.stringify(plan, null, 2)}\n`, { flag: "w" });
    }
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    if (plan.blockedReasons.length) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`change_classification_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
