import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../lib/root-startup-navigation.ts", import.meta.url),
  "utf8",
);
const legalGuardSource = fs.readFileSync(
  new URL("../components/consent/LegalGateGuard.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { RootStartupNavigationAuthority } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const receipt = "8c944c8c-e751-4a36-a731-341e5361e0b6";

test("ordinary cold start selects default once and leaves no stale target", async () => {
  const authority = new RootStartupNavigationAuthority();
  assert.equal(authority.selectNoTarget(), true);
  assert.deepEqual(await authority.waitForSelection(), { kind: "no_target" });
  assert.equal(authority.completeDefaultStart(), true);
  assert.deepEqual(await authority.waitForSelection(), { kind: "no_target" });
  assert.equal(authority.selectTarget(receipt), false);
});

test("valid target waits for both Product Entry and Legal clearance", async () => {
  const authority = new RootStartupNavigationAuthority();
  assert.equal(authority.selectTarget(receipt), true);
  assert.deepEqual(await authority.waitForSelection(), { kind: "target", receipt });

  let dispatches = 0;
  const dispatch = authority.waitForTargetDispatch(receipt).then(() => {
    dispatches += 1;
  });

  authority.allowProductTargetFromEntryGate();
  await Promise.resolve();
  assert.equal(dispatches, 0);

  authority.setLegalState("required");
  await Promise.resolve();
  assert.equal(dispatches, 0);

  authority.setLegalState("clear");
  await dispatch;
  assert.equal(dispatches, 1);
});

test("legal clearance may arrive before Product Entry without a timing race", async () => {
  const authority = new RootStartupNavigationAuthority();
  authority.setLegalState("clear");
  assert.equal(authority.selectTarget(receipt), true);

  let dispatched = false;
  const dispatch = authority.waitForTargetDispatch(receipt).then(() => {
    dispatched = true;
  });
  await Promise.resolve();
  assert.equal(dispatched, false);

  authority.allowProductTargetFromEntryGate();
  await dispatch;
  assert.equal(dispatched, true);
});

test("conflicting targets cannot overwrite the selected launch target", () => {
  const authority = new RootStartupNavigationAuthority();
  assert.equal(authority.selectTarget(receipt), true);
  assert.equal(authority.selectTarget(receipt), true);
  assert.equal(
    authority.selectTarget("bc950895-89ce-41f0-82ad-e91e07c1effb"),
    false,
  );
  assert.equal(authority.selectNoTarget(), false);
});

test("acknowledgement is exact and idempotent", async () => {
  const authority = new RootStartupNavigationAuthority();
  authority.setLegalState("clear");
  authority.selectTarget(receipt);
  authority.allowProductTargetFromEntryGate();
  await authority.waitForTargetDispatch(receipt);

  assert.equal(authority.acknowledgeTarget("wrong-receipt"), false);
  assert.equal(authority.acknowledgeTarget(receipt), true);
  assert.equal(authority.acknowledgeTarget(receipt), true);
  assert.equal(authority.selectNoTarget(), false);
});

test("source contract contains no delay, retry, persistence, or route storage", () => {
  assert.doesNotMatch(source, /setTimeout|setInterval|UserDefaults|AsyncStorage/);
  assert.doesNotMatch(source, /router\.|\/spot\/|\/user\//);
  assert.match(source, /entryAllowsProductTarget/);
  assert.match(source, /legalState === "clear"/);
});

test("a pathname transition starts a fresh Legal Gate check", () => {
  assert.doesNotMatch(legalGuardSource, /checkingRef/);
  assert.match(legalGuardSource, /useEffect\(\(\) => \{/);
  assert.match(legalGuardSource, /let cancelled = false/);
  assert.match(legalGuardSource, /if \(cancelled\) return/);
  assert.match(legalGuardSource, /\}, \[pathname, router\]\)/);
});
