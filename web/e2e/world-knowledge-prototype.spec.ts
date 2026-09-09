import { expect, test } from "@playwright/test";

test("Founder can classify, author, resolve, analyze, persist and export Philipps Casa", async ({ page }) => {
  await page.goto("/world-knowledge-prototype");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole("heading", { name: "Philipps Casa", exact: true }).first()).toBeVisible();
  await expect(page.locator(".wk-category-choice")).toHaveCount(16);

  await page.getByRole("button", { name: "Drinks", exact: true }).click();
  await expect(page.locator('.wk-category-choice[data-primary="true"]')).toContainText("Drinks");
  const eat = page.locator(".wk-category-choice").filter({ hasText: "Eat" });
  await eat.getByRole("checkbox").check();
  await expect(eat).toHaveAttribute("data-secondary", "true");

  await page.getByRole("button", { name: "Verified Owner Basic" }).click();
  await page.getByRole("searchbox").fill("Typisches Geräuschniveau");
  await page.locator(".wk-definition").first().click();
  await expect(page.getByText("In dieser Draft-Rolle gesperrt")).toBeVisible();
  await page.getByRole("button", { name: "Editor schließen" }).click();

  await page.getByRole("button", { name: "Admin", exact: true }).click();
  for (const label of ["WLAN", "Steckdosen"]) {
    await page.getByRole("searchbox").fill(label);
    await page.locator(".wk-definition").first().click();
    await page.getByRole("button", { name: "Claim hinzufügen" }).click();
  }
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.reload();
  await expect(page.getByText(/Lokal gespeichert/)).toBeVisible();

  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await expect(page.getByText("Geeignet zum Arbeiten")).toBeVisible();
  await expect(page.getByText(/WLAN = true.*Steckdosen = true/)).toBeVisible();

  await page.getByRole("button", { name: /Analyse starten/ }).first().click();
  await expect(page.getByRole("heading", { name: /qualitative Vorprüfung/ })).toBeVisible();
  await expect(page.getByText("Darf Engine nicht erhalten")).toBeVisible();

  await page.getByRole("button", { name: "Engine Snapshot", exact: true }).click();
  const snapshot = page.locator(".wk-json");
  await expect(snapshot).toContainText("WorldKnowledgePort.preview.v1");
  await expect(snapshot).not.toContainText("OWNER_BASIC");
  await expect(snapshot).not.toContainText("subscription");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(await download).toBeTruthy();
});
