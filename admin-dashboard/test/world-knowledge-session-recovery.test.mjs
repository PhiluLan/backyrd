import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const directory = await mkdtemp(join(tmpdir(), "backyrd-world-session-test-"));
  const modulePath = join(directory, "module.mjs");
  await writeFile(modulePath, output, { mode: 0o600 });
  return import(modulePath);
}

const { assertWorldKnowledgeLocalEndpoints, authorizedWorldKnowledgePost } = await importTypeScript("../lib/worldKnowledgeSession.ts");
const { sessionRecoveringAuthoringClient } = await importTypeScript("../../packages/world-knowledge-authoring-ui/src/session.ts");

const response = (status, body) => ({ status, ok: status >= 200 && status < 300, async json() { return body; } });

test("expired local session refreshes before the server action", async () => {
  let refreshed = 0; const tokens = [];
  const auth = { async getSession() { return { data: { session: { access_token: "old", expires_at: 1 } }, error: null }; }, async refreshSession() { refreshed += 1; return { data: { session: { access_token: "fresh", expires_at: 4_000_000_000 } }, error: null }; } };
  const result = await authorizedWorldKnowledgePost({ auth, body: { action: "rebuild" }, fetcher: async (_url, init) => { tokens.push(init.headers.authorization); return response(200, { ok: true }); } });
  assert.deepEqual(result, { ok: true }); assert.equal(refreshed, 1); assert.deepEqual(tokens, ["Bearer fresh"]);
});

test("invalid_session refreshes once and retries without changing the request", async () => {
  let refreshes = 0; const bodies = [];
  const auth = { async getSession() { return { data: { session: { access_token: "old", expires_at: 4_000_000_000 } }, error: null }; }, async refreshSession() { refreshes += 1; return { data: { session: { access_token: "new", expires_at: 4_000_000_000 } }, error: null }; } };
  let calls = 0; const result = await authorizedWorldKnowledgePost({ auth, body: { action: "rebuild", spotId: "stable" }, fetcher: async (_url, init) => { calls += 1; bodies.push(init.body); return calls === 1 ? response(401, { error: "invalid_session" }) : response(200, { rebuilt: true }); } });
  assert.deepEqual(result, { rebuilt: true }); assert.equal(refreshes, 1); assert.equal(calls, 2); assert.equal(bodies[0], bodies[1]);
});

test("unrecoverable session returns a controlled reauthentication error", async () => {
  const auth = { async getSession() { return { data: { session: null }, error: null }; }, async refreshSession() { return { data: { session: null }, error: { message: "expired" } }; } };
  await assert.rejects(() => authorizedWorldKnowledgePost({ auth, body: {}, fetcher: async () => response(500, {}) }), /invalid_session/);
});

test("client and server must bind the same loopback Supabase endpoint", () => {
  assert.equal(assertWorldKnowledgeLocalEndpoints("http://127.0.0.1:57261", "http://127.0.0.1:57261/"), "http://127.0.0.1:57261");
  assert.throws(() => assertWorldKnowledgeLocalEndpoints("http://127.0.0.1:57261", "http://127.0.0.1:54321"), /local_world_knowledge_endpoint_mismatch/);
  assert.throws(() => assertWorldKnowledgeLocalEndpoints("https://production.example", "https://production.example"), /local_world_knowledge_endpoint_mismatch/);
});

test("direct authoring RPC refreshes once and replays the exact typed request", async () => {
  const parameters = { p_attribute_key: "hours.regular", p_value: [{ day: "MONDAY", intervals: [{ start: "17:00", end: "23:00" }] }] };
  const calls = [];
  const client = {
    async rpc(name, body) {
      calls.push({ name, body });
      return calls.length === 1 ? { data: null, error: { message: "invalid_session" } } : { data: { created: true }, error: null };
    },
  };
  let refreshes = 0;
  const auth = { async refreshSession() { refreshes += 1; return { data: { session: { access_token: "local-token" } }, error: null }; } };
  const result = await sessionRecoveringAuthoringClient(client, auth).rpc("world_owner_submit_claim_v1", parameters);
  assert.deepEqual(result, { data: { created: true }, error: null });
  assert.equal(refreshes, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});

test("the canonical local start command derives one endpoint for both servers without printing credentials", async () => {
  const source = await readFile(new URL("../../scripts/world-knowledge/start-local-authoring.mjs", import.meta.url), "utf8");
  assert.match(source, /\["supabase", "status", "--workdir", statusRoot, "-o", "env"\]/);
  assert.match(source, /backyrd-current-85423/);
  assert.match(source, /NEXT_PUBLIC_SUPABASE_URL: normalize\(values\.API_URL\)/);
  assert.match(source, /WORLD_KNOWLEDGE_LOCAL_SUPABASE_URL: normalize\(values\.API_URL\)/);
  assert.match(source, /WORLD_KNOWLEDGE_EXPECTED_LOCAL_URL/);
  assert.match(source, /--apply-authoring-closure/);
  assert.match(source, /20260912084654/);
  assert.match(source, /20260912103000/);
  assert.match(source, /20260912121000/);
  assert.doesNotMatch(source, /supabase", "db", "reset"/);
  assert.doesNotMatch(source, /migration", "up"/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:ANON_KEY|SERVICE_ROLE_KEY)/);
});

test("both local authoring surfaces allow the canonical 127.0.0.1 dev origin", async () => {
  const adminConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  const ownerConfig = await readFile(new URL("../../web/next.config.ts", import.meta.url), "utf8");
  for (const source of [adminConfig, ownerConfig]) {
    assert.match(source, /allowedDevOrigins:\s*\["127\.0\.0\.1"\]/);
    assert.doesNotMatch(source, /allowedDevOrigins:\s*\["\*"\]/);
  }
});
