import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }, fileName: path }).outputText;
  const directory = await mkdtemp(join(tmpdir(), "backyrd-product-search-test-"));
  const modulePath = join(directory, "module.mjs");
  await writeFile(modulePath, output, { mode: 0o600 });
  return import(modulePath);
}

const { parseProductAdminSpotSearch, productSearchFailure } = await importTypeScript("../lib/worldProductSpotSearch.ts");
const { authorizedWorldKnowledgeSpotSearch } = await importTypeScript("../lib/worldKnowledgeSession.ts");
const spotId = "9d7d5b0c-9d5a-4f81-855b-047462703cf4";
const good = { contractVersion: "backyrd.world-knowledge.product-admin-spot-search@1.0", spots: [{ spotId, name: "Synthetic Café", city: "Zürich" }], hasMore: false };

test("Product Admin search accepts only bounded public spot identity, never private fields", () => {
  assert.deepEqual(parseProductAdminSpotSearch(good), good);
  for (const extra of ["ownerId", "actorId", "contactEmail", "claims", "serviceKey"]) {
    assert.throws(() => parseProductAdminSpotSearch({ ...good, spots: [{ ...good.spots[0], [extra]: "private" }] }), /world_product_search_spot_invalid/);
  }
  assert.throws(() => parseProductAdminSpotSearch({ ...good, spots: Array(31).fill(good.spots[0]) }), /world_product_search_contract_invalid/);
  assert.throws(() => parseProductAdminSpotSearch({ ...good, spots: [good.spots[0], good.spots[0]] }), /world_product_search_spot_invalid/);
  assert.throws(() => parseProductAdminSpotSearch({ ...good, unexpected: true }), /world_product_search_contract_invalid/);
});

test("missing migration, missing authority and unreachable service have distinct safe outcomes", () => {
  assert.deepEqual(productSearchFailure({ code: "PGRST202" }), { status: 503, code: "WORLD_BACKEND_NOT_PUBLISHED" });
  assert.deepEqual(productSearchFailure({ code: "42883" }), { status: 503, code: "WORLD_BACKEND_NOT_PUBLISHED" });
  assert.deepEqual(productSearchFailure({ code: "42501" }), { status: 403, code: "WORLD_ADMIN_FORBIDDEN" });
  assert.deepEqual(productSearchFailure({ code: "PGRST000" }), { status: 503, code: "WORLD_SERVICE_UNAVAILABLE" });
});

test("Admin search refreshes an expired session without changing the name query", async () => {
  const paths = []; const tokens = []; let refreshes = 0;
  const auth = {
    async getSession() { return { data: { session: { access_token: "old", expires_at: 1 } }, error: null }; },
    async refreshSession() { refreshes += 1; return { data: { session: { access_token: "new", expires_at: 4_000_000_000 } }, error: null }; },
  };
  const result = await authorizedWorldKnowledgeSpotSearch({ auth, query: "Café & Bar", fetcher: async (path, init) => {
    paths.push(path); tokens.push(init.headers.authorization);
    return { status: 200, ok: true, async json() { return good; } };
  } });
  assert.deepEqual(result, good);
  assert.equal(refreshes, 1);
  assert.deepEqual(paths, ["/api/world-knowledge/spots?q=Caf%C3%A9%20%26%20Bar"]);
  assert.deepEqual(tokens, ["Bearer new"]);
});

test("unpublished backend cannot be confused with an actual empty search", async () => {
  const auth = { async getSession() { return { data: { session: { access_token: "valid", expires_at: 4_000_000_000 } }, error: null }; } };
  await assert.rejects(() => authorizedWorldKnowledgeSpotSearch({ auth, query: "Café", fetcher: async () => ({ status: 503, ok: false, async json() { return { error: "WORLD_BACKEND_NOT_PUBLISHED" }; } }) }), /WORLD_BACKEND_NOT_PUBLISHED/);
  const empty = await authorizedWorldKnowledgeSpotSearch({ auth, query: "Café", fetcher: async () => ({ status: 200, ok: true, async json() { return { ...good, spots: [] }; } }) });
  assert.deepEqual(empty.spots, []);
});

test("the Spot editor uses Product search; the research page has no duplicate editor", async () => {
  const [page, researchPage, ui, route] = await Promise.all([
    readFile(new URL("../app/spots/[id]/edit/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/world-knowledge/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../packages/world-knowledge-authoring-ui/src/ProductCorrection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/world-knowledge/spots/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<WorldProductCorrection[\s\S]+search=\{\(query\) => authorizedWorldKnowledgeSpotSearch/);
  assert.match(researchPage, /<WorldResearchBatchPanel/);
  assert.doesNotMatch(researchPage, /<WorldProductCorrection|<WorldKnowledgeAuthoring/);
  assert.match(ui, /Spot nach Namen suchen/);
  assert.match(ui, /World Knowledge hier noch nicht verfügbar/);
  assert.match(ui, /Keine freigegebenen Spots zu dieser Suche gefunden/);
  assert.match(route, /authorizeAdminRequest/);
  assert.match(route, /world_product_admin_search_spots_v1/);
  assert.doesNotMatch(route, /world_founder_list_spots_v1|SUPABASE_SERVICE_ROLE_KEY/);
});
