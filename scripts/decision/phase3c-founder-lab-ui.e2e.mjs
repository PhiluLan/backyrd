import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { startPhase3CFounderLabServer } from "./phase3c-founder-lab-ui-server.mjs";

const { server, url } = await startPhase3CFounderLabServer({ port: 0 });
const browser = await chromium.launch({ headless: true }); let assertions = 0;
const equal = (a, b, message) => { assert.equal(a, b, message); assertions += 1; }; const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(8_000);
page.on("pageerror", (error) => process.stderr.write(`browser_page_error:${error.message}\n`));
try {
  await page.goto(url); equal(await page.title(), "Backyrd Founder Decision Lab", "German Founder UI title");
  const body = await page.locator("body").innerText(); ok(body.includes("EVALUATION ONLY"), "evaluation boundary visible"); ok(body.includes("kein User-Write"), "User boundary visible");
  await page.fill("#task", "Ich suche in Zürich ein ruhiges Restaurant für ein erstes Date, höchstens 40 CHF pro Person."); await page.check("#tracking"); await page.selectOption("#device-city", "Basel"); await page.click("#resolve"); await page.waitForSelector("#interpretation:not([hidden])");
  equal(await page.inputValue("#primary"), "context.intent.food", "intent resolved"); equal(await page.inputValue("#occasion"), "context.occasion.first-date", "occasion resolved"); equal(await page.inputValue("#target-city"), "Zurich", "explicit target wins"); equal(await page.inputValue("#budget"), "40", "budget retained");
  await page.fill("#moods", "context.mood.quiet\ncontext.mood.cozy"); await page.click("#evaluate"); await page.waitForSelector("#results:not([hidden])");
  const summary = await page.locator("#summary").innerText(); ok(summary.includes("Synthetische Testwelt"), "fallback clearly labelled"); const resultText = await page.locator("#candidate-groups").innerText(); ok(resultText.includes("Passt nach bestätigten Angaben"), "confirmed tier translated"); ok(resultText.includes("Könnte passen"), "unknown fallback translated"); ok(resultText.includes("nicht als Nein behandelt"), "unknown is not false");
  await page.click("#replay"); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("Replay byte-identisch"));
  await page.click("#expert"); const expert = await page.locator("#expert-data").innerText(); ok(expert.includes('"productionAuthorized": false'), "production disabled in expert view"); ok(expert.includes('"writesUserIntelligence": false'), "no User write"); ok(!expert.includes("Ich suche"), "raw text absent from result");
  await page.click("#alternative"); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("kein negatives Signal"));
  await page.locator(".reject").first().click(); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("kein User-Intelligence-Write"));
  await page.reload(); equal(await page.locator("#results").getAttribute("hidden"), "", "reload retains no result state");
  await page.fill("#task", "Lebhafte Bar in Zürich mit Freunden"); await page.click("#resolve"); await page.waitForSelector("#interpretation:not([hidden])"); equal(await page.inputValue("#primary"), "context.intent.drinks", "context flip intent"); ok((await page.inputValue("#moods")).includes("context.mood.lively"), "context flip mood");
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForSelector("#resolve"); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1); equal(overflow, false, "narrow layout has no horizontal overflow"); ok(await page.locator("#resolve").isVisible(), "primary action remains visible");
  process.stdout.write(`${JSON.stringify({ suite: "phase3c-founder-decision-lab-browser-e2e", scenarios: 7, assertions, outcome: "PASS", localOnly: true })}\n`);
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
