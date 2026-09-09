import { expect, test } from "@playwright/test";

test("Founder completes the guided Philipps Casa classification without technical knowledge", async ({ page }) => {
  await page.goto("/world-knowledge-prototype");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByText("PHILIPPS CASA BESCHREIBEN")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welchen Spot beschreibst du?" })).toBeVisible();
  await expect(page.getByText("Du musst nicht alles ausfüllen.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Analyse starten/ }).first()).toBeVisible();

  await page.getByRole("button", { name: /Art des Ortes/ }).click();
  await expect(page.getByRole("heading", { name: "Was für ein Ort ist Philipps Casa?" })).toBeVisible();
  await page.getByRole("button", { name: "Brasserie" }).click();
  await page.getByRole("button", { name: "Restaurant" }).click();
  await expect(page.locator(".wk-selected-chips")).toContainText("Brasserie");
  await expect(page.locator(".wk-selected-chips")).toContainText("Restaurant");
  await expect(page.getByText("2 Angaben ausgewählt")).toBeVisible();

  await page.getByRole("button", { name: /^Weiter/ }).click();
  await expect(page.getByRole("heading", { name: "Welche Küche und welches Angebot gibt es?" })).toBeVisible();
  await page.getByRole("button", { name: "Italian" }).click();
  await expect(page.locator(".wk-selected-chips")).toContainText("Italian");

  await page.getByRole("button", { name: /^Weiter/ }).click();
  await page.getByRole("button", { name: "Später ausfüllen" }).click();
  await expect(page.getByRole("heading", { name: "Was ermöglicht Philipps Casa konkret?" })).toBeVisible();
  await expect(page.locator(".wk-guide-steps small").filter({ hasText: "Später ausfüllen" })).toBeVisible();

  await page.getByRole("button", { name: /Art des Ortes/ }).click();
  await page.locator(".wk-selected-chips").getByRole("button", { name: /Brasserie.*entfernen/ }).click();
  await expect(page.locator(".wk-selected-chips")).not.toContainText("Brasserie");
  await expect(page.locator(".wk-selected-chips")).toContainText("Restaurant");

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.reload();
  await expect(page.getByText(/Gespeichert/).first()).toBeVisible();
  await page.getByRole("button", { name: /Art des Ortes/ }).click();
  await expect(page.locator(".wk-selected-chips")).toContainText("Restaurant");
  await expect(page.locator(".wk-selected-chips")).not.toContainText("Brasserie");

  await page.getByRole("button", { name: /Analyse starten/ }).first().click();
  await expect(page.getByRole("heading", { name: "Das weiß Backyrd über Philipps Casa." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Das ist bereits besonders nützlich" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hilfreiche Ergänzungen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Widersprüche" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Möglicherweise veraltet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "So wird der Spot aktuell übergeben" })).toBeVisible();

  await page.getByRole("button", { name: /Technische Vorschau öffnen/ }).click();
  await expect(page.getByRole("heading", { name: "Angaben und Quellen" })).toBeVisible();
  await page.getByRole("button", { name: "Vorschau für die Decision Engine" }).click();
  await expect(page.locator(".wk-json")).toContainText("WorldKnowledgePort.preview.v1");
  await expect(page.locator(".wk-json")).not.toContainText("OWNER_BASIC");
  await expect(page.locator(".wk-json")).not.toContainText("subscription");
});

test("standard flow stays usable on a narrow screen and hides internal vocabulary", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/world-knowledge-prototype");
  await expect(page.getByRole("heading", { name: "Welchen Spot beschreibst du?" })).toBeVisible();
  await page.getByRole("button", { name: /Art des Ortes/ }).click();
  await expect(page.getByRole("button", { name: "Brasserie" })).toBeVisible();
  const visibleText = await page.locator(".wk-guide-layout").innerText();
  for (const term of ["KNOWN_TRUE", "BOOLEAN", "ADMIN_OBSERVATION", "Confidence simulation", "Claim hinzufügen"]) {
    expect(visibleText).not.toContain(term);
  }
  await expect(page.getByRole("button", { name: /^Weiter/ })).toBeVisible();
});
