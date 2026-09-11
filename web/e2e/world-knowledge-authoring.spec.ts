import { expect, test, type Page } from "@playwright/test";

const spotId = "41000000-0000-4000-8000-000000000001";
const allKeys = ["identity.name", "contact.phone", "classification.primary_category", "classification.place_types", "offering.cuisines", "operation.price_level", "operation.takeaway", "hours.regular", "hours.special", "hours.kitchen", "accessibility.accessible_toilet"];

async function mockWorld(page: Page, entitlement: "OWNER_BASIC" | "OWNER_PRO" = "OWNER_PRO") {
  const answers: Record<string, unknown> = { "identity.name": { claimId: "claim:name", claimHash: "a".repeat(64), knowledgeState: "KNOWN_VALUE", value: "Philipps Casa", observedAt: "2026-09-11T10:00:00.000Z", visibility: "PUBLIC", verificationMethod: "OWNER_CONFIRMED" } };
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/world_founder_list_spots_v1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ scope: "FOUNDER_EVALUATION_ONLY", spots: [{ spotId, name: "Philipps Casa", lifecycleStatus: "ACTIVE", scope: "FOUNDER_EVALUATION_ONLY", answerCount: Object.keys(answers).length, conflictCount: 0 }] }) }));
  await page.route("**/rest/v1/rpc/world_authoring_get_spot_v1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ scope: "FOUNDER_EVALUATION_ONLY", lifecycleStatus: "ACTIVE", spotId, fallbackName: "Philipps Casa", actor: { role: "VERIFIED_OWNER", entitlement, allowedAttributeKeys: entitlement === "OWNER_PRO" ? allKeys : allKeys.filter((key) => !key.startsWith("accessibility.")) }, answers, applicability: {}, reviewItems: [], manifest: null }) }));
  await page.route("**/rest/v1/rpc/world_owner_submit_claim_v1", async (route) => { const body = JSON.parse(route.request().postData() ?? "{}"); submissions.push(body); answers[body.p_attribute_key] = { claimId: `claim:${body.p_attribute_key}`, claimHash: "b".repeat(64), knowledgeState: body.p_knowledge_state, value: body.p_value, observedAt: body.p_observed_at, visibility: "PUBLIC", verificationMethod: "OWNER_CONFIRMED" }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ created: true, verificationMethod: "OWNER_CONFIRMED" }) }); });
  await page.route("**/rest/v1/rpc/world_authoring_set_applicability_v1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ created: true, applicability: "NOT_APPLICABLE" }) }));
  return { answers, submissions };
}

for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "schmale Owner-Ansicht", width: 390, height: 844 }]) {
  test(`Founder-Ablauf funktioniert in ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport); await mockWorld(page); await page.goto("/owner/world-knowledge");
    await expect(page.getByRole("heading", { name: "Philipps Casa" })).toBeVisible();
    await page.getByRole("button", { name: /2 Einordnung/ }).click();
    await expect(page.getByText("Wähle genau eine Hauptkategorie")).toBeVisible();
    await page.getByLabel("Hauptkategorie").selectOption("EAT");
    await page.getByRole("button", { name: "Brasserie" }).click();
    await page.getByRole("button", { name: "Restaurant" }).click();
    await page.getByRole("button", { name: /3 Küche und Angebot/ }).click();
    await page.getByRole("button", { name: "Italienisch" }).click();
    await page.getByRole("button", { name: /4 Preise und Bezahlung/ }).click();
    await page.getByLabel("Preislevel").selectOption("MEDIUM");
    await page.getByRole("button", { name: /8 Ausstattung und Einschränkungen/ }).click();
    await expect(page.getByText("Zugänglichkeit")).toBeVisible();
    await page.getByRole("button", { name: /9 Prüfen und Datenvorschau/ }).click();
    await expect(page.getByText("Das weiß Backyrd")).toBeVisible();
    await page.getByRole("button", { name: /Erweiterte Angaben und Quellen öffnen/ }).click();
    await expect(page.getByText("Technische Nachvollziehbarkeit")).toBeVisible();
  });
}

test("Basic Owner sieht Pro-Feld mit verständlicher Begründung gesperrt", async ({ page }) => {
  await mockWorld(page, "OWNER_BASIC"); await page.goto("/owner/world-knowledge"); await page.getByRole("button", { name: /8 Ausstattung und Einschränkungen/ }).click();
  await expect(page.getByText(/Owner-Pro-Umfang verfügbar/).first()).toBeVisible();
});

test("mehrere und über Nacht laufende Öffnungszeiten bleiben nach Reload kanonisch", async ({ page }) => {
  const world = await mockWorld(page); await page.goto("/owner/world-knowledge");
  await page.getByRole("button", { name: /5 Öffnungszeiten/ }).click();
  const regular = page.getByRole("group", { name: "Reguläre Öffnungszeiten" });
  await regular.getByRole("checkbox", { name: "Montag" }).check();
  await regular.getByRole("button", { name: "+ Weiteres Zeitfenster" }).click();
  await regular.getByLabel("Montag Intervall 2 von").fill("22:00");
  await regular.getByLabel("Montag Intervall 2 bis").fill("02:00");
  await regular.getByRole("button", { name: "Zeiten übernehmen" }).click();
  await expect.poll(() => world.submissions.length).toBe(1);
  expect(world.submissions[0].p_value).toEqual([{ day: "MONDAY", intervals: [{ start: "09:00", end: "18:00" }, { start: "22:00", end: "02:00" }] }]);
  await page.reload(); await page.getByRole("button", { name: /5 Öffnungszeiten/ }).click();
  await expect(page.getByLabel("Montag Intervall 2 bis")).toHaveValue("02:00");
});

test("ungültige Kontakte bleiben im Feld und erscheinen ohne Runtime-Overlay", async ({ page }) => {
  await mockWorld(page); await page.goto("/owner/world-knowledge");
  const phone = page.getByRole("group", { name: "Telefonnummer" });
  await phone.getByRole("textbox").fill("078 604 88 42");
  await phone.getByRole("button", { name: "Übernehmen" }).click();
  await expect(phone.getByRole("alert")).toContainText("internationale Format");
  await expect(phone.getByRole("textbox")).toHaveValue("078 604 88 42");
  await expect(page.getByText(/Unhandled Runtime Error|Application error/)).toHaveCount(0);
});
