import { expect, test, type Page, type Route } from "@playwright/test";

const spotId = "41000000-0000-4000-8000-000000000001";
const allKeys = ["identity.name", "contact.phone", "classification.primary_category", "classification.place_types", "offering.cuisines", "operation.price_level", "operation.takeaway", "hours.regular", "hours.special", "hours.kitchen", "hours.kitchen_special", "rule.age_access_conditions", "accessibility.accessible_toilet"];

async function mockWorld(page: Page, entitlement: "OWNER_BASIC" | "OWNER_PRO" = "OWNER_PRO", role: "VERIFIED_OWNER" | "ADMIN" = "VERIFIED_OWNER") {
  const answers: Record<string, unknown> = { "identity.name": { claimId: "claim:name", claimHash: "a".repeat(64), knowledgeState: "KNOWN_VALUE", value: "Philipps Casa", observedAt: "2026-09-11T10:00:00.000Z", visibility: "PUBLIC", verificationMethod: "OWNER_CONFIRMED" } };
  const submissions: Record<string, unknown>[] = [];
  const candidates: Record<string, unknown> = {};
  await page.route("**/rest/v1/rpc/world_founder_list_spots_v1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ scope: "FOUNDER_EVALUATION_ONLY", spots: [{ spotId, name: "Philipps Casa", lifecycleStatus: "ACTIVE", scope: "FOUNDER_EVALUATION_ONLY", answerCount: Object.keys(answers).length, conflictCount: 0 }] }) }));
  await page.route("**/rest/v1/rpc/world_authoring_get_spot_v1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ scope: "FOUNDER_EVALUATION_ONLY", lifecycleStatus: "ACTIVE", spotId, fallbackName: "Philipps Casa", actor: { role, entitlement, allowedAttributeKeys: entitlement === "OWNER_PRO" ? allKeys : allKeys.filter((key) => !key.startsWith("accessibility.")) }, answers, applicability: {}, reviewItems: [], manifest: null }) }));
  await page.route("**/rest/v1/rpc/world_authoring_get_taxonomy_candidates_v1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(candidates) }));
  await page.route("**/rest/v1/rpc/world_authoring_get_section_reviews_v1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ spotId, reviewedSections: [] }) }));
  await page.route("**/rest/v1/rpc/world_authoring_set_section_review_v1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ created: true }) }));
  await page.route("**/rest/v1/rpc/world_authoring_submit_taxonomy_candidate_v1", async (route) => { const body = JSON.parse(route.request().postData() ?? "{}"); candidates[body.p_attribute_key] = { candidateId: "candidate:place-types", primaryCategory: body.p_primary_category, value: body.p_candidate_value, taxonomyVersion: body.p_taxonomy_version, occurredAt: "2026-09-12T10:00:00.000Z", engineAuthorized: false }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ created: true, engineAuthorized: false }) }); });
  const submitClaim = async (route: Route) => { const body = JSON.parse(route.request().postData() ?? "{}"); submissions.push(body); answers[body.p_attribute_key] = { claimId: `claim:${body.p_attribute_key}`, claimHash: "b".repeat(64), knowledgeState: body.p_knowledge_state, value: body.p_value, observedAt: body.p_observed_at, visibility: "PUBLIC", verificationMethod: role === "ADMIN" ? "ADMIN_CONFIRMED" : "OWNER_CONFIRMED" }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ created: true, verificationMethod: role === "ADMIN" ? "ADMIN_CONFIRMED" : "OWNER_CONFIRMED" }) }); };
  await page.route("**/rest/v1/rpc/world_owner_submit_claim_v1", submitClaim);
  await page.route("**/rest/v1/rpc/world_admin_submit_claim_v1", submitClaim);
  await page.route("**/rest/v1/rpc/world_authoring_set_applicability_v1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ created: true, applicability: "NOT_APPLICABLE" }) }));
  return { answers, submissions, candidates };
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
    await page.getByRole("button", { name: "Auswahl übernehmen" }).click();
    await page.getByRole("button", { name: /3 Küche und Angebot/ }).click();
    const cuisines = page.getByRole("group", { name: "Küchenrichtungen" });
    await cuisines.getByRole("button", { name: "Italienisch" }).click();
    await cuisines.getByRole("button", { name: "Auswahl übernehmen" }).click();
    await page.getByRole("button", { name: /4 Preise und Bezahlung/ }).click();
    await page.getByLabel("Preislevel").selectOption("MEDIUM");
    await page.getByRole("button", { name: /7 Ausstattung und Einschränkungen/ }).click();
    await expect(page.getByText("Zugänglichkeit")).toBeVisible();
    await page.getByRole("button", { name: /8 Prüfen und Datenvorschau/ }).click();
    await expect(page.getByText("Das weiß Backyrd")).toBeVisible();
    await page.getByRole("button", { name: /Erweiterte Angaben und Quellen öffnen/ }).click();
    await expect(page.getByText("Technische Nachvollziehbarkeit")).toBeVisible();
  });
}

test("Basic Owner sieht Pro-Feld mit verständlicher Begründung gesperrt", async ({ page }) => {
  await mockWorld(page, "OWNER_BASIC"); await page.goto("/owner/world-knowledge"); await page.getByRole("button", { name: /7 Ausstattung und Einschränkungen/ }).click();
  await expect(page.getByText(/Owner-Pro-Umfang verfügbar/).first()).toBeVisible();
});

test("Admin speichert über die getrennte serverseitige Admin-Grenze", async ({ page }) => {
  const world = await mockWorld(page, "OWNER_PRO", "ADMIN"); await page.goto("/owner/world-knowledge");
  await page.getByRole("button", { name: /4 Preise und Bezahlung/ }).click();
  await page.getByLabel("Preislevel").selectOption("HIGH");
  await expect.poll(() => world.submissions.length).toBe(1);
  expect(world.submissions[0].p_attribute_key).toBe("operation.price_level");
});

for (const [category, expectedType] of [["EAT", "Restaurant"], ["DRINKS", "Bar"], ["COFFEE_DAYTIME", "Café"]] as const) {
  test(`${category} speichert nur den passenden kanonischen Ortstyp`, async ({ page }) => {
    const world = await mockWorld(page); await page.goto("/owner/world-knowledge");
    await page.getByRole("button", { name: /2 Einordnung/ }).click();
    await page.getByLabel("Hauptkategorie").selectOption(category);
    await page.getByRole("group", { name: "Art des Ortes" }).getByRole("button", { name: expectedType, exact: true }).click();
    await page.getByRole("group", { name: "Art des Ortes" }).getByRole("button", { name: "Auswahl übernehmen" }).click();
    await expect.poll(() => world.submissions.some((entry) => entry.p_attribute_key === "classification.place_types")).toBe(true);
  });
}

test("mehrere und über Nacht laufende Öffnungszeiten bleiben nach Reload kanonisch", async ({ page }) => {
  const world = await mockWorld(page); await page.goto("/owner/world-knowledge");
  await page.getByRole("button", { name: /5 Öffnungszeiten/ }).click();
  const regular = page.getByRole("group", { name: "Reguläre Öffnungszeiten" });
  await regular.getByLabel("Montag Status").selectOption("OPEN");
  await regular.getByRole("button", { name: "+ Weiteres Zeitfenster" }).click();
  await regular.getByLabel("Montag Intervall 2 von").fill("22:00");
  await regular.getByLabel("Montag Intervall 2 bis").fill("02:00");
  await regular.getByRole("button", { name: "Zeiten übernehmen" }).click();
  await expect.poll(() => world.submissions.length).toBe(1);
  expect(world.submissions[0].p_value).toEqual([{ day: "MONDAY", intervals: [{ start: "09:00", end: "18:00" }, { start: "22:00", end: "02:00" }] }]);
  await page.reload(); await page.getByRole("button", { name: /5 Öffnungszeiten/ }).click();
  await expect(page.getByLabel("Montag Intervall 2 bis")).toHaveValue("02:00");
});

for (const [category, expectedType] of [["ACTIVITIES_PLAY", "Escape Room"], ["ENTERTAINMENT", "Kino"], ["CULTURE_ARTS", "Museum"], ["OUTDOOR_NATURE", "Park"], ["STAY", "Hotel"]] as const) {
  test(`${category} zeigt und speichert den passenden kanonischen Ortstyp`, async ({ page }) => {
    const world = await mockWorld(page); await page.goto("/owner/world-knowledge");
    await page.getByRole("button", { name: /2 Einordnung/ }).click();
    await page.getByLabel("Hauptkategorie").selectOption(category);
    await expect(page.getByRole("button", { name: "Restaurant" })).toHaveCount(0);
    const placeTypes = page.getByRole("group", { name: "Art des Ortes" });
    await placeTypes.getByRole("button", { name: new RegExp(expectedType) }).click();
    await placeTypes.getByRole("button", { name: "Auswahl übernehmen" }).click();
    await expect.poll(() => world.submissions.some((entry) => entry.p_attribute_key === "classification.place_types")).toBe(true);
  });
}

test("Küchenzeiten bleiben getrennt und können den regulären Plan bewusst übernehmen", async ({ page }) => {
  const world = await mockWorld(page); await page.goto("/owner/world-knowledge");
  await page.getByRole("button", { name: /5 Öffnungszeiten/ }).click();
  const regular = page.getByRole("group", { name: "Reguläre Öffnungszeiten" });
  await regular.getByLabel("Dienstag Status").selectOption("OPEN");
  await regular.getByLabel("Dienstag Intervall 1 von").fill("17:00");
  await regular.getByLabel("Dienstag Intervall 1 bis").fill("22:00");
  await regular.getByRole("button", { name: "Zeiten übernehmen" }).click();
  await expect.poll(() => world.submissions.some((entry) => entry.p_attribute_key === "hours.regular")).toBe(true);
  await page.getByRole("group", { name: "Küchenzeiten" }).getByRole("button", { name: "Wie reguläre Öffnungszeiten" }).click();
  await expect.poll(() => world.submissions.filter((entry) => entry.p_attribute_key === "hours.kitchen").length).toBe(1);
  expect(world.submissions.find((entry) => entry.p_attribute_key === "hours.kitchen")?.p_value).toEqual(world.submissions.find((entry) => entry.p_attribute_key === "hours.regular")?.p_value);
});

test("Altersregeln speichern Mindestalter, Begleitung, Zeit, Tage und Bereich strukturiert", async ({ page }) => {
  const world = await mockWorld(page); await page.goto("/owner/world-knowledge");
  await page.getByRole("button", { name: /7 Ausstattung und Einschränkungen/ }).click();
  const age = page.getByRole("group", { name: "Alters- und Begleitregeln" });
  await age.getByLabel("Art der Regel").selectOption("UNACCOMPANIED_MINIMUM");
  await age.getByLabel("Mindestalter").fill("16");
  await age.getByLabel("Gilt ab Uhrzeit \(optional\)").fill("20:00");
  await age.getByRole("button", { name: "Fr" }).click();
  await age.getByLabel("Bereich \(optional\)").fill("Barbereich");
  await age.getByRole("button", { name: "Regel übernehmen" }).click();
  await expect.poll(() => world.submissions.some((entry) => entry.p_attribute_key === "rule.age_access_conditions")).toBe(true);
  const value = world.submissions.find((entry) => entry.p_attribute_key === "rule.age_access_conditions")?.p_value as { rules: unknown[] };
  expect(value.rules).toEqual([{ mode: "UNACCOMPANIED_MINIMUM", minimumAge: 16, accompaniment: "ADULT", appliesFromTime: "20:00", days: ["FRIDAY"], area: "Barbereich", event: null }]);
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
