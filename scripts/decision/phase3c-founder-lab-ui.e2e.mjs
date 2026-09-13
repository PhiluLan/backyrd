import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { hashBody } from "../../packages/world-knowledge-core/dist/index.js";
import { makeFounderCohortHandoff } from "./phase3c-founder-cohort-fixture.mjs";
import { startPhase3CFounderLabServer } from "./phase3c-founder-lab-ui-server.mjs";

const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "backyrd-founder-e2e-"));
const { server, url } = await startPhase3CFounderLabServer({ port: 0, stateDirectory });
const browser = await chromium.launch({ headless: true }); let assertions = 0;
const equal = (a, b, message) => { assert.equal(a, b, message); assertions += 1; }; const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(10_000);
const upload = async (artifact, name = "founder-world-cohort.json") => page.locator("#cohort-file").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(artifact)) });
const previewAndImport = async (artifact, expectedName, fileName = "founder-world-cohort.json") => { await upload(artifact, fileName); await page.waitForFunction((name) => document.querySelector("#preview-content")?.textContent.includes(name), expectedName); await page.click("#confirm-import"); await page.waitForFunction((name) => document.querySelector("#source-summary")?.textContent.includes(name), expectedName); };
const rehash = (artifact) => { const copy = structuredClone(artifact); delete copy.handoffHash; return { ...copy, handoffHash: hashBody(copy, []) }; };
const runPreset = async (label) => { const previous=await page.locator("#expert-data").textContent(); await page.getByRole("button", { name: label }).click(); await page.click("#resolve"); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("Interpretation ist lokal")); await page.click("#evaluate"); await page.waitForFunction((before) => document.querySelector("#expert-data")?.textContent!==before, previous); };
page.on("pageerror", (error) => process.stderr.write(`browser_page_error:${error.message}\n`));
try {
  await page.goto(url); equal(await page.title(), "Backyrd Founder Decision Lab", "German Founder UI title"); ok((await page.locator("body").innerText()).includes("EVALUATION ONLY"), "evaluation boundary visible"); equal(await page.locator("#source-badge").innerText(), "Synthetische Testwelt", "fallback clearly labelled");
  const valid = makeFounderCohortHandoff(); await upload(valid); await page.waitForSelector("#cohort-preview:not([hidden])"); ok((await page.locator("#preview-content").innerText()).includes("Volta Bräu"), "preview lists real cohort names"); await page.click("#confirm-import"); await page.waitForFunction(() => document.querySelector("#source-badge")?.textContent === "Founder World Cohort"); ok((await page.locator("#source-summary").innerText()).includes("2 Spots"), "valid cohort activated");
  await previewAndImport(valid, "Volta Bräu", "founder-world-cohort-reimport.json"); equal(await page.locator("#source-badge").innerText(), "Founder World Cohort", "idempotent reimport");
  const second = makeFounderCohortHandoff(["Anderer Founder Spot", "Zweiter Founder Spot"]); await previewAndImport(second, "Anderer Founder Spot", "founder-world-cohort-second.json"); ok((await page.locator("#source-summary").innerText()).includes("Anderer Founder Spot"), "intentional cohort switch"); ok(!(await page.locator("#source-summary").innerText()).includes("Volta Bräu"), "cohorts never mix");
  await page.reload(); await page.waitForFunction(() => document.querySelector("#source-badge")?.textContent === "Founder World Cohort"); ok((await page.locator("#source-summary").innerText()).includes("Anderer Founder Spot"), "cohort persists across reload");
  const one = makeFounderCohortHandoff(["Volta Bräu"]); await previewAndImport(one, "Volta Bräu", "founder-world-cohort-one.json"); ok((await page.locator("#source-summary").innerText()).includes("nur einen Spot"), "single spot warning visible");
  for (const [name, mutate, expected] of [
    ["invalid-scope.json", (a) => { a.scope="PRODUCTION"; }, "scope"],
    ["invalid-manifest.json", (a) => { a.spots[0].manifestHash="0".repeat(64); }, "manifest"],
    ["invalid-snapshot.json", (a) => { a.spots[0].snapshot.facts[0].value="Manipuliert"; }, "snapshot"],
    ["invalid-registry.json", (a) => { a.manifest.registryVersion="backyrd.world-knowledge.registry@999"; a.manifestContentHash=hashBody(a.manifest,[]); }, "registry"],
  ]) { const forged=structuredClone(valid); mutate(forged); await page.locator("#notice").evaluate((element)=>{element.textContent="";}); await upload(rehash(forged),name); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("nicht übernommen")); ok((await page.locator("#notice").innerText()).toLowerCase().includes(expected), `${name} rejected`); }
  await page.click("#synthetic"); await page.waitForFunction(() => document.querySelector("#source-badge")?.textContent === "Synthetische Testwelt"); ok(!(await page.locator("#source-summary").innerText()).includes("Volta Bräu"), "explicit synthetic switch does not mix worlds");
  await previewAndImport(valid, "Volta Bräu", "founder-world-cohort-final.json");
  await runPreset("A · Composite Date"); const summaryA=await page.locator("#understood").innerText(); ok(summaryA.includes("Erstes Date")&&summaryA.includes("40 CHF")&&summaryA.includes("Zurich"), "composite Date preserved");
  await runPreset("B · Familie & Alter"); ok((await page.locator("#hard").inputValue()).includes("Altersregel"), "family age rule interpreted");
  await runPreset("C · Accessibility"); const cards=await page.locator("#candidate-groups").innerText(); ok(cards.includes("Rollstuhlgerechter Zugang")&&cards.includes("weder Ja noch Nein"), "Accessibility unknown remains visible");
  await page.check("#tracking"); await page.selectOption("#device-city","Basel"); await runPreset("D · Location"); equal(await page.inputValue("#target-city"), "Zurich", "explicit target city wins");
  await page.click("#alternative"); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("kein negatives Signal")); await page.click("#replay"); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("byte-identisch")); await page.locator(".reject").first().click(); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("kein User-Intelligence-Write"));
  await page.click("#compare"); await page.click("#context-flip"); await page.click("#resolve"); await page.click("#evaluate"); await page.waitForSelector("#comparison:not([hidden])"); ok((await page.locator("#comparison").innerText()).includes("Direkter Vergleich"), "comparison and context flip complete");
  await page.click("#expert"); const expert=await page.locator("#expert-data").innerText(); ok(expert.includes('"productionAuthorized": false')&&expert.includes('"writesUserIntelligence": false'), "expert boundaries visible"); ok(!expert.includes("Ich suche"), "raw request absent from result");
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForSelector("#cohort-file"); equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, "narrow layout has no horizontal overflow");
  page.once("dialog", dialog=>dialog.accept()); await page.click("#reset"); await page.waitForFunction(() => document.querySelector("#source-badge")?.textContent === "Synthetische Testwelt"); equal(fs.existsSync(path.join(stateDirectory,"active-cohort.json")),false,"reset only clears local file");
  const requests=[]; page.on("request",request=>requests.push(request.url())); await page.reload(); await page.waitForSelector("#source-badge"); equal(requests.some(requestUrl=>!requestUrl.startsWith(url)),false,"no external network request");
  process.stdout.write(`${JSON.stringify({ suite:"phase3c-founder-cohort-browser-e2e", scenarios:18, assertions, outcome:"PASS", localOnly:true })}\n`);
} finally { await browser.close(); await new Promise((resolve)=>server.close(resolve)); }
