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
const destructivePattern = /\btruncate\b|\bdrop\s+(?:table|schema|column|type)\b|\bdelete\s+from\b|\balter\s+table\b[\s\S]*?\bdrop\b/i;

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
  const migrationText = newMigrations.map(({ path }) => git(root, ["show", `${context.headSha}:${path}`])).join("\n");
  const testDeletion = changes.some(({ status, path }) => status === "D" && (path.includes("/test/") || /(?:^|\.)test\.[cm]?[jt]sx?$/.test(path)));
  const decisionConsumer = changedFiles.some((path) => startsWithAny(path, policy.decisionConsumerPrefixes ?? []));
  const pipelineControl = changedFiles.some((path) => startsWithAny(path, policy.decisionPipelineControlPrefixes ?? []));
  const unknown = changedFiles.some((path) => !startsWithAny(path, policy.knownRepositoryPrefixes ?? []));

  const flags = {
    mobile: changedFiles.some((path) => startsWithAny(path, policy.surfacePrefixes.mobile)),
    web: changedFiles.some((path) => startsWithAny(path, policy.surfacePrefixes.web)),
    admin: changedFiles.some((path) => startsWithAny(path, policy.surfacePrefixes.admin)),
    shared: changedFiles.some((path) => startsWithAny(path, policy.surfacePrefixes.shared)),
    database: changedFiles.some((path) => startsWithAny(path, [...policy.databasePrefixes, ...(policy.databaseControlPrefixes ?? [])])),
    privilegedServer: changedFiles.some((path) => startsWithAny(path, policy.privilegedServerPrefixes ?? [])),
    authorizationBoundary: changedFiles.some((path) => startsWithAny(path, policy.authorizationPrefixes)) || migrationSecurityPattern.test(migrationText),
    decisionSemantics: changedFiles.some((path) => protectedDecisionPaths.has(path) || startsWithAny(path, policy.decisionSemanticPrefixes)),
    decisionEvaluation: changedFiles.some((path) => startsWithAny(path, policy.decisionEvaluationPrefixes)) || decisionConsumer || pipelineControl || testDeletion || unknown,
    decisionConsumer,
    pipelineControl,
    testDeletion,
    unknown,
    deliveryControl: changedFiles.some((path) => startsWithAny(path, policy.deliveryControlPrefixes)),
    releaseEvidence: changedFiles.some((path) => startsWithAny(path, policy.releaseEvidencePrefixes)),
    destructive: destructivePattern.test(migrationText),
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
      ...(flags.deliveryControl || flags.releaseEvidence || flags.database || flags.privilegedServer || flags.pipelineControl || flags.testDeletion || flags.unknown ? ["delivery-contract"] : []),
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
