import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as sourceRuntime from "../../packages/spot-research-runtime/src/nuknuk-sources.mjs";

const nativeRequire = createRequire(import.meta.url);
function load(relative, resolve = nativeRequire) {
  const loaded = { exports: {} };
  const input = readFileSync(new URL(relative, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  new Function("module", "exports", "require", outputText)(loaded, loaded.exports, resolve);
  return loaded.exports;
}

const { crawlSpotPages, planCrawlerQueries, readCrawlerEvidence, robotsPermits } = load(
  "../lib/server/spotCrawlerDiscovery.ts", id => id.endsWith("nuknuk-sources.mjs") ? sourceRuntime : nativeRequire(id),
);
const crawler = load("../lib/spotCrawler.ts");
const page = (url, body) => ({ url, body, contentType: "text/html", observedAt: "2026-11-17T10:00:00Z" });
const settings = { categories: ["CAFE", "BAR"], districts: ["Basel", "Clara"], searches: 4, limit: 10 };
const website = "https://venue.example/";
const geocoded = {lat:47.551,lng:7.562};
const structured = body => `<script type="application/ld+json">${JSON.stringify(body)}</script>`;
const cafe = { "@type": ["Organization", "CafeOrCoffeeShop"], name: "Prüfcafé", openingHours: "Mo 09:00-17:00", url: website };
const address = '<address>Prüfstrasse 7<br>4051 Basel</address>';

test("the query plan rotates scope and wording without exceeding the paid reservation", () => {
  const first = planCrawlerQueries(settings, 1);
  assert.equal(first.length, 4);
  assert.equal(new Set(first).size, 4);
  assert.notDeepEqual(first, planCrawlerQueries(settings, 2));
});

test("uses a single visible Basel address to complete an identified venue", () => {
  const found = readCrawlerEvidence(page(website, structured(cafe) + address), settings.categories);
  assert.equal(found.length, 1);
  assert.equal(found[0].address, "Prüfstrasse 7");
  assert.equal(found[0].name, "Prüfcafé");
  assert.equal(found[0].hours, "Mo 09:00-17:00");
  assert.deepEqual(readCrawlerEvidence(page(website, structured(cafe) + address.replace("Basel", "Zürich")), settings.categories), []);
  assert.deepEqual(readCrawlerEvidence(page(website, structured(cafe) + address + address.replace("7", "15")), settings.categories), []);
  assert.deepEqual(readCrawlerEvidence(page(website, structured({...cafe,url:"https://elsewhere.example/"}) + address), settings.categories), []);
});

test("requires venue identity on pages without structured data", () => {
  assert.equal(readCrawlerEvidence(page(website, "<title>Bagatelle Bar Basel</title>" + address), settings.categories)[0].name, "Bagatelle Bar");
  assert.deepEqual(readCrawlerEvidence(page(website, "<title>Was tun in Basel?</title>" + address), settings.categories), []);
});

test("checks robots, avoids directory pages, deduplicates and resolves a specific public address", async () => {
  assert.equal(robotsPermits("User-agent: *\nDisallow: /\nAllow: /kontakt$", "/kontakt"), true);
  assert.equal(robotsPermits("User-agent: *\nDisallow: /\nAllow: /kontakt$", "/kontakt/extra"), false);
  const calls = [];
  const result = await crawlSpotPages([website, website+"kontakt", website+"privat", "https://maps.google.ch/search"], settings, {
    deadline: Date.now()+10_000,
    load: async url => {
      calls.push(url);
      return page(url,url.endsWith("robots.txt") ? "User-agent: *\nDisallow: /privat" : structured(cafe)+address);
    },
    locate: async found => {
      assert.deepEqual(found,{street:"Prüfstrasse 7",postalCode:"4051"});
      return geocoded;
    },
  });
  assert.deepEqual(calls,[website+"robots.txt",website,website+"kontakt"]);
  assert.equal(result.pagesChecked, 2);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].external_id.length, 64);
});


test("settings order and revision do not block a new search", () => {
  const saved = { ...settings, schedule: "MANUAL", time: "08:00", monthBudgetCents: 1000, revision: "1" };
  const reversed = Object.fromEntries(Object.entries(saved).reverse());
  const same = { ...reversed, categories: [...saved.categories].reverse(), revision: "2" };
  assert.equal(crawler.sameCrawlerSettings(saved, same), true);
  assert.equal(crawler.sameCrawlerSettings(saved, { ...same, limit: 20 }), false);
  assert.equal(crawler.sameCrawlerSettings(saved, { ...same, districts: ["Basel", "Altstadt"] }), false);
});

test("open candidates skip a page of processed finds and history preserves the existing records", async () => {
  const approved = { source_id: 1, imported_spot_id: "spot", review_state: "IMPORTED", state: "REVIEW" };
  const duplicate = { source_id: 2, review_state: "REVIEWED", state: "REVIEW", can_confirm_distinct: false };
  const rejected = { source_id: 3, review_state: "DISMISSED", state: "NEW" };
  const separateVenue = { source_id: 4, review_state: "OPEN", state: "REVIEW", can_confirm_distinct: true };
  const saved = { ...settings, schedule: "MANUAL", time: "08:00", monthBudgetCents: 1000, revision: "1" };
  const cursors = [];
  const actor = {
    rpc: async (name, { p_after }) => {
      assert.equal(name, "admin_backyrd_spot_crawler_preview_v1");
      cursors.push(p_after);
      return { data: p_after === 0
        ? { rows: [approved, duplicate, rejected], next_after: 3, runs: [] }
        : { rows: [separateVenue], next_after: null, runs: [] } };
    },
  };
  const route = load("../app/api/spot-crawler/route.ts", id => ({
    "next/server": {},
    "@/lib/server/adminAuthorization": { authorizeAdminRequest: async () => ({ ok: true, client: actor }) },
    "@/lib/server/spotCrawlerJobs": { crawlerService: () => ({ rpc: async () => ({ data: saved }) }) },
    "@/lib/spotCrawler": crawler,
  })[id]);
  const open = await route.GET(new Request("https://example.org/api/spot-crawler"));
  assert.equal(open.status, 200);
  assert.deepEqual((await open.json()).overview.rows, [separateVenue]);
  assert.deepEqual(cursors, [0, 3]);
  const history = await route.GET(new Request("https://example.org/api/spot-crawler?view=history"));
  assert.deepEqual((await history.json()).overview.rows, [approved, duplicate, rejected]);
});
