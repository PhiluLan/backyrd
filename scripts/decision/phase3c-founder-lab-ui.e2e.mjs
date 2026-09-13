import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { hashBody } from "../../packages/world-knowledge-core/dist/index.js";
import { LOCAL_FOUNDER_COHORT_FIXTURE, makeFounderCohortHandoff } from "./phase3c-founder-cohort-fixture.mjs";
import { startPhase3CFounderLabServer } from "./phase3c-founder-lab-ui-server.mjs";

const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "backyrd-founder-e2e-"));
const { server, url } = await startPhase3CFounderLabServer({ port: 0, stateDirectory });
const browser = await chromium.launch({ headless: true }); let assertions = 0;
const screenshotDirectory = process.env.PHASE3C_E2E_SCREENSHOT_DIR || null;
if (screenshotDirectory) fs.mkdirSync(screenshotDirectory, { recursive: true, mode: 0o700 });
const equal = (a, b, message) => { assert.equal(a, b, message); assertions += 1; }; const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(10_000);
const upload = async (artifact, name = "founder-world-cohort.json") => { const file=path.join(stateDirectory,name); fs.writeFileSync(file,`${JSON.stringify(artifact)}\n`,{mode:0o600}); const chooserPromise=page.waitForEvent("filechooser"); await page.locator("#cohort-file").click(); const chooser=await chooserPromise; await chooser.setFiles(file); };
const previewAndImport = async (artifact, expectedName, fileName = "founder-world-cohort.json") => { await upload(artifact, fileName); await page.waitForFunction((name) => document.querySelector("#preview-content")?.textContent.includes(name), expectedName); await page.click("#confirm-import"); await page.waitForFunction((name) => document.querySelector("#source-summary")?.textContent.includes(name), expectedName); };
const rehash = (artifact) => { const copy = structuredClone(artifact); delete copy.handoffHash; return { ...copy, handoffHash: hashBody(copy, []) }; };
const runPreset = async (label) => { const previous=await page.locator("#expert-data").textContent(); await page.getByRole("button", { name: label }).click(); await page.click("#resolve"); await page.waitForFunction(() => document.querySelector("#action-status")?.textContent.includes("Situation erkannt")); await page.click("#evaluate"); await page.waitForFunction((before) => document.querySelector("#expert-data")?.textContent!==before, previous); };
const groupCounts = async (activePage) => {
  const counts = await activePage.locator(".group").evaluateAll((groups) => groups.map((group) => group.querySelectorAll(".card").length));
  return { confirmed: counts[0], fallback: counts[1], notConfigured: counts[2], ineligible: counts[3] };
};
const runFreshFounderCase = async ({ label, setup, expected }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const activePage = await context.newPage(); activePage.setDefaultTimeout(10_000);
  try {
    await activePage.goto(url); equal(await activePage.locator("#source-badge").innerText(), "Founder World Cohort", `${label}: real Founder cohort active in fresh browser`);
    equal(await activePage.locator("#evaluate").isDisabled(), true, `${label}: evaluation initially disabled`);
    if (setup) await setup(activePage);
    await activePage.getByRole("button", { name: label }).click();
    await activePage.click("#resolve");
    await activePage.waitForFunction(() => document.querySelector("#action-status")?.textContent.includes("Situation erkannt und auswertbar"));
    equal(await activePage.locator("#evaluate").isDisabled(), false, `${label}: evaluation enabled only after complete interpretation`);
    const visible = {
      summary: await activePage.locator("#understood").innerText(),
      primaryIntent: await activePage.inputValue("#primary"), secondaryIntent: await activePage.inputValue("#secondary"),
      occasion: await activePage.inputValue("#occasion"), moods: await activePage.inputValue("#moods"),
      targetCity: await activePage.inputValue("#target-city"), dayPhase: await activePage.inputValue("#day-phase"),
      budget: await activePage.inputValue("#budget"), companion: await activePage.inputValue("#companion"),
      minimumAge: await activePage.inputValue("#minimum-age"), adultPresent: await activePage.isChecked("#adult-present"),
      hardConstraints: await activePage.inputValue("#hard"), softPreferences: await activePage.inputValue("#soft"),
    };
    for (const [key, value] of Object.entries(expected.fields)) {
      if (typeof value === "boolean") equal(visible[key], value, `${label}: visible ${key}`);
      else ok(visible[key].includes(value), `${label}: visible ${key} includes ${value}`);
    }
    await activePage.click("#evaluate"); await activePage.waitForSelector("#results:not([hidden])");
    const groups = await groupCounts(activePage); equal(Object.values(groups).reduce((sum, count) => sum + count, 0), 5, `${label}: exactly five Founder candidates evaluated`);
    for (const [key, value] of Object.entries(expected.groups)) equal(groups[key], value, `${label}: ${key} candidate count`);
    return { label, visible, groups };
  } finally { await context.close(); }
};
page.on("pageerror", (error) => process.stderr.write(`browser_page_error:${error.message}\n`));
try {
  await page.goto(url); equal(await page.title(), "Backyrd Founder Decision Lab", "German Founder UI title"); ok((await page.locator("body").innerText()).includes("EVALUATION ONLY"), "evaluation boundary visible"); equal(await page.locator("#source-badge").innerText(), "Synthetische Testwelt", "fallback clearly labelled");
  equal(await page.locator("#evaluate").isDisabled(), true, "evaluation disabled until interpretation is verified");
  const valid = makeFounderCohortHandoff(); await upload(valid); await page.waitForSelector("#cohort-preview:not([hidden])"); const previewText=await page.locator("#preview-content").innerText(); for(const {name} of LOCAL_FOUNDER_COHORT_FIXTURE) ok(previewText.includes(name), `preview lists ${name}`); await page.click("#confirm-import"); await page.waitForFunction(() => document.querySelector("#source-badge")?.textContent === "Founder World Cohort"); ok((await page.locator("#source-summary").innerText()).includes("5 Spots"), "five-spot Founder cohort activated"); if(screenshotDirectory) await page.screenshot({path:path.join(screenshotDirectory,"01-founder-cohort-import.png"),fullPage:true});
  await previewAndImport(valid, "Volta Bräu", "founder-world-cohort-reimport.json"); equal(await page.locator("#source-badge").innerText(), "Founder World Cohort", "idempotent reimport");
  const second = makeFounderCohortHandoff(["Anderer Founder Spot", "Zweiter Founder Spot"]); await previewAndImport(second, "Anderer Founder Spot", "founder-world-cohort-second.json"); ok((await page.locator("#source-summary").innerText()).includes("Anderer Founder Spot"), "intentional cohort switch"); ok(!(await page.locator("#source-summary").innerText()).includes("Volta Bräu"), "cohorts never mix");
  await page.reload(); await page.waitForFunction(() => document.querySelector("#source-badge")?.textContent === "Founder World Cohort"); ok((await page.locator("#source-summary").innerText()).includes("Anderer Founder Spot"), "cohort persists across reload");
  const one = makeFounderCohortHandoff(["Volta Bräu"]); await previewAndImport(one, "Volta Bräu", "founder-world-cohort-one.json"); ok((await page.locator("#source-summary").innerText()).includes("nur einen Spot"), "single spot warning visible");
  for (const [name, mutate, expected] of [
    ["invalid-scope.json", (a) => { a.scope="PRODUCTION"; }, "scope"],
    ["invalid-manifest.json", (a) => { a.spots[0].manifestHash="0".repeat(64); }, "verändert"],
    ["invalid-snapshot.json", (a) => { a.spots[0].snapshot.facts[0].value="Manipuliert"; }, "verändert"],
    ["invalid-registry.json", (a) => { a.manifest.registryVersion="backyrd.world-knowledge.registry@999"; a.manifestContentHash=hashBody(a.manifest,[]); }, "registry"],
    ["invalid-nested-schema.json", (a) => { const fact=a.spots[0].snapshot.facts.find((item)=>item.key==="rule.age_access_conditions"); fact.value.rules[0].notes="nicht kanonisch"; }, "nicht übernommen"],
  ]) { const forged=structuredClone(valid); mutate(forged); await page.locator("#notice").evaluate((element)=>{element.textContent="";}); await upload(rehash(forged),name); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("nicht übernommen")); ok((await page.locator("#notice").innerText()).toLowerCase().includes(expected), `${name} rejected`); }
  await page.click("#synthetic"); await page.waitForFunction(() => document.querySelector("#source-badge")?.textContent === "Synthetische Testwelt"); ok(!(await page.locator("#source-summary").innerText()).includes("Volta Bräu"), "explicit synthetic switch does not mix worlds");
  await previewAndImport(valid, "Volta Bräu", "founder-world-cohort-final.json");
  const incompleteContext = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const incompletePage = await incompleteContext.newPage(); incompletePage.setDefaultTimeout(10_000);
  await incompletePage.goto(url); await incompletePage.fill("#task", "Ich suche einen Ort für mich und meine zwölfjährige Tochter."); await incompletePage.click("#resolve"); await incompletePage.waitForFunction(() => document.querySelector("#action-status")?.textContent.includes("noch nicht auswertbar"));
  const missing = await incompletePage.locator("#unclear").innerText(); ok(missing.includes("Hauptabsicht fehlt") && missing.includes("Zielort fehlt"), "incomplete request names every missing required field"); ok(missing.includes("Freitext") && missing.includes("Feld"), "incomplete request tells Founder where to correct it"); ok(missing.includes("pauschale Kandidatenauswertung") && missing.includes("nicht sinnvoll"), "incomplete request explains why evaluation is blocked"); equal(await incompletePage.locator("#evaluate").isDisabled(), true, "incomplete request cannot evaluate all five spots"); equal(await incompletePage.locator("#results").isHidden(), true, "incomplete request produces no candidate result"); await incompletePage.fill("#primary", "Essen"); await incompletePage.fill("#target-city", "Basel"); equal(await incompletePage.locator("#evaluate").isDisabled(), false, "Founder can complete the two named fields before evaluation"); await incompleteContext.close();
  const blockedResponse = await page.request.post(`${url}/api/evaluate`, { data: { text:"Ich suche einen Ort für mich und meine zwölfjährige Tochter.", tracking:false, deviceCity:"Basel", userMode:"NEUTRAL_MISSING", alternativeRequested:false, rejectedCandidateIds:[] } });
  equal(blockedResponse.status(), 400, "local evaluation endpoint rejects the incomplete request"); ok((await blockedResponse.json()).message.includes("phase3c_founder_lab_not_evaluable"), "server rejection carries the bounded evaluability reason");
  const founderCases = [];
  founderCases.push(await runFreshFounderCase({ label: "A · Composite Date", expected: { fields: { primaryIntent:"Essen", secondaryIntent:"In Ruhe reden", occasion:"Erstes Date", moods:"ruhig", targetCity:"Zurich", budget:"40", hardConstraints:"Maximales Budget", softPreferences:"gewünschte Stimmung" }, groups: { confirmed:0, fallback:0, notConfigured:0, ineligible:5 } } }));
  founderCases.push(await runFreshFounderCase({ label: "B · Familie & Alter", expected: { fields: { primaryIntent:"Essen", occasion:"Familie", targetCity:"Basel", companion:"Familie", minimumAge:"12", adultPresent:true, hardConstraints:"Altersregel" }, groups: { confirmed:1, fallback:0, notConfigured:4, ineligible:0 } } }));
  founderCases.push(await runFreshFounderCase({ label: "C · Accessibility", expected: { fields: { primaryIntent:"Kaffee", secondaryIntent:"In Ruhe reden", moods:"gemütlich", targetCity:"Basel", hardConstraints:"Rollstuhlgerechter Zugang" }, groups: { confirmed:1, fallback:4, notConfigured:0, ineligible:0 } } }));
  founderCases.push(await runFreshFounderCase({ label: "D · Location", setup: async (activePage) => { await activePage.check("#tracking"); await activePage.selectOption("#device-city", "Basel"); }, expected: { fields: { primaryIntent:"Essen", targetCity:"Zurich" }, groups: { confirmed:0, fallback:0, notConfigured:0, ineligible:5 } } }));
  await runPreset("D · Location"); equal(await page.inputValue("#target-city"), "Zurich", "main flow retains explicit target city");
  await page.click("#alternative"); await page.waitForFunction(() => document.querySelector("#action-status")?.textContent.includes("keine negative Spot-Aussage")); await page.click("#replay"); await page.waitForFunction(() => document.querySelector("#action-status")?.textContent.includes("byte-identisch")); await page.locator(".reject").first().click(); await page.waitForFunction(() => document.querySelector("#action-status")?.textContent.includes("neu ausgewertet")); await page.click("#replay"); await page.waitForFunction(() => document.querySelector("#action-status")?.textContent.includes("byte-identisch"));
  await page.click("#compare"); await page.click("#context-flip"); equal(await page.locator("#evaluate").isDisabled(),true,"context change invalidates prior interpretation"); await page.click("#resolve"); await page.click("#evaluate"); await page.waitForSelector("#comparison:not([hidden])"); ok((await page.locator("#comparison").innerText()).includes("Direkter Vergleich"), "comparison and context flip complete"); if(screenshotDirectory) await page.screenshot({path:path.join(screenshotDirectory,"04-context-flip-comparison.png"),fullPage:true});
  await page.click("#replay"); await page.waitForFunction(() => document.querySelector("#action-status")?.textContent.includes("byte-identisch")); if(screenshotDirectory) await page.screenshot({path:path.join(screenshotDirectory,"05-replay.png"),fullPage:true});
  await page.click("#expert"); const expert=await page.locator("#expert-data").innerText(); ok(expert.includes('"productionAuthorized": false')&&expert.includes('"writesUserIntelligence": false'), "expert boundaries visible"); ok(!expert.includes("Ich suche"), "raw request absent from result");
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForSelector("#cohort-file"); equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, "narrow layout has no horizontal overflow");
  page.once("dialog", dialog=>dialog.accept()); await page.click("#reset"); await page.waitForFunction(() => document.querySelector("#source-badge")?.textContent === "Synthetische Testwelt"); equal(fs.existsSync(path.join(stateDirectory,"active-cohort.json")),false,"reset only clears local file");
  const requests=[]; page.on("request",request=>requests.push(request.url())); await page.reload(); await page.waitForSelector("#source-badge"); equal(requests.some(requestUrl=>!requestUrl.startsWith(url)),false,"no external network request");
  process.stdout.write(`${JSON.stringify({ suite:"phase3c-founder-cohort-browser-e2e", scenarios:25, assertions, outcome:"PASS", localOnly:true, actualWorldExportBuilder:true, founderSpotCount:5, founderCases, screenshots:screenshotDirectory })}\n`);
} finally { await browser.close(); await new Promise((resolve)=>server.close(resolve)); }
