import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as sourceRuntime from "../../packages/spot-research-runtime/src/nuknuk-sources.mjs";

const nativeRequire = createRequire(import.meta.url);
const loaded = { exports: {} };
const input = readFileSync(new URL("../lib/server/spotCrawlerDiscovery.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
new Function("module", "exports", "require", outputText)(loaded, loaded.exports,
  id => id.endsWith("nuknuk-sources.mjs") ? sourceRuntime : nativeRequire(id));

const { crawlSpotPages, planCrawlerQueries, readCrawlerEvidence, robotsPermits } = loaded.exports;
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
