import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { startFounderLabUiServer } from "./phase3d-founder-lab-ui-server.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "phase3d-browser-e2e-"));
const statePath = path.join(directory, "state.json");
const { server, url } = await startFounderLabUiServer({ port: 0, statePath });
const browser = await chromium.launch({ headless: true });
let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const equal = (a, b, message) => { assert.equal(a, b, message); assertions += 1; };
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function createUser(label) { page.once("dialog", (dialog) => dialog.accept(label)); await page.click("#new-user"); await page.waitForFunction((expected) => document.querySelector("#user-status")?.textContent.includes(expected), label); }
async function newJourney(overrides = {}) { if (overrides.spot) await page.selectOption("#spot", overrides.spot); if (overrides.dayPhase) await page.selectOption("#day-phase", overrides.dayPhase); if (overrides.company) await page.selectOption("#company", overrides.company); await page.click("#new-journey"); await page.waitForFunction(() => document.querySelector("#journey-status")?.textContent.includes("Aktive Journey")); }
async function action(name) { const before = await page.locator(".timeline-item").count(); await page.click(`[data-action="${name}"]`); await page.waitForFunction((count) => document.querySelectorAll(".timeline-item").length > count, before); }
async function state() { return page.evaluate(() => fetch("/api/state").then((response) => response.json()).then(({ data }) => data)); }

try {
  await page.goto(url); equal(await page.title(), "Backyrd Founder User Lab", "UI title"); ok((await page.locator("body").innerText()).includes("NOT_PRODUCTION_AUTHORIZED"), "boundary label visible");

  // 1. Search pattern and reload
  await createUser("Search Muster"); await newJourney(); await page.fill("#search-text", "gemütliches Café am Vormittag"); await action("search");
  await newJourney({ spot: "fixture-cafe-bright" }); await action("search"); await newJourney({ spot: "fixture-bar-lively" }); await action("search");
  let current = await state(); equal(current.timeline.length, 3, "three browser searches"); equal(current.candidates[0].current.searchContextualTargets.length, 0, "conservative withholds"); equal(current.candidates[1].current.searchContextualTargets.length, 2, "balanced hypothetical maturity"); ok(!fs.readFileSync(statePath, "utf8").includes("gemütliches Café am Vormittag"), "raw search absent from storage");
  await page.reload(); await page.waitForSelector(".timeline-item"); equal(await page.locator(".timeline-item").count(), 3, "reload preserves without duplication");

  // 2. Familiarity
  await createUser("Familiarity"); await newJourney(); await action("visit"); ok(!(await page.locator("#interpretations").innerText()).includes("Drei unabhängige"), "one visit no familiarity");
  await newJourney(); await action("visit"); ok(!(await page.locator("#interpretations").innerText()).includes("Drei unabhängige"), "two visits no familiarity");
  await newJourney(); await action("visit"); ok((await page.locator("#interpretations").innerText()).includes("Drei unabhängige Besuche"), "third visit familiarity");

  // 3. Satisfaction and strongest signal
  await createUser("Satisfaction"); await newJourney(); await action("visit"); await action("review"); await action("matched"); current = await state(); equal(current.timeline.length, 3, "experience observations append-only"); equal(current.internalModel.interpretations.filter((item) => item.direction === "POSITIVE").length, 1, "strongest directed signal once");

  // 4. Negative situation
  await createUser("Negative Situation"); await newJourney(); await action("skip"); await action("notFit"); current = await state(); ok(current.internalModel.interpretations.every((item) => item.kind !== "AVERSION"), "no global aversion"); ok(current.internalModel.interpretations.some((item) => item.targetKey.includes(":decision:")), "context-bound target");

  // 5. Semantic conflict
  await createUser("Conflict"); await newJourney(); await action("visit"); await action("matched"); await newJourney(); await action("visit"); await action("notMatched"); current = await state(); equal(current.internalModel.conflicts.length, 1, "semantic conflict visible"); equal(current.internalModel.evaluationPreview.withheldConflictIds.length, 1, "conflict withheld");

  // 6. Dwell isolation
  await createUser("Dwell"); await newJourney(); await action("dwell"); current = await state(); ok(current.internalModel.interpretations.some((item) => item.kind === "INTERACTION_ATTENTION"), "attention visible"); equal(current.internalModel.evaluationPreview.items.length, 0, "dwell absent from preview"); equal(current.internalModel.productionProjection.items.length, 0, "production projection neutral");

  // 7. Retry and correction
  await createUser("Correction"); await newJourney(); await action("visit"); await action("matched"); await page.click('[data-special="retry"]'); await page.waitForFunction(() => document.querySelector("#notice")?.textContent.includes("dedupliziert")); equal((await state()).timeline.length, 2, "retry deduplicated"); await page.click('[data-special="correct"]'); await page.waitForFunction(() => document.querySelectorAll(".timeline-item").length === 3); current = await state(); equal(current.timeline[1].status, "CORRECTED", "append-only correction active");

  // 8. Rebuild and parity
  for (const mode of ["FULL", "INCREMENTAL", "REPLAY"]) { await page.click(`[data-rebuild="${mode}"]`); await page.waitForFunction((name) => document.querySelector("#integrity-status")?.textContent.includes(name === "INCREMENTAL" ? "Incremental" : name === "FULL" ? "Full" : "Replay"), mode); }
  current = await state(); equal(current.selectedUser.checkpoint.observationCount, 3, "checkpoint bound");

  // 9. Lifecycle: withdrawal, reset, erasure
  await page.click('[data-lifecycle="WITHDRAW"]'); await page.waitForSelector("#confirm-dialog[open]"); await page.click('#confirm-dialog button[value="confirm"]'); await page.waitForFunction(() => document.querySelector("#user-status")?.textContent.includes("Consent widerrufen")); current = await state(); equal(current.timeline.length, 0, "withdrawal removes observations"); equal(current.internalModel.interpretations.length, 0, "withdrawal removes model");
  await createUser("Erase Test"); await newJourney(); await action("save"); const userCount = (await state()).users.length; await page.click('[data-lifecycle="ERASE"]'); await page.waitForSelector("#confirm-dialog[open]"); await page.click('#confirm-dialog button[value="confirm"]'); await page.waitForFunction((count) => document.querySelectorAll("#user-select option").length === count, userCount); equal((await state()).users.length, userCount - 1, "erasure removes user");

  // 10. Narrow view remains operable
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForSelector("#new-user"); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1); equal(overflow, false, "no horizontal clipping on narrow viewport"); ok(await page.locator("#new-user").isVisible(), "central control visible on narrow viewport");

  process.stdout.write(JSON.stringify({ suite: "phase3d-founder-lab-browser-e2e", scenarios: 10, assertions, outcome: "PASS", url: "loopback-ephemeral" }) + "\n");
} finally {
  await browser.close(); await new Promise((resolve) => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true });
}
