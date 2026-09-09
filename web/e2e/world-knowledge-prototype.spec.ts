import { expect, test } from "@playwright/test";

test("Founder erfasst Philipps Casa geführt und prüft die mobile Vorschau", async ({ page }) => {
  await page.goto("/world-knowledge-prototype");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole("heading", { name: "Philipps Casa erfassen" })).toBeVisible();
  await expect(page.getByText("Du musst nicht alles ausfüllen.")).toBeVisible();
  await expect(page.getByLabel(/^Name/)).toHaveValue("Philipps Casa");
  await expect(page.getByLabel("Webseite", { exact: true })).toHaveCount(1);
  await page.getByLabel("Quartier").fill("Kreis 4");
  await page.getByLabel("Telefonnummer").fill("+41 44 555 01 23");
  await page.getByLabel("Webseite", { exact: true }).fill("https://philipps-casa.test");
  await page.getByLabel("Besonderheit").fill("Hausgemachte Spezialitäten und eine ruhige Terrasse.");
  await page.getByLabel("Preislevel").selectOption("$$");
  await expect(page.getByText("Art der Küche", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Kartenzahlung" }).click();
  await page.getByLabel("Ja", { exact: true }).check();
  await page.getByRole("button", { name: "Sondertag hinzufügen" }).click();
  await page.getByLabel("Name des Sondertags").fill("Neujahr");

  await page.getByRole("button", { name: /Art des Ortes/ }).click();
  for (const placeType of ["Brasserie", "Restaurant", "Pub", "Imbiss", "Take Away", "Fast-Food"]) {
    await expect(page.getByRole("button", { name: placeType, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Brasserie", exact: true }).click();
  await page.getByRole("button", { name: "Restaurant", exact: true }).click();
  await page.getByRole("button", { name: "Pub", exact: true }).click();
  await expect(page.locator(".wk-selected-chips")).toContainText("Brasserie");

  await page.getByRole("button", { name: /Küche und Angebot/ }).click();
  await expect(page.getByRole("heading", { name: "Art der Küche" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Angebot und Stil" })).toBeVisible();
  await page.getByRole("button", { name: "Italienisch", exact: true }).click();

  await page.getByRole("button", { name: /Was kann man dort machen/ }).click();
  await expect(page.getByRole("heading", { name: "Essen und Trinken" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Frühstück", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Breakfast", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Praktisch beim Besuch" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gemeinsam und sozial" })).toBeVisible();

  await page.getByRole("button", { name: /Atmosphäre und Situation/ }).click();
  await expect(page.getByRole("heading", { name: "Dauer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gruppengröße" })).toBeVisible();

  await page.getByRole("button", { name: /Ausstattung und Einschränkungen/ }).click();
  await expect(page.getByRole("heading", { name: "Barrierefreiheit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Komfort und Infrastruktur" })).toBeVisible();
  await page.getByRole("button", { name: "Terrasse", exact: true }).click();
  const areaSearch = page.getByLabel("In diesem Bereich suchen");
  await areaSearch.fill("Geeignete Gruppengröße");
  await page.getByRole("button", { name: /Geeignete Gruppengröße/ }).click();
  await page.getByLabel("Gruppen von").fill("2");
  await page.getByLabel("bis").fill("12");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.locator(".wk-selected-chips")).toContainText("2–12 Personen");
  await areaSearch.fill("Raumtypen");
  await page.getByRole("button", { name: /Raumtypen/ }).click();
  await page.getByLabel("Innenraum").check();
  await page.getByLabel("Separee").check();
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await areaSearch.fill("Strukturierter Raumplan");
  await expect(page.getByText("Strukturierter Raumplan", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /Vorschau und Analyse/ }).click();
  await expect(page.getByRole("heading", { name: "So könnte Philipps Casa in der App aussehen" })).toBeVisible();
  await expect(page.locator(".wk-phone")).toContainText("Philipps Casa");
  await expect(page.locator(".wk-phone")).toContainText("Brasserie · Pub · Restaurant");
  await expect(page.locator(".wk-phone")).toContainText("Kreis 4");
  await expect(page.locator(".wk-phone")).toContainText("Heute");
  await expect(page.locator(".wk-phone")).toContainText("Hausgemachte Spezialitäten und eine ruhige Terrasse.");
  await expect(page.locator(".wk-phone")).not.toContainText("Alkohol nur ab bestimmtem Alter");

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.reload();
  await expect(page.getByText(/Gespeichert/).first()).toBeVisible();
  await expect(page.getByLabel("Quartier")).toHaveValue("Kreis 4");

  await page.getByRole("button", { name: /Analyse starten/ }).first().click();
  await expect(page.getByRole("heading", { name: "Das weiß Backyrd über Philipps Casa." })).toBeVisible();
  await page.getByRole("button", { name: /Technische Vorschau öffnen/ }).click();
  await page.getByRole("button", { name: "Vorschau für die Decision Engine" }).click();
  await expect(page.locator(".wk-json")).toContainText("WorldKnowledgePort.preview.v1");
  await expect(page.locator(".wk-json")).not.toContainText("OWNER_BASIC");
  await expect(page.locator(".wk-json")).not.toContainText("subscription");
});

test("der Standardweg bleibt auf schmalen Bildschirmen verständlich", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/world-knowledge-prototype");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Philipps Casa erfassen" })).toBeVisible();
  await page.getByRole("button", { name: /Art des Ortes/ }).click();
  await expect(page.getByRole("button", { name: "Brasserie", exact: true })).toBeVisible();
  const visibleText = await page.locator(".wk-guide-layout").innerText();
  for (const term of ["KNOWN_TRUE", "BOOLEAN", "ADMIN_OBSERVATION", "Confidence simulation", "Claim hinzufügen", "Weitere passende Kategorien"]) expect(visibleText).not.toContain(term);
  await expect(page.getByRole("button", { name: /^Weiter/ })).toBeVisible();
});
