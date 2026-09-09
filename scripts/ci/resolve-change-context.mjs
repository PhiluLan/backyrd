#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const git = (root, args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

const commit = (root, value) => {
  const result = git(root, ["rev-parse", `${value}^{commit}`]);
  if (!SHA.test(result)) throw new Error(`invalid_commit:${value}`);
  return result;
};

const isAncestor = (root, ancestor, descendant) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

export function resolveChangeContext({
  root,
  eventName,
  baseSha,
  headSha,
  checkoutSha = "HEAD",
  canonicalMainRef = "refs/remotes/origin/main",
}) {
  if (!["pull_request", "push", "local"].includes(eventName)) {
    throw new Error(`unsupported_event:${eventName}`);
  }
  const base = commit(root, baseSha);
  const head = commit(root, headSha);
  const checkout = commit(root, checkoutSha);
  const canonicalMain = commit(root, canonicalMainRef);
  if (!isAncestor(root, base, head)) throw new Error("head_does_not_descend_from_base");

  let checkoutKind = "exact-head";
  if (checkout !== head) {
    const parents = git(root, ["rev-list", "--parents", "-n", "1", checkout]).split(/\s+/);
    if (eventName !== "pull_request" || parents.length !== 3 || parents[1] !== base || parents[2] !== head) {
      throw new Error("checkout_is_not_exact_head_or_exact_synthetic_merge");
    }
    checkoutKind = "synthetic-pr-merge";
  }

  const baseIsCanonicalTip = base === canonicalMain;
  const baseIsCanonicalAncestor = isAncestor(root, base, canonicalMain);
  if (eventName === "pull_request" && !baseIsCanonicalTip && !baseIsCanonicalAncestor) {
    throw new Error("pr_base_is_not_canonical_lineage");
  }
  if (eventName === "push" && head !== canonicalMain) {
    throw new Error("push_head_is_not_canonical_main");
  }

  return {
    schemaVersion: "backyrd-change-context-v1",
    eventName,
    baseSha: base,
    headSha: head,
    checkoutSha: checkout,
    checkoutKind,
    canonicalMainSha: canonicalMain,
    baseIsCanonicalTip,
    baseIsCanonicalAncestor,
    staleBase: eventName === "pull_request" && !baseIsCanonicalTip,
  };
}

const parseArgs = (argv) => Object.fromEntries(argv.reduce((items, value, index) => {
  if (!value.startsWith("--")) return items;
  items.push([value.slice(2), argv[index + 1]]);
  return items;
}, []));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
    const result = resolveChangeContext({
      root,
      eventName: args["event-name"] ?? "local",
      baseSha: args["base-sha"],
      headSha: args["head-sha"] ?? "HEAD",
      checkoutSha: args["checkout-sha"] ?? "HEAD",
      canonicalMainRef: args["canonical-main-ref"] ?? "refs/remotes/origin/main",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`change_context_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
