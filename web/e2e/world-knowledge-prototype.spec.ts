import { expect, test } from "@playwright/test";

test("Founder erfasst Philipps Casa mit typisierten V3-Angaben", async ({ page }) => {
  test.setTimeout(90_000);
  const step = (label: string) => page.locator(".wk-guide-steps nav button").filter({ hasText: label });
  await page.goto("/world-knowledge-prototype");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole("heading", { name: "Philipps Casa erfassen" })).toBeVisible();
  await expect(page.getByText("Du musst nicht alles ausfüllen.")).toBeVisible();
  await page.getByLabel("Quartier").fill("Kreis 4");
  await page.getByLabel("Telefonnummer").fill("+41 44 555 01 23");
  await page.getByLabel("Webseite", { exact: true }).fill("https://philipps-casa.test");
  await page.getByLabel("Besonderheit").fill("Hausgemachte Spezialitäten und eine ruhige Terrasse.");
  await page.getByLabel("Preislevel").selectOption("$$");
  await expect(page.getByText("Art der Küche", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Kartenzahlung" }).click();
  await page.getByLabel("Ja", { exact: true }).check();
  await page.getByRole("button", { name: "Zeiten bestätigen" }).click();

  await step("Hauptkategorie").click();
  await page.getByRole("button", { name: "Eat", exact: true }).click();
  await expect(page.locator(".wk-category-choice [data-selected=true]")).toHaveCount(1);

  await step("Art des Ortes").click();
  for (const placeType of ["Brasserie", "Restaurant", "Pub", "Imbiss", "Take Away", "Fast-Food"]) await expect(page.getByRole("button", { name: placeType, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Brasserie", exact: true }).click();
  await page.getByRole("button", { name: "Restaurant", exact: true }).click();

  await step("Küche").click();
  await expect(page.getByRole("heading", { name: "Küchenrichtungen" })).toBeVisible();
  await page.getByRole("button", { name: "Italienisch", exact: true }).click();

  await step("Angebot und Stil").click();
  await expect(page.getByRole("heading", { name: "Bedienung und Service" })).toBeVisible();
  await page.getByRole("button", { name: /Service-Modell/ }).click();
  await page.getByRole("combobox", { name: "Auswahl" }).selectOption({ label: "Bedienung am Tisch" });
  await page.getByRole("button", { name: "Übernehmen" }).click();

  await step("Was kann man dort machen?").click();
  await expect(page.getByRole("heading", { name: "Essen und Trinken" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Frühstück", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Breakfast", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Abendessen", exact: true }).click();

  await step("Atmosphäre und Situationen").click();
  await expect(page.getByText("Hier stehen nur direkte, subjektive Eindrücke.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gruppengröße" })).toHaveCount(0);

  await page.getByRole("button", { name: "Später ausfüllen" }).click();
  await expect(page.getByRole("heading", { name: "Welche konkreten Fakten sollten Gäste vorher wissen?" })).toBeVisible();
  const search = page.getByLabel("In diesem Bereich suchen");
  await search.fill("Geeignete Gruppengröße");
  await page.getByRole("button", { name: /Geeignete Gruppengröße/ }).click();
  await page.getByLabel("Gruppen von").fill("2");
  await page.getByLabel("bis").fill("12");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.locator(".wk-selected-chips")).toContainText("2–12 Personen");
  await search.fill("Sitzplatzkapazität gesamt");
  await page.locator(".wk-option-wrap > button").filter({ hasText: "Sitzplatzkapazität gesamt" }).click();
  await page.locator(".wk-value-editor input[type=number]").fill("48");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await page.locator(".wk-option-wrap > button").filter({ hasText: "Sitzplatzkapazität gesamt" }).click();
  await page.locator(".wk-value-editor input[type=number]").fill("52");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await search.fill("Raumtypen");
  await page.getByRole("button", { name: /Raumtypen/ }).click();
  await page.getByLabel("Innenbereich").check();
  await page.getByLabel("Terrasse").check();
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await search.fill("Altersregel");
  await page.getByRole("button", { name: /Altersregel/ }).click();
  await page.getByLabel("Mindestalter").fill("18");
  await page.getByLabel("Gilt").selectOption("FROM_TIME");
  await page.getByLabel("Ab", { exact: true }).fill("22:00");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await search.fill("Küchenzeiten");
  await page.getByRole("button", { name: /Küchenzeiten/ }).click();
  await page.getByLabel("Montag").check();
  await page.getByLabel("Montag Küche bis").fill("21:30");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await search.fill("Reservationsregel");
  await page.getByRole("button", { name: /Reservationsregel/ }).click();
  await page.getByRole("group", { name: "Reservationsregel eingeben" }).getByRole("combobox").selectOption("CONDITIONAL");
  await page.getByLabel("Ab Gruppengröße").fill("8");
  await page.getByRole("button", { name: "Übernehmen" }).click();

  await step("Prüfen und analysieren").click();
  await expect(page.getByRole("heading", { name: "Was Backyrd aktuell speichern und verwenden kann." })).toBeVisible();
  await expect(page.getByText("Unverbindliche Datenvorschau – kein finales Spot-Design")).toBeVisible();
  await expect(page.locator(".wk-phone")).toContainText("Philipps Casa");
  await expect(page.locator(".wk-phone")).not.toContainText("Alkohol nur ab bestimmtem Alter");

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.reload();
  await expect(page.getByText(/Gespeichert/).first()).toBeVisible();
  await expect(page.getByLabel("Quartier")).toHaveValue("Kreis 4");

  await page.getByRole("button", { name: /Analyse starten/ }).first().click();
  await expect(page.getByRole("heading", { name: "Das weiß Backyrd über Philipps Casa." })).toBeVisible();
  await expect(page.getByText(/technische Katalogabdeckung/)).toBeVisible();
  await page.getByRole("button", { name: /Technische Vorschau öffnen/ }).click();
  await page.getByRole("button", { name: "Vorschau für die Decision Engine" }).click();
  await expect(page.locator(".wk-json")).toContainText('"version": "preview.v2"');
  await expect(page.locator(".wk-json")).not.toContainText("OWNER_BASIC");
  await expect(page.locator(".wk-json")).not.toContainText("subscription");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Analysepaket exportieren" }).click();
  await expect((await download).suggestedFilename()).toMatch(/^philipps-casa-analysis-.*\.json$/);
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
