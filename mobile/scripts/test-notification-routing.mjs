import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const routeSource = fs.readFileSync(
  new URL("../lib/notification-route.ts", import.meta.url),
  "utf8",
);
const routerSource = fs.readFileSync(
  new URL("../components/PushNotificationRouter.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(routeSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { resolveNotificationRoute } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const chatId = "50a30bb9-2845-4664-b462-c51cfb9f9dea";

test("accepts only canonical notification targets", () => {
  assert.equal(
    resolveNotificationRoute({ type: "direct_message", chat_id: chatId }),
    `/messages/${chatId}`,
  );
  assert.equal(
    resolveNotificationRoute({ type: "test_push", route: "/privacy-consent" }),
    "/privacy-consent",
  );
});

test("fails closed for malformed, stale and unknown targets", () => {
  const rejected = [
    undefined,
    {},
    { chat_id: chatId },
    { type: "direct_message", chat_id: "not-a-uuid" },
    { type: "direct_message", chat_id: `${chatId}/extra` },
    { type: "direct_message", route: "/privacy-consent" },
    { type: "test_push", route: "/settings" },
    { type: "test_push", route: "https://example.com" },
    { type: "unknown", chat_id: chatId },
  ];

  for (const data of rejected) {
    assert.equal(resolveNotificationRoute(data), null, JSON.stringify(data));
  }
});

test("deduplicates responses and clears the consumed cold-start response", () => {
  assert.match(routerSource, /useRootNavigationState/);
  assert.match(routerSource, /if \(!rootNavigationState\?\.key\) return/);
  assert.match(routerSource, /handledResponseIdsRef = useRef\(new Set<string>\(\)\)/);
  assert.match(routerSource, /handledResponseIdsRef\.current\.has\(responseId\)/);
  assert.match(routerSource, /handledResponseIdsRef\.current\.add\(responseId\)/);
  assert.match(routerSource, /clearLastNotificationResponseAsync\(\)/);
  assert.match(routerSource, /resolveNotificationRoute\(data\)/);
  assert.match(routerSource, /retained response present=/);
  assert.match(routerSource, /dispatch target=/);
  assert.doesNotMatch(routerSource, /console\.log\([^\n]*responseId/);
  assert.doesNotMatch(routerSource, /console\.log\([^\n]*data/);
});
