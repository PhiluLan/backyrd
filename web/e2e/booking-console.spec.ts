import { expect, test, type Page } from "@playwright/test";
import type { BookingSetup, BookingSnapshot } from "../lib/booking-api";

const spot = "51000000-0000-4000-8000-000000000001";
const owner = "51000000-0000-4000-8000-000000000099";
const reservationId = "51000000-0000-4000-8000-000000000020";
const area1 = "51000000-0000-4000-8000-000000000030";
const area2 = "51000000-0000-4000-8000-000000000031";
const table1 = "51000000-0000-4000-8000-000000000040";
const table2 = "51000000-0000-4000-8000-000000000041";
const dinner = "51000000-0000-4000-8000-000000000050";
const lunch = "51000000-0000-4000-8000-000000000051";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
});

test("service lifecycle records arrival, seating and departure across reloads on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, lifecycle: true });
  await page.goto("/booking/console");
  const openGuest = () => page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" }).click();
  await openGuest();
  const panel = page.getByRole("dialog", { name: "Reservierung", exact: true });
  await panel.getByRole("button", { name: "Gast angekommen", exact: true }).click();
  await panel.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Am Tisch platzieren", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Nicht erschienen", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Am Tisch platzieren", exact: true }).click();
  await panel.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Besuch beenden", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Stornieren", exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("service-phone.png") });
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await expect(page.getByRole("button", { name: "18:00 · Testgast Abend 2 Personen · Am Tisch" })).toBeVisible();
  await page.getByRole("button", { name: "Reservierungsbuch", exact: true }).click();
  await openGuest();
  await panel.getByRole("button", { name: "Besuch beenden", exact: true }).click();
  await panel.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(panel.getByText("Besuch beendet", { exact: true })).toHaveCount(2);
  await expect(panel.getByRole("button", { name: "Gast angekommen", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await expect(page.getByRole("button", { name: /18:00 · Testgast Abend/ })).toHaveCount(0);
  expect(fixture.statusRequests()).toEqual([
    { p_spot_id: spot, p_reservation_id: reservationId, p_expected_status: "confirmed", p_status: "arrived" },
    { p_spot_id: spot, p_reservation_id: reservationId, p_expected_status: "arrived", p_status: "seated" },
    { p_spot_id: spot, p_reservation_id: reservationId, p_expected_status: "seated", p_status: "completed" },
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("lifecycle controls require a backend capability and the booking's service day", async ({ page }) => {
  await mockConsole(page, { seeded: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" }).click();
  await expect(page.getByRole("button", { name: "Gast angekommen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reservierung bearbeiten", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.unroute("**/rest/v1/rpc/*");
  await mockConsole(page, { seeded: true, lifecycle: true });
  await page.clock.setFixedTime(new Date("2026-10-19T12:00:00Z"));
  await page.reload();
  await page.getByLabel("Datum · Europe/Zurich").fill("2026-10-20");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" }).click();
  await expect(page.getByRole("button", { name: "Gast angekommen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Am Tisch platzieren", exact: true })).toHaveCount(0);
});

test("service status conflicts preserve the saved state and uncertain retries retain compare-and-set", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, lifecycle: true, uncertainStatus: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" }).click();
  const panel = page.getByRole("dialog", { name: "Reservierung", exact: true });
  await panel.getByRole("button", { name: "Gast angekommen", exact: true }).click();
  await panel.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.getByText("Bestätigt", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Am Tisch platzieren", exact: true })).toBeVisible();
  expect(fixture.statusRequests()[0]).toEqual(fixture.statusRequests()[1]);
});

test("a concurrent status update never shows a successful local service transition", async ({ page }) => {
  await mockConsole(page, { seeded: true, lifecycle: true, statusConflict: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" }).click();
  const panel = page.getByRole("dialog", { name: "Reservierung", exact: true });
  await panel.getByRole("button", { name: "Gast angekommen", exact: true }).click();
  await panel.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText("Die Reservierung wurde inzwischen geändert. Bitte neu laden.");
  await expect(panel.getByText("Bestätigt", { exact: true })).toBeVisible();
  await expect(page.getByText("Der Status wurde gespeichert.", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Reservierung neu laden", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Gast angekommen", exact: true })).toBeVisible();
});

async function editGuest(page: Page) {
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" }).click();
  await page.getByRole("button", { name: "Reservierung bearbeiten", exact: true }).click();
  return page.getByRole("dialog", { name: "Reservierung bearbeiten", exact: true });
}

test("guest corrections preserve allocation, survive reload and protect unsaved phone edits", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, amendments: true });
  await page.goto("/booking/console");
  const panel = await editGuest(page);
  await panel.getByLabel("Gastname", { exact: true }).fill("Korrigierter Testgast");
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  await expect(panel.getByLabel("Gastname", { exact: true })).toHaveValue("Korrigierter Testgast");
  await panel.getByLabel("Telefon oder E-Mail (optional)").fill("korrigiert@invalid");
  await panel.getByLabel("Interner Hinweis (optional)").fill("Geänderter synthetischer Hinweis");
  await panel.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(page.getByText("Die Änderungen wurden gespeichert.", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Reservierung", exact: true }).getByText("Korrigierter Testgast", { exact: true })).toBeVisible();
  expect(fixture.amendParties()).toEqual([]);
  expect(fixture.amendRequests()[0]).toMatchObject({ p_reservation_id: reservationId, p_expected_revision: 0, p_table_id: table1, p_party_size: 2, p_duration_minutes: 120, p_starts_at: "2026-10-20T18:00:00+02:00", p_guest_name: "Korrigierter Testgast" });
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Reservierung von Korrigierter Testgast öffnen" }).click();
  await expect(page.getByText("Geänderter synthetischer Hinweis", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("rescheduling changes date, duration, party and table atomically and retains the workspace context", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, amendments: true });
  await page.goto("/booking/console");
  await page.getByRole("combobox", { name: "Bereich", exact: true }).selectOption(area1);
  await page.getByRole("combobox", { name: "Service", exact: true }).selectOption(dinner);
  const panel = await editGuest(page);
  await panel.getByRole("checkbox", { name: "Zeit, Personen oder Tisch ändern" }).check();
  await panel.getByLabel("Personen", { exact: true }).fill("");
  await expect(panel.getByLabel("Personen", { exact: true })).toHaveValue("");
  await panel.getByLabel("Personen", { exact: true }).fill("4");
  await panel.getByLabel("Dauer in Minuten", { exact: true }).fill("");
  await expect(panel.getByLabel("Dauer in Minuten", { exact: true })).toHaveValue("");
  await panel.getByLabel("Dauer in Minuten", { exact: true }).fill("90");
  await panel.getByLabel("Buchungsdatum", { exact: true }).fill("2026-10-21");
  await panel.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "19:00" });
  await panel.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
  await panel.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" })).toBeVisible();
  await expect(page.getByLabel("Datum · Europe/Zurich")).toHaveValue("2026-10-21");
  await expect(page.getByRole("combobox", { name: "Bereich", exact: true })).toHaveValue(area2);
  await expect(page.getByRole("combobox", { name: "Service", exact: true })).toHaveValue(dinner);
  expect(fixture.amendRequests()[0]).toMatchObject({ p_table_id: table2, p_party_size: 4, p_duration_minutes: 90, p_starts_at: "2026-10-21T19:00:00+02:00" });
  await page.getByLabel("Datum · Europe/Zurich").fill("2026-10-20");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" })).toHaveCount(0);
});

test("arrived guests allow contact correction, while allocation and completed visits stay protected", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, amendments: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" }).click();
  let panel = page.getByRole("dialog", { name: "Reservierung", exact: true });
  await panel.getByRole("button", { name: "Gast angekommen", exact: true }).click();
  await panel.getByRole("button", { name: "Status speichern", exact: true }).click();
  await panel.getByRole("button", { name: "Reservierung bearbeiten", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Reservierung bearbeiten", exact: true });
  await expect(editor.getByRole("checkbox", { name: "Zeit, Personen oder Tisch ändern" })).toHaveCount(0);
  await editor.getByLabel("Telefon oder E-Mail (optional)").fill("am-tisch@invalid");
  await editor.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  panel = page.getByRole("dialog", { name: "Reservierung", exact: true });
  await expect(panel.getByText("Angekommen", { exact: true })).toHaveCount(2);
  expect(fixture.amendRequests()[0]).toMatchObject({ p_expected_revision: 1, p_table_id: table1, p_guest_contact: "am-tisch@invalid" });
  await panel.getByRole("button", { name: "Am Tisch platzieren", exact: true }).click();
  await panel.getByRole("button", { name: "Status speichern", exact: true }).click();
  await panel.getByRole("button", { name: "Besuch beenden", exact: true }).click();
  await panel.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(panel.getByText("Besuch beendet", { exact: true })).toHaveCount(2);
  await expect(panel.getByRole("button", { name: "Reservierung bearbeiten", exact: true })).toHaveCount(0);
});

test("unclosed prior visits stay visible outside time filters and block seating until explicitly completed", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await mockConsole(page, { seeded: true, amendments: true, unclosed: true });
  await page.goto("/booking/console");
  const queue = page.getByRole("region", { name: "Offene Besuche früherer Tage" });
  await expect(queue.getByRole("button", { name: "Testgast Vorabend · Fenster 1 · 2026-10-19" })).toBeVisible();
  await queue.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("unclosed-phone.png") });
  await expect(page.getByLabel("Buchungsübersicht der Auswahl").getByText("3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" }).click();
  const details = page.getByRole("dialog", { name: "Reservierung", exact: true });
  await details.getByRole("button", { name: "Am Tisch platzieren", exact: true }).click();
  await details.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(details.getByRole("alert")).toContainText("noch ein Besuch als «Am Tisch» erfasst");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await page.getByLabel("Belegung um", { exact: true }).fill("21:00");
  await page.getByRole("button", { name: "Laufenden Besuch von Testgast Vorabend öffnen" }).click();
  await expect(details.getByText("Testgast Vorabend", { exact: true })).toBeVisible();
  await expect(details.getByText(/19\. Oktober 2026/)).toBeVisible();
  await details.getByRole("button", { name: "Besuch beenden", exact: true }).click();
  await details.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(queue).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Laufenden Besuch von Testgast Vorabend öffnen" })).toHaveCount(0);
  await expect(page.getByLabel("Belegung um", { exact: true })).toHaveValue("21:00");
  await page.getByRole("button", { name: "Reservierungsbuch", exact: true }).click();
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" }).click();
  await details.getByRole("button", { name: "Am Tisch platzieren", exact: true }).click();
  await details.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(details.getByRole("button", { name: "Besuch beenden", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await expect(page.getByRole("button", { name: "Laufenden Besuch von Testgast Abend öffnen" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const failure of ["amendSlotConflict", "uncertainAmend"] as const) {
  test("amendments retain input and request identity after " + failure, async ({ page }) => {
    const fixture = await mockConsole(page, { seeded: true, amendments: true, longSession: failure === "uncertainAmend", [failure]: true });
    await page.goto("/booking/console");
    const panel = await editGuest(page);
    await panel.getByLabel("Gastname", { exact: true }).fill("Umbuchung Testgast");
    await panel.getByRole("checkbox", { name: "Zeit, Personen oder Tisch ändern" }).check();
    await panel.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "19:00" });
    await panel.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
    await panel.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel.getByLabel("Gastname", { exact: true })).toHaveValue("Umbuchung Testgast");
    await expect(page.getByText("Die Änderungen wurden gespeichert.", { exact: true })).toHaveCount(0);
    if (failure === "uncertainAmend") {
      await expect(panel.getByLabel("Gastname", { exact: true })).toBeDisabled();
      await page.clock.setFixedTime(new Date("2026-10-22T12:00:00Z"));
    }
    if (failure === "amendSlotConflict") {
      await panel.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "19:00" });
      await panel.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
    }
    await panel.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
    await expect(page.getByText("Die Änderungen wurden gespeichert.", { exact: true })).toBeVisible();
    expect(fixture.amendRequests()).toHaveLength(2);
    expect(fixture.amendRequests()[0]).toEqual(fixture.amendRequests()[1]);
  });
}

test("amendment revision conflicts require explicit discard before reloading the current record", async ({ page }) => {
  await mockConsole(page, { seeded: true, amendments: true, amendRevisionConflict: true });
  await page.goto("/booking/console");
  const panel = await editGuest(page);
  await panel.getByLabel("Gastname", { exact: true }).fill("Nicht gespeicherter Entwurf");
  await panel.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText("Die Reservierung wurde inzwischen geändert. Bitte neu laden.");
  await panel.getByRole("button", { name: "Aktuellen Stand laden", exact: true }).click();
  await panel.getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  await expect(panel.getByLabel("Gastname", { exact: true })).toHaveValue("Nicht gespeicherter Entwurf");
  await panel.getByRole("button", { name: "Aktuellen Stand laden", exact: true }).click();
  await panel.getByRole("button", { name: "Verwerfen und neu laden", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Reservierung", exact: true });
  await expect(details.getByText("Testgast Abend", { exact: true })).toBeVisible();
  await expect(details.getByText("Extern geändert", { exact: true })).toBeVisible();
  await expect(page.getByText("Die Änderungen wurden gespeichert.", { exact: true })).toHaveCount(0);
});

test("late amendment availability cannot replace a more recent party and duration request", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, amendments: true, slowAmendSlots: true });
  await page.goto("/booking/console");
  const panel = await editGuest(page);
  await panel.getByRole("checkbox", { name: "Zeit, Personen oder Tisch ändern" }).check();
  await expect.poll(() => fixture.amendParties().length).toBe(1);
  await panel.getByLabel("Personen", { exact: true }).fill("4");
  await panel.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "19:00" });
  await panel.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
  await expect.poll(() => fixture.amendParties()).toEqual([2, 4]);
  await page.waitForTimeout(900);
  await expect(panel.getByRole("combobox", { name: "Uhrzeit", exact: true })).toHaveValue("2026-10-20T19:00:00+02:00");
  await expect(panel.getByRole("combobox", { name: "Tisch", exact: true }).locator("option")).not.toContainText(["Fenster 1"]);
  await page.screenshot({ path: test.info().outputPath("amendment-desktop.png") });
});

test("a phone walk-in uses server time and immediate seating while following today's actual service", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, walkIns: true });
  await page.goto("/booking/console");
  await page.getByLabel("Datum · Europe/Zurich").fill("2026-10-21");
  await page.getByRole("combobox", { name: "Service", exact: true }).selectOption(dinner);
  await page.getByRole("button", { name: "+ Walk-in für jetzt", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Walk-in platzieren", exact: true });
  await expect(panel.getByRole("button", { name: "2 Personen", exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "Tisch Fenster 1 im Bereich Gastraum für Mittag wählen", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("walk-in-phone.png") });
  await panel.getByRole("button", { name: "Walk-in platzieren", exact: true }).click();
  await expect(page.getByText("Der Walk-in wurde erfasst.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Datum · Europe/Zurich")).toHaveValue("2026-10-20");
  await expect(page.getByRole("combobox", { name: "Service", exact: true })).toHaveValue(lunch);
  expect(fixture.walkInRequests()).toHaveLength(1);
  expect(fixture.walkInRequests()[0]).toMatchObject({ p_spot_id: spot, p_service_id: lunch, p_table_id: table1, p_party_size: 2, p_duration_minutes: 120, p_guest_name: "" });
  expect(fixture.walkInRequests()[0]).not.toHaveProperty("p_starts_at");
  expect(fixture.walkInRequests()[0]).not.toHaveProperty("p_date");
  await expect(page.getByRole("button", { name: "Reservierung von Walk-in öffnen", exact: true })).toHaveAccessibleDescription(/14:02.*Fenster 1/);
  await page.getByRole("button", { name: "Reservierung von Walk-in öffnen", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Reservierung", exact: true });
  await expect(details.getByText("Walk-in · sofortige Platzierung", { exact: true })).toBeVisible();
  await expect(details.getByText(/14:02–16:02/)).toBeVisible();
  await expect(details.getByRole("button", { name: "Besuch beenden", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("walk-in conflicts retain guest input and offer another table without reporting a saved admission", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, walkIns: true, walkInConflict: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Walk-in für jetzt", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Walk-in platzieren", exact: true });
  await panel.getByText("Gastangaben ergänzen", { exact: true }).click();
  await panel.getByLabel("Gastname (optional)").fill("Synthetischer Walk-in");
  await panel.getByRole("button", { name: "Tisch Fenster 1 im Bereich Gastraum für Mittag wählen", exact: true }).click();
  await panel.getByRole("button", { name: "Walk-in platzieren", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("inzwischen belegt");
  await expect(panel.getByLabel("Gastname (optional)")).toHaveValue("Synthetischer Walk-in");
  await expect(panel.getByLabel("Gastname (optional)")).toBeEnabled();
  await expect(page.getByText("Der Walk-in wurde erfasst.", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Tisch Terrasse 2 im Bereich Terrasse für Mittag wählen", exact: true }).click();
  await panel.getByRole("button", { name: "Walk-in platzieren", exact: true }).click();
  await expect(page.getByText("Der Walk-in wurde erfasst.", { exact: true })).toBeVisible();
  expect(fixture.walkInRequests()).toHaveLength(2);
  expect(fixture.walkInRequests()[0].p_request_id).not.toBe(fixture.walkInRequests()[1].p_request_id);
});

test("an uncertain walk-in freezes its payload and safely retries the same request", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, walkIns: true, uncertainWalkIn: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Walk-in für jetzt", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Walk-in platzieren", exact: true });
  await panel.getByRole("button", { name: "Tisch Fenster 1 im Bereich Gastraum für Mittag wählen", exact: true }).click();
  await panel.getByRole("button", { name: "Walk-in platzieren", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Speicherergebnis ist unklar");
  await expect(panel.getByLabel("Personen", { exact: true })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "4 Personen", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(panel.getByText("Die Anfrage kann bereits gespeichert sein.", { exact: false })).toBeVisible();
  await panel.getByRole("button", { name: "Zur Anfrage", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Unverändert erneut versuchen", exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "Unverändert erneut versuchen", exact: true }).click();
  await expect(page.getByText("Der Walk-in wurde erfasst.", { exact: true })).toBeVisible();
  expect(fixture.walkInRequests()).toHaveLength(2);
  expect(fixture.walkInRequests()[0]).toEqual(fixture.walkInRequests()[1]);
  await expect(page.getByRole("button", { name: "Reservierung von Walk-in öffnen", exact: true })).toHaveCount(1);
});

test("leaving an uncertain walk-in reloads the server's operating day with an explicit review warning", async ({ page }) => {
  await mockConsole(page, { seeded: true, walkIns: true, uncertainWalkIn: true });
  await page.goto("/booking/console");
  await page.getByLabel("Datum · Europe/Zurich").fill("2026-10-21");
  await page.getByRole("button", { name: "+ Walk-in für jetzt", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Walk-in platzieren", exact: true });
  await panel.getByRole("button", { name: "Tisch Fenster 1 im Bereich Gastraum für Mittag wählen", exact: true }).click();
  await panel.getByRole("button", { name: "Walk-in platzieren", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Speicherergebnis ist unklar");
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "Anfrage verlassen", exact: true }).click();
  await expect(page.getByLabel("Datum · Europe/Zurich")).toHaveValue("2026-10-20");
  await expect(page.getByRole("button", { name: "Reservierung von Walk-in öffnen", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("kann bereits gespeichert sein");
  await expect(page.getByText("Der Walk-in wurde erfasst.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Stand geprüft", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("walk-in numeric drafts stay empty, and a closed service cannot create an admission", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, walkIns: true, walkInClosed: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Walk-in für jetzt", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Walk-in platzieren", exact: true });
  await expect(panel.getByText("Für diese Dauer läuft gerade kein Service.", { exact: true })).toBeVisible();
  const calls = fixture.walkInParties().length;
  await panel.getByLabel("Personen", { exact: true }).fill("");
  await panel.getByLabel("Dauer in Minuten", { exact: true }).fill("");
  await expect(panel.getByLabel("Personen", { exact: true })).toHaveValue("");
  await expect(panel.getByLabel("Dauer in Minuten", { exact: true })).toHaveValue("");
  expect(fixture.walkInParties()).toHaveLength(calls);
  await expect(panel.getByRole("button", { name: "Walk-in platzieren", exact: true })).toBeDisabled();
  expect(fixture.walkInRequests()).toEqual([]);
});

test("late walk-in availability cannot offer a table too small for the latest party", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, walkIns: true, slowWalkInSlots: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Walk-in für jetzt", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Walk-in platzieren", exact: true });
  await expect.poll(() => fixture.walkInParties()).toEqual([2]);
  await panel.getByRole("button", { name: "4 Personen", exact: true }).click();
  const table = panel.getByRole("button", { name: "Tisch Terrasse 2 im Bereich Terrasse für Mittag wählen", exact: true });
  await table.click();
  await expect.poll(() => fixture.walkInReplies()).toEqual([4, 2]);
  await expect(panel.getByRole("button", { name: "Tisch Fenster 1 im Bereich Gastraum für Mittag wählen", exact: true })).toHaveCount(0);
  await expect(table).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("button", { name: "Walk-in platzieren", exact: true })).toBeEnabled();
});

test("a late walk-in response from a signed-out session cannot close a new session's private draft", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, walkIns: true, deferWalkInWrite: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Walk-in für jetzt", exact: true }).click();
  let panel = page.getByRole("dialog", { name: "Walk-in platzieren", exact: true });
  await panel.getByRole("button", { name: "Tisch Fenster 1 im Bereich Gastraum für Mittag wählen", exact: true }).click();
  await panel.getByRole("button", { name: "Walk-in platzieren", exact: true }).click();
  await expect.poll(() => fixture.walkInRequests().length).toBe(1);
  await page.evaluate(() => { const channel = new BroadcastChannel("sb-127-auth-token"); channel.postMessage({ event: "SIGNED_OUT", session: null }); channel.close(); });
  await expect(page.getByRole("link", { name: "Zur Booking Console anmelden" })).toBeVisible();
  await expect(panel).toHaveCount(0);
  await page.evaluate((session) => { const channel = new BroadcastChannel("sb-127-auth-token"); channel.postMessage({ event: "SIGNED_IN", session }); channel.close(); }, fixture.session);
  await page.getByRole("button", { name: "+ Walk-in für jetzt", exact: true }).click();
  panel = page.getByRole("dialog", { name: "Walk-in platzieren", exact: true });
  await panel.getByText("Gastangaben ergänzen", { exact: true }).click();
  await panel.getByLabel("Gastname (optional)").fill("Neuer privater Entwurf");
  const response = page.waitForResponse((response) => response.url().endsWith("booking_console_walk_in_v1"));
  fixture.releaseWalkInWrite();
  await (await response).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(panel.getByLabel("Gastname (optional)")).toHaveValue("Neuer privater Entwurf");
  await expect(page.getByText("Der Walk-in wurde erfasst.", { exact: false })).toHaveCount(0);
});

function seededSnapshot(): BookingSnapshot {
  return {
    settings: { revision: 1, duration_minutes: 120, max_party_size: 8 },
    areas: [{ id: area1, name: "Gastraum", is_active: true }, { id: area2, name: "Terrasse", is_active: true }],
    tables: [{ id: table1, area_id: area1, label: "Fenster 1", seats: 4, is_active: true }, { id: table2, area_id: area2, label: "Terrasse 2", seats: 6, is_active: true }],
    services: [{ id: dinner, name: "Abendservice", weekdays: [0, 1, 2, 3, 4, 5, 6], opens_at: "18:00", closes_at: "23:00", interval_minutes: 30, is_active: true }, { id: lunch, name: "Mittag", weekdays: [0, 1, 2, 3, 4, 5, 6], opens_at: "12:00", closes_at: "15:00", interval_minutes: 30, is_active: true }],
    reservations: [
      { id: reservationId, table_id: table1, service_id: dinner, guest_name: "Testgast Abend", guest_contact: "test@invalid", note: "Synthetischer Hinweis", party_size: 2, starts_at: "2026-10-20T18:00:00+02:00", ends_at: "2026-10-20T20:00:00+02:00", status: "confirmed", source: "phone" },
      { id: "51000000-0000-4000-8000-000000000021", table_id: table2, service_id: dinner, guest_name: "Testgast Terrasse", guest_contact: null, note: null, party_size: 4, starts_at: "2026-10-20T18:30:00+02:00", ends_at: "2026-10-20T20:30:00+02:00", status: "pending", source: "email" },
      { id: "51000000-0000-4000-8000-000000000022", table_id: table1, service_id: lunch, guest_name: "Testgast Mittag", guest_contact: null, note: null, party_size: 2, starts_at: "2026-10-20T12:00:00+02:00", ends_at: "2026-10-20T14:00:00+02:00", status: "confirmed", source: "phone" },
      { id: "51000000-0000-4000-8000-000000000023", table_id: table2, service_id: dinner, guest_name: "Testgast Storniert", guest_contact: null, note: null, party_size: 3, starts_at: "2026-10-20T19:00:00+02:00", ends_at: "2026-10-20T21:00:00+02:00", status: "cancelled", source: "email" },
    ],
  };
}

async function mockConsole(page: Page, options: { missingBackend?: boolean; noSpots?: boolean; conflict?: boolean; seeded?: boolean; slowFirstSlots?: boolean; uncertainCreate?: boolean; slotConflict?: boolean; lifecycle?: boolean; statusConflict?: boolean; uncertainStatus?: boolean; amendments?: boolean; amendSlotConflict?: boolean; amendRevisionConflict?: boolean; uncertainAmend?: boolean; slowAmendSlots?: boolean; unclosed?: boolean; walkIns?: boolean; walkInConflict?: boolean; uncertainWalkIn?: boolean; walkInClosed?: boolean; slowWalkInSlots?: boolean; deferWalkInWrite?: boolean; layouts?: boolean; layoutConflict?: boolean; uncertainLayout?: boolean; longSession?: boolean; sharedContext?: boolean; planning?: boolean; closureConflict?: boolean; uncertainClosure?: boolean; malformedWeek?: boolean; slowFirstWeek?: boolean; foldSlots?: boolean; deferClosureResponse?: boolean } = {}) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + (options.longSession ? 7 * 86400 : 3600);
  const user = { id: owner, email: "operator@booking.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" };
  const session = { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: owner, role: "authenticated", exp: expires })}.local-signature`, refresh_token: "booking-test", token_type: "bearer", expires_in: 3600, expires_at: expires, user };
  await page.context().addCookies([{ name: "sb-127-auth-token", value: `base64-${encode(session)}`, domain: "127.0.0.1", path: "/" }]);
  const routing = options.sharedContext ? page.context() : page;
  await routing.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await routing.route("**/rest/v1/profiles?*", (route) => route.fulfill({ json: { display_name: "Test Operator", first_name: "Test", avatar_url: null } }));
  let snapshot: BookingSnapshot = options.seeded ? seededSnapshot() : { settings: null, areas: [], tables: [], services: [], reservations: [] };
  if (options.layouts) { snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: !!options.lifecycle, table_layouts: true }; snapshot.tables = snapshot.tables.map((table) => ({ ...table, layout: null })); }
  if (options.planning) { snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: !!snapshot.capabilities?.service_lifecycle, week_planning: true }; snapshot.closures = []; }
  if (options.foldSlots && snapshot.settings) snapshot.settings.duration_minutes = 60;
  let savedSetup: BookingSetup | null = null;
  if (options.lifecycle) snapshot.capabilities = { service_lifecycle: true };
  if (options.amendments) { snapshot.capabilities = { service_lifecycle: true, reservation_amendments: true }; snapshot.reservations = snapshot.reservations.map((r) => ({ ...r, revision: 0 })); }
  if (options.walkIns) {
    snapshot.capabilities = { service_lifecycle: true, reservation_amendments: true, current_seating: true, walk_ins: true };
    snapshot.operating_date = "2026-10-20";
    snapshot.reservations = snapshot.reservations.map((r) => ({ ...r, revision: 0, is_walk_in: false }));
    snapshot.services = snapshot.services.map((service) => service.id === lunch ? { ...service, closes_at: "17:00" } : service);
    if (options.slowWalkInSlots) snapshot.tables = snapshot.tables.map((table) => table.id === table1 ? { ...table, seats: 2 } : table);
  }
  if (options.unclosed) {
    snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: true, current_seating: true };
    snapshot.operating_date = "2026-10-20";
    snapshot.reservations.push({ id: "51000000-0000-4000-8000-000000000024", table_id: table1, service_id: dinner, guest_name: "Testgast Vorabend", guest_contact: null, note: null, party_size: 2, starts_at: "2026-10-19T18:00:00+02:00", ends_at: "2026-10-19T20:00:00+02:00", status: "seated", source: "phone", revision: 0, is_walk_in: false, arrived_at: "2026-10-19T18:00:00+02:00", seated_at: "2026-10-19T18:00:00+02:00" });
  }
  const layoutRequests: Record<string, unknown>[] = [];
  let readCalls = 0;
  let readError: "network" | "denied" | "safety" | null = null;
  let holdRead = false;
  let releaseRead = () => {};
  let readGate = Promise.resolve();
  let releaseClosureResponse = () => {};
  const closureResponseGate = new Promise<void>((resolve) => { releaseClosureResponse = resolve; });
  const closureRequests: Record<string, unknown>[] = [];
  const weekRequests: Record<string, unknown>[] = [];
  const weekReplies: string[] = [];
  // The synthetic calendar fixtures use October 2026; DST SQL acceptance uses real timezone rules.
  const fixtureInstant = (date: string, time: string) => {
    const actualDate = time === "24:00" ? new Date(Date.parse(date + "T12:00:00Z") + 86400_000).toISOString().slice(0, 10) : date;
    return new Date(Date.parse(actualDate + "T" + (time === "24:00" ? "00:00" : time) + ":00Z") - (actualDate <= "2026-10-25" ? 120 : 60) * 60_000).toISOString();
  };
  let statusCalls = 0;
  const statusRequests: object[] = [];
  const amendRequests: Record<string, unknown>[] = [];
  const amendParties: number[] = [];
  let lastAmendId = "";
  const walkInRequests: Record<string, unknown>[] = [];
  const walkInParties: number[] = [];
  const walkInReplies: number[] = [];
  const walkInStored = new Map<string, { payload: string; result: { id: string; service_id: string; table_id: string; starts_at: string; ends_at: string } }>();
  let blockedWalkInTable = "";
  let releaseWalkInWrite = () => {};
  const walkInWriteGate = new Promise<void>((resolve) => { releaseWalkInWrite = resolve; });
  let bookingCalls = 0;
  const slotParties: number[] = [];
  const slotReplies: number[] = [];
  const requestIds: string[] = [];
  await routing.route("**/rest/v1/rpc/*", async (route) => {
    const method = route.request().url().split("/").pop();
    const body = route.request().postDataJSON();
    if (method === "get_owner_spots_v1") return route.fulfill({ json: options.noSpots ? [] : [{ spot_id: spot, name: "Restaurant Testbetrieb", city: "Basel", address: null, category_name: "Restaurant", status: "approved", website: null }] });
    if (options.missingBackend) return route.fulfill({ status: 404, json: { code: "PGRST202", message: "function not found" } });
    if (method === "booking_console_read_v1") {
      readCalls++;
      const data = { ...snapshot, closures: (snapshot.closures ?? []).filter((row) => row.book_date === body.p_date), reservations: snapshot.reservations.filter((row) => row.starts_at.slice(0, 10) === body.p_date), unclosed_visits: options.unclosed && body.p_date === snapshot.operating_date ? snapshot.reservations.filter((row) => row.status === "seated" && row.starts_at.slice(0, 10) < body.p_date) : [] };
      if (holdRead) await readGate;
      if (readError === "safety") return route.fulfill({ status: 400, json: { code: "P0001", message: "SAFETY_OWNER_EDIT_RESTRICTED" } });
      if (readError === "denied") return route.fulfill({ status: 403, json: { code: "42501", message: "booking_operator_required" } });
      if (readError === "network") return route.fulfill({ status: 503, json: { message: "temporarily unavailable" } });
      return route.fulfill({ json: data });
    }
    if (method === "booking_console_week_v1") {
      weekRequests.push(body);
      if (options.slowFirstWeek && weekRequests.length === 1) await new Promise((resolve) => setTimeout(resolve, 800));
      if (readError === "safety") return route.fulfill({ status: 400, json: { code: "P0001", message: "SAFETY_OWNER_EDIT_RESTRICTED" } });
      if (readError === "denied") return route.fulfill({ status: 403, json: { code: "42501", message: "booking_operator_required" } });
      if (readError === "network") return route.fulfill({ status: 503, json: { message: "temporarily unavailable" } });
      const days = Array.from({ length: options.malformedWeek && weekRequests.length === 1 ? 6 : 7 }, (_, index) => {
        const date = new Date(Date.parse(body.p_start_date + "T12:00:00Z") + index * 86400_000).toISOString().slice(0, 10);
        const rows = snapshot.reservations.filter((row) => row.starts_at.slice(0, 10) === date && (!body.p_service_id || row.service_id === body.p_service_id) && (!body.p_area_id || snapshot.tables.some((table) => table.id === row.table_id && table.area_id === body.p_area_id)));
        const active = rows.filter((row) => ["pending", "confirmed", "arrived", "seated"].includes(row.status));
        const closures = (snapshot.closures ?? []).filter((closure) => closure.book_date === date && (!body.p_service_id || !closure.service_id || closure.service_id === body.p_service_id) && (!body.p_area_id || !closure.area_id || closure.area_id === body.p_area_id));
        return { date, active_reservations: active.length, active_guests: active.reduce((sum, row) => sum + row.party_size, 0), pending: rows.filter((row) => row.status === "pending").length, completed: rows.filter((row) => row.status === "completed").length, cancelled: rows.filter((row) => ["cancelled", "declined"].includes(row.status)).length, no_show: rows.filter((row) => row.status === "no_show").length, closed: closures.some((closure) => !closure.start_time && !closure.area_id && !closure.service_id), closures };
      });
      weekReplies.push(body.p_area_id ?? "all");
      return route.fulfill({ json: { start_date: body.p_start_date, revision: snapshot.settings!.revision, observed_at: "2026-10-20T12:00:00Z", days } });
    }
    if (method === "booking_console_save_closure_v1") {
      closureRequests.push(body);
      const existing = snapshot.closures?.find((closure) => closure.id === body.p_id);
      if (options.closureConflict) return route.fulfill({ status: 409, json: { code: "40001", message: "booking_setup_changed_reload" } });
      const start = fixtureInstant(body.p_date, body.p_start_time || "00:00");
      const next = new Date(Date.parse(body.p_date + "T12:00:00Z") + 86400_000).toISOString().slice(0, 10);
      const end = fixtureInstant(body.p_start_time ? body.p_date : next, body.p_end_time || "00:00");
      const affected = snapshot.reservations.filter((row) => ["pending", "confirmed", "arrived", "seated"].includes(row.status) && (!body.p_service_id || row.service_id === body.p_service_id) && (!body.p_area_id || snapshot.tables.some((table) => table.id === row.table_id && table.area_id === body.p_area_id)) && Date.parse(row.starts_at) < Date.parse(end) && Date.parse(row.ends_at) > Date.parse(start)).length;
      const closure = { id: body.p_id, book_date: body.p_date, start_time: body.p_start_time, end_time: body.p_end_time, service_id: body.p_service_id, area_id: body.p_area_id, note: body.p_note || null, starts_at: start, ends_at: end, affected_reservations: affected };
      const same = existing && JSON.stringify(existing) === JSON.stringify(closure);
      if (body.p_remove && !existing) return route.fulfill({ json: { revision: snapshot.settings!.revision, existing_reservations: 0 } });
      if (!same && snapshot.settings!.revision !== body.p_revision) return route.fulfill({ status: 409, json: { code: "40001", message: "booking_setup_changed_reload" } });
      if (!body.p_remove && !same && affected > 0 && !body.p_keep_existing) return route.fulfill({ status: 400, json: { code: "22023", message: "booking_closure_has_reservations", details: String(affected) } });
      if (!same || body.p_remove) {
        snapshot.closures = (snapshot.closures ?? []).filter((closure) => closure.id !== body.p_id);
        if (!body.p_remove) snapshot.closures.push(closure);
        snapshot.settings!.revision++;
      }
      if (options.deferClosureResponse && closureRequests.length === 1) await closureResponseGate;
      if (options.uncertainClosure && closureRequests.length === 1) return route.fulfill({ status: 500, json: { message: "response_lost_after_accept" } });
      return route.fulfill({ json: { revision: snapshot.settings!.revision, existing_reservations: affected } });
    }
    if (method === "booking_console_save_layout_v1") {
      layoutRequests.push(body);
      if (options.layoutConflict) return route.fulfill({ status: 409, json: { code: "40001", message: "booking_setup_changed_reload" } });
      const entries = body.p_entries as { table_id: string; area_id: string; layout: NonNullable<BookingSnapshot["tables"][number]["layout"]> | null }[];
      snapshot.tables = snapshot.tables.map((table) => ({ ...table, layout: entries.some((entry) => entry.table_id === table.id) ? entries.find((entry) => entry.table_id === table.id)!.layout : table.layout }));
      if (options.uncertainLayout && layoutRequests.length === 1) return route.fulfill({ status: 503, json: { message: "Response lost" } });
      return route.fulfill({ json: 2 });
    }
    if (method === "booking_console_save_setup_v1") {
      if (options.conflict) return route.fulfill({ status: 409, json: { code: "40001", message: "booking_setup_changed_reload" } });
      savedSetup = body.p_setup;
      const setup = savedSetup!;
      snapshot = { ...snapshot, ...setup, settings: { revision: (snapshot.settings?.revision ?? 0) + 1, duration_minutes: setup.duration_minutes, max_party_size: setup.max_party_size } };
      return route.fulfill({ json: snapshot.settings!.revision });
    }
    if (method === "booking_console_slots_v1") {
      slotParties.push(body.p_party_size);
      if (options.foldSlots) return route.fulfill({ json: ["+02:00", "+01:00"].map((offset) => ({ service_id: dinner, table_id: table1, starts_at: body.p_date + "T02:00:00" + offset, ends_at: new Date(Date.parse(body.p_date + "T02:00:00" + offset) + 60 * 60_000).toISOString() })) });
      if (options.slowFirstSlots && slotParties.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        slotReplies.push(body.p_party_size);
        return route.fulfill({ json: [{ service_id: dinner, table_id: table1, starts_at: body.p_date + "T19:00:00+02:00", ends_at: body.p_date + "T21:00:00+02:00" }] });
      }
      slotReplies.push(body.p_party_size);
      return route.fulfill({ json: [{ service_id: snapshot.services[0].id, table_id: snapshot.tables[0].id, starts_at: `${body.p_date}T18:00:00+02:00`, ends_at: `${body.p_date}T20:00:00+02:00` }] });
    }
    if (method === "booking_console_create_v1") {
      bookingCalls++;
      requestIds.push(body.p_request_id);
      if (options.slotConflict && bookingCalls === 1) return route.fulfill({ status: 409, json: { code: "22023", message: "booking_slot_unavailable" } });
      snapshot.reservations = [{ id: reservationId, table_id: body.p_table_id, service_id: body.p_service_id, guest_name: body.p_guest_name, guest_contact: body.p_guest_contact, note: body.p_note, party_size: body.p_party_size, starts_at: body.p_starts_at, ends_at: new Date(Date.parse(body.p_starts_at) + (options.foldSlots ? 60 : 120) * 60 * 1000).toISOString(), status: body.p_status, source: body.p_source, revision: 0, is_walk_in: false }];
      if (options.uncertainCreate && bookingCalls === 1) return route.fulfill({ status: 500, json: { message: "response_lost_after_accept" } });
      return route.fulfill({ json: reservationId });
    }
    if (method === "booking_console_set_status_v1") {
      statusCalls++;
      statusRequests.push(body);
      if (options.statusConflict) return route.fulfill({ status: 409, json: { code: "40001", message: "booking_changed_reload" } });
      const target = snapshot.reservations.find((r) => r.id === body.p_reservation_id);
      if (options.unclosed && body.p_status === "seated" && snapshot.reservations.some((r) => r.id !== target?.id && r.table_id === target?.table_id && r.status === "seated")) return route.fulfill({ status: 409, json: { code: "22023", message: "booking_table_occupied" } });
      snapshot.reservations = snapshot.reservations.map((r) => r.id === body.p_reservation_id && r.status !== body.p_status ? { ...r, status: body.p_status, revision: (r.revision ?? 0) + 1,
        arrived_at: ["arrived", "seated"].includes(body.p_status) ? r.arrived_at ?? "2026-10-20T12:00:00Z" : r.arrived_at,
        seated_at: body.p_status === "seated" ? "2026-10-20T12:00:00Z" : r.seated_at,
        completed_at: body.p_status === "completed" ? "2026-10-20T12:00:00Z" : r.completed_at } : r);
      if (options.uncertainStatus && statusCalls === 1) return route.fulfill({ status: 500, json: { message: "response_lost_after_accept" } });
      return route.fulfill({ status: 204 });
    }
    if (method === "booking_console_amendment_slots_v1") {
      amendParties.push(body.p_party_size);
      const slow = options.slowAmendSlots && amendParties.length === 1;
      if (slow) await new Promise((resolve) => setTimeout(resolve, 800));
      const start = body.p_date + (slow ? "T18:00:00+02:00" : "T19:00:00+02:00");
      return route.fulfill({ json: body.p_party_size > 6 ? [] : [{ service_id: dinner, table_id: slow ? table1 : table2, starts_at: start, ends_at: new Date(Date.parse(start) + body.p_duration_minutes * 60_000).toISOString() }] });
    }
    if (method === "booking_console_amend_v1") {
      amendRequests.push(body);
      if (options.amendRevisionConflict) {
        snapshot.reservations = snapshot.reservations.map((r) => r.id === body.p_reservation_id ? { ...r, note: "Extern geändert", revision: (r.revision ?? 0) + 1 } : r);
        return route.fulfill({ status: 409, json: { code: "40001", message: "booking_changed_reload" } });
      }
      if (options.amendSlotConflict && amendRequests.length === 1) return route.fulfill({ status: 409, json: { code: "22023", message: "booking_slot_unavailable" } });
      if (lastAmendId !== body.p_request_id) {
        snapshot.reservations = snapshot.reservations.map((r) => r.id === body.p_reservation_id ? { ...r, table_id: body.p_table_id, service_id: body.p_service_id,
          starts_at: body.p_starts_at, ends_at: new Date(Date.parse(body.p_starts_at) + body.p_duration_minutes * 60_000).toISOString(),
          party_size: body.p_party_size, guest_name: body.p_guest_name, guest_contact: body.p_guest_contact, note: body.p_note, revision: (r.revision ?? 0) + 1 } : r);
        lastAmendId = body.p_request_id;
      }
      if (options.uncertainAmend && amendRequests.length === 1) return route.fulfill({ status: 500, json: { message: "response_lost_after_accept" } });
      return route.fulfill({ json: body.p_reservation_id });
    }
    if (method === "booking_console_walk_in_slots_v1") {
      walkInParties.push(body.p_party_size);
      const observedAt = "2026-10-20T12:00:00Z";
      const end = new Date(Date.parse(observedAt) + body.p_duration_minutes * 60_000).toISOString();
      const open = !options.walkInClosed && Date.parse(end) <= Date.parse("2026-10-20T15:00:00Z");
      const slots = open ? snapshot.tables.filter((table) => table.is_active && table.seats >= body.p_party_size && table.id !== blockedWalkInTable && !snapshot.reservations.some((r) => r.table_id === table.id && r.status === "seated")).map((table) => ({
        service_id: lunch, table_id: table.id, starts_at: observedAt, ends_at: end, table_label: table.label, seats: table.seats, area_id: table.area_id,
        area_name: snapshot.areas.find((area) => area.id === table.area_id)!.name, service_name: "Mittag",
      })) : [];
      if (options.slowWalkInSlots && walkInParties.length === 1) await new Promise((resolve) => setTimeout(resolve, 800));
      walkInReplies.push(body.p_party_size);
      return route.fulfill({ json: { observed_at: observedAt, services: open ? [{ id: lunch, name: "Mittag" }] : [], slots } });
    }
    if (method === "booking_console_walk_in_v1") {
      walkInRequests.push(body);
      if (options.walkInConflict && walkInRequests.length === 1) { blockedWalkInTable = body.p_table_id; return route.fulfill({ status: 409, json: { code: "22023", message: "booking_slot_unavailable" } }); }
      const payload = JSON.stringify(body);
      const existing = walkInStored.get(body.p_request_id);
      if (existing) return existing.payload === payload ? route.fulfill({ json: existing.result }) : route.fulfill({ status: 409, json: { code: "22023", message: "booking_request_reused" } });
      const result = { id: "51000000-0000-4000-8000-" + String(60 + walkInStored.size).padStart(12, "0"), service_id: body.p_service_id, table_id: body.p_table_id,
        starts_at: "2026-10-20T12:02:00Z", ends_at: new Date(Date.parse("2026-10-20T12:02:00Z") + body.p_duration_minutes * 60_000).toISOString() };
      walkInStored.set(body.p_request_id, { payload, result });
      snapshot.reservations.push({ ...result, guest_name: body.p_guest_name.trim() || "Walk-in", guest_contact: body.p_guest_contact || null, note: body.p_note || null, party_size: body.p_party_size,
        status: "seated", source: "walk_in", is_walk_in: true, arrived_at: result.starts_at, seated_at: result.starts_at, revision: 0 });
      if (options.deferWalkInWrite) await walkInWriteGate;
      if (options.uncertainWalkIn && walkInRequests.length === 1) return route.fulfill({ status: 500, json: { message: "response_lost_after_accept" } });
      return route.fulfill({ json: result });
    }
    return route.fulfill({ status: 400, json: { message: "unexpected RPC" } });
  });
  return { releaseClosureResponse, closureRequests: () => closureRequests, weekRequests: () => weekRequests, weekReplies: () => weekReplies, readCalls: () => readCalls, setReadError: (error: typeof readError) => { readError = error; }, holdRead: () => { holdRead = true; readGate = new Promise<void>((resolve) => { releaseRead = () => { holdRead = false; resolve(); }; }); }, releaseRead: () => releaseRead(), layoutRequests: () => layoutRequests, setup: () => savedSetup, bookingCalls: () => bookingCalls, slotParties: () => slotParties, slotReplies: () => slotReplies, requestIds: () => requestIds, statusRequests: () => statusRequests, amendRequests: () => amendRequests, amendParties: () => amendParties, walkInRequests: () => walkInRequests, walkInParties: () => walkInParties, walkInReplies: () => walkInReplies, releaseWalkInWrite, session };
}

async function configure(page: Page) {
  await page.getByRole("button", { name: "Bereiche & Tische", exact: false }).click();
  await page.getByRole("button", { name: "+ Bereich", exact: true }).click();
  await page.getByLabel("Bereich 1", { exact: true }).fill("Gastraum");
  await page.getByRole("button", { name: "+ Tisch", exact: true }).click();
  await page.getByLabel("Tisch 1", { exact: true }).fill("Fenster 1");
  await page.getByLabel("Plätze für Tisch 1", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Servicezeiten", exact: false }).click();
  await page.getByRole("button", { name: "+ Service", exact: true }).click();
  await page.getByLabel("Service 1", { exact: true }).fill("Abendservice");
  await page.getByRole("button", { name: "Einrichtung speichern", exact: true }).click();
}

test("guest sees a sign-in action preserving the Console destination", async ({ page }) => {
  const response = await page.goto("/booking/console");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("link", { name: "Zur Booking Console anmelden" })).toHaveAttribute("href", "/login?next=%2Fbooking%2Fconsole");
  await expect(page.getByRole("button", { name: "Einrichtung speichern" })).toHaveCount(0);
});

test("operator configures a restaurant, records a reservation and cancels it after reload", async ({ page }) => {
  const fixture = await mockConsole(page);
  await page.goto("/booking/console");
  await expect(page.getByRole("heading", { name: "Restaurant Testbetrieb" })).toBeVisible();
  await configure(page);
  await expect(page.getByText("Die Einrichtung wurde gespeichert.", { exact: true })).toBeVisible();
  expect(fixture.setup()?.tables[0].seats).toBe(4);
  await page.reload();
  await page.getByRole("button", { name: "Reservierungsbuch", exact: true }).click();
  await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
  await page.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "18:00" });
  await page.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
  await page.getByLabel("Gastname", { exact: true }).fill("Synthetischer Gast");
  await page.getByLabel("Telefon oder E-Mail (optional)", { exact: true }).fill("gast@invalid");
  await page.getByRole("button", { name: "Reservierung speichern", exact: true }).click();
  await expect(page.getByText("Die Reservierung wurde gespeichert.", { exact: true })).toBeVisible();
  expect(fixture.bookingCalls()).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Reservierung von Synthetischer Gast öffnen" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("console-synthetic.png"), fullPage: true });
  await page.getByRole("button", { name: "Reservierung von Synthetischer Gast öffnen" }).click();
  await page.getByRole("button", { name: "Stornieren", exact: true }).click();
  await page.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Reservierung", exact: true }).getByText("Storniert", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const channel = new BroadcastChannel("sb-127-auth-token");
    channel.postMessage({ event: "SIGNED_OUT", session: null });
    channel.close();
  });
  await expect(page.getByRole("link", { name: "Zur Booking Console anmelden" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reservierung von Synthetischer Gast öffnen" })).toHaveCount(0);
});

test("setup stays usable on a narrow phone and rejects a stale save honestly", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockConsole(page, { conflict: true });
  await page.goto("/booking/console");
  await configure(page);
  await expect(page.getByRole("alert").filter({ hasText: "Die Einrichtung wurde inzwischen geändert" })).toBeVisible();
  await expect(page.getByText("Die Einrichtung wurde gespeichert.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Bereiche & Tische", exact: false }).click();
  await expect(page.getByLabel("Bereich 1", { exact: true })).toHaveValue("Gastraum");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("phone number fields stay empty while editing and submit numeric values", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await mockConsole(page);
  await page.goto("/booking/console");
  for (const [label, value] of [["Aufenthaltsdauer in Minuten", "90"], ["Maximale Gruppengrösse", "6"]]) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill("");
    await expect(input).toHaveValue("");
    await input.press("Tab");
    await expect(input).toHaveValue("");
    await input.pressSequentially(value);
  }
  await page.getByRole("button", { name: "Bereiche & Tische", exact: false }).click();
  await page.getByRole("button", { name: "+ Bereich", exact: true }).click();
  await page.getByLabel("Bereich 1", { exact: true }).fill("Gastraum");
  await page.getByRole("button", { name: "+ Tisch", exact: true }).click();
  await page.getByLabel("Tisch 1", { exact: true }).fill("Tisch 1");
  const seats = page.getByLabel("Plätze für Tisch 1", { exact: true });
  await seats.fill("");
  await expect(seats).toHaveValue("");
  await page.getByRole("button", { name: "Einrichtung speichern", exact: true }).click();
  expect(fixture.setup()).toBeNull();
  await seats.fill("31");
  await page.getByRole("button", { name: "Einrichtung speichern", exact: true }).click();
  expect(fixture.setup()).toBeNull();
  await seats.fill("");
  await seats.pressSequentially("4");
  await expect(seats).toHaveValue("4");
  await page.getByRole("button", { name: "Servicezeiten", exact: false }).click();
  await page.getByRole("button", { name: "+ Service", exact: true }).click();
  await page.getByLabel("Service 1", { exact: true }).fill("Abendservice");
  await page.screenshot({ path: test.info().outputPath("phone-setup.png"), fullPage: true });
  await page.getByRole("button", { name: "Einrichtung speichern", exact: true }).click();
  await expect(page.getByText("Die Einrichtung wurde gespeichert.", { exact: true })).toBeVisible();
  expect(fixture.setup()).toMatchObject({ duration_minutes: 90, max_party_size: 6, tables: [{ seats: 4 }] });
  await page.getByRole("button", { name: "Reservierungsbuch", exact: true }).click();
  await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
  const party = page.getByLabel("Personen", { exact: true });
  await party.fill("");
  await expect(party).toHaveValue("");
  await expect(page.getByRole("button", { name: "Reservierung speichern", exact: true })).toBeDisabled();
  await party.pressSequentially("3");
  await expect(party).toHaveValue("3");
  await expect(page.getByRole("combobox", { name: "Uhrzeit", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "18:00" });
  await page.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
  await page.getByRole("button", { name: "4 Personen", exact: true }).click();
  await expect(party).toHaveValue("4");
  await expect(page.getByRole("button", { name: "4 Personen", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Tisch", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "8 Personen", exact: true })).toHaveCount(0);
  await party.fill("2.5");
  await expect(page.getByRole("button", { name: "Reservierung speichern", exact: true })).toBeDisabled();
  await party.fill("7");
  await expect(page.getByRole("button", { name: "Reservierung speichern", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "4 Personen", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Uhrzeit", exact: true })).toBeVisible();
  expect(fixture.slotParties()).toContain(3);
  expect(fixture.slotParties().at(-1)).toBe(4);
  await page.screenshot({ path: test.info().outputPath("phone-reservation.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("missing backend produces an unavailable state without a fake empty diary", async ({ page }) => {
  await mockConsole(page, { missingBackend: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("alert").filter({ hasText: "noch nicht freigeschaltet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ein freier Anfang." })).toHaveCount(0);
});

test("an account without assigned spots gets an operator access request", async ({ page }) => {
  await mockConsole(page, { noSpots: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("heading", { name: "Verbinde dein Restaurant." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Betreiberzugang anfragen" })).toHaveAttribute("href", /^mailto:/);
});

test("book filters, table time and service context stay honest across views", async ({ page }) => {
  await mockConsole(page, { seeded: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Mittag öffnen" })).toBeVisible();
  await page.getByRole("combobox", { name: "Service", exact: true }).selectOption(dinner);
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Mittag öffnen" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Bereich", exact: true }).selectOption(area1);
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("pending");
  await expect(page.getByRole("heading", { name: "Keine Treffer für diese Filter." })).toBeVisible();
  await page.getByRole("button", { name: "Alle anzeigen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Mittag öffnen" })).toBeVisible();
  await page.getByLabel("Gast suchen", { exact: true }).fill("Terrasse");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Terrasse öffnen" })).toBeVisible();
  await page.getByRole("button", { name: "Alle anzeigen", exact: true }).click();
  await page.getByRole("combobox", { name: "Service", exact: true }).selectOption(dinner);
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  const windowTable = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Fenster 1", exact: true }) });
  await page.getByLabel("Belegung um", { exact: true }).fill("18:00");
  await expect(windowTable.getByText("1 Reservierung", { exact: true })).toBeVisible();
  await page.getByLabel("Belegung um", { exact: true }).fill("20:00");
  await expect(windowTable.getByText("Keine Reservierung", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("tables-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Reservierungsbuch", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Service", exact: true })).toHaveValue(dinner);
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await expect(page.getByLabel("Belegung um", { exact: true })).toHaveValue("20:00");
  await page.getByRole("button", { name: "Zeit für Fenster 1 prüfen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
  await expect(dialog.getByRole("combobox", { name: "Service", exact: true })).toHaveValue(dinner);
  await dialog.getByRole("button", { name: "Schliessen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Nächster Tag", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deine Tische", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Service", exact: true })).toHaveValue(dinner);
  await page.getByRole("button", { name: "Vorheriger Tag", exact: true }).click();
  await expect(page.getByLabel("Belegung um", { exact: true })).toHaveValue("20:00");
});

test("phone editor traps focus, protects drafts and clears private input on logout", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockConsole(page, { seeded: true });
  await page.goto("/booking/console");
  const open = page.getByRole("button", { name: "+ Neue Reservierung", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
  await expect(dialog.getByLabel("Gastname", { exact: true })).toBeFocused();
  expect(await dialog.evaluate((node) => ({ top: node.getBoundingClientRect().top, width: node.getBoundingClientRect().width }))).toEqual({ top: 0, width: 320 });
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await dialog.getByLabel("Gastname", { exact: true }).fill("Entwurf Testgast");
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("heading", { name: "Ungespeicherte Eingaben verwerfen?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  await expect(dialog.getByLabel("Gastname", { exact: true })).toHaveValue("Entwurf Testgast");
  await page.screenshot({ path: test.info().outputPath("editor-phone.png") });
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Eingaben verwerfen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await open.click();
  await dialog.getByLabel("Gastname", { exact: true }).fill("Privater Entwurf");
  await page.evaluate(() => {
    const channel = new BroadcastChannel("sb-127-auth-token");
    channel.postMessage({ event: "SIGNED_OUT", session: null }); channel.close();
  });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Zur Booking Console anmelden" })).toBeVisible();
  await expect(page.getByLabel("Gastname", { exact: true })).toHaveCount(0);
});

test("stale availability cannot replace the latest party choice", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, slowFirstSlots: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
  await expect.poll(() => fixture.slotParties()).toContain(2);
  await page.getByRole("button", { name: "4 Personen", exact: true }).click();
  await expect.poll(() => fixture.slotReplies()).toContain(4);
  await expect.poll(() => fixture.slotReplies()).toContain(2);
  await expect(page.getByRole("combobox", { name: "Uhrzeit", exact: true }).getByRole("option", { name: "18:00", exact: true })).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Uhrzeit", exact: true }).getByRole("option", { name: "19:00", exact: true })).toHaveCount(0);
});

for (const kind of ["slotConflict", "uncertainCreate"] as const) {
  test("reservation keeps input and replay identity after " + kind, async ({ page }) => {
    const fixture = await mockConsole(page, { seeded: true, longSession: kind === "uncertainCreate", [kind]: true });
    await page.goto("/booking/console");
    await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
    await dialog.getByLabel("Gastname", { exact: true }).fill("Testgast Wiederholung");
    await dialog.getByLabel("Telefon oder E-Mail (optional)", { exact: true }).fill("test@invalid");
    await dialog.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "18:00" });
    await dialog.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
    await dialog.getByRole("button", { name: "Reservierung speichern", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByLabel("Gastname", { exact: true })).toHaveValue("Testgast Wiederholung");
    await expect(dialog.getByLabel("Telefon oder E-Mail (optional)", { exact: true })).toHaveValue("test@invalid");
    if (kind === "uncertainCreate") {
      await expect(dialog.getByLabel("Gastname", { exact: true })).toBeDisabled();
      await page.clock.setFixedTime(new Date("2026-10-22T12:00:00Z"));
    }
    if (kind === "slotConflict") {
      await dialog.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "18:00" });
      await dialog.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
    }
    await dialog.getByRole("button", { name: "Reservierung speichern", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.requestIds()).toHaveLength(2);
    expect(fixture.requestIds()[0]).toBe(fixture.requestIds()[1]);
    await expect(page.getByRole("button", { name: "Reservierung von Testgast Wiederholung öffnen" })).toBeVisible();
  });
}


test("table plan keeps numeric drafts empty, persists geometry and preserves booking context on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, layouts: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await page.getByLabel("Belegung um").fill("18:15");
  await page.getByRole("button", { name: "Tischplan", exact: true }).click();
  await page.getByRole("button", { name: "Tischplan bearbeiten", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Tischplan bearbeiten", exact: true });
  await panel.getByLabel("Tisch auswählen").selectOption(table1);
  await panel.getByRole("button", { name: "Tisch im Plan platzieren" }).click();
  await panel.getByLabel("Position X", { exact: true }).fill("");
  await expect(panel.getByLabel("Position X", { exact: true })).toHaveValue("");
  await expect(panel.getByRole("button", { name: "Tischplan speichern", exact: true })).toBeDisabled();
  await panel.getByLabel("Position X", { exact: true }).fill("100");
  await panel.getByLabel("Position Y", { exact: true }).fill("80");
  await panel.getByLabel("Tischform").selectOption("round");
  const node = panel.getByRole("button", { name: "Fenster 1 · 4 Plätze", exact: true });
  await node.focus(); await page.keyboard.press("ArrowRight");
  await expect(panel.getByLabel("Position X", { exact: true })).toHaveValue("105");
  await panel.screenshot({ path: test.info().outputPath("table-plan-editor-phone.png") });
  await panel.getByRole("button", { name: "Tischplan speichern", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByLabel("Belegung um")).toHaveValue("18:15");
  expect(fixture.layoutRequests()).toEqual([{ p_spot_id: spot, p_revision: 1, p_entries: [{ table_id: table1, area_id: area1, layout: { x: 105, y: 80, width: 120, height: 90, shape: "round" } }] }]);
  await expect(page.getByRole("button", { name: /Fenster 1 · 4 Plätze · 1 geplante Reservierungen/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("table-plan-phone.png"), fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await page.getByRole("button", { name: "Tischplan", exact: true }).click();
  await expect(page.getByRole("button", { name: /Fenster 1 · 4 Plätze/ })).toBeVisible();
});

test("table plan conflict preserves the draft and never changes capacity or bookings", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, layouts: true, layoutConflict: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await page.getByRole("button", { name: "Tischplan", exact: true }).click();
  await page.getByRole("button", { name: "Tischplan bearbeiten", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Tischplan bearbeiten", exact: true });
  await panel.getByRole("button", { name: "Bereich als Raster anordnen" }).click();
  await panel.getByRole("button", { name: "Tischplan speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Versionskonflikt");
  await expect(panel.getByRole("button", { name: "Fenster 1 · 4 Plätze", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel.getByText("Ungespeicherte Eingaben verwerfen?")).toBeVisible();
  await panel.getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  expect(fixture.layoutRequests()).toHaveLength(1);
  expect(fixture.bookingCalls()).toBe(0);
  expect(fixture.setup()).toBe(null);
});

test("uncertain table plan save freezes changes and retries the identical patch", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, layouts: true, uncertainLayout: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await page.getByRole("button", { name: "Tischplan", exact: true }).click();
  await page.getByRole("button", { name: "Tischplan bearbeiten", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Tischplan bearbeiten", exact: true });
  await panel.getByRole("button", { name: "Bereich als Raster anordnen" }).click();
  await panel.getByRole("button", { name: "Tischplan speichern", exact: true }).click();
  await expect(panel.getByLabel("Bereich im Plan")).toBeDisabled();
  await panel.getByRole("button", { name: "Identisches Speichern wiederholen", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(fixture.layoutRequests()).toHaveLength(2);
  expect(fixture.layoutRequests()[0]).toEqual(fixture.layoutRequests()[1]);
});


test("table plan drag stays inside its room and other rooms retain separate coordinates", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, layouts: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await page.getByRole("button", { name: "Tischplan", exact: true }).click();
  await page.getByRole("button", { name: "Tischplan bearbeiten", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Tischplan bearbeiten", exact: true });
  await panel.getByRole("button", { name: "Bereich als Raster anordnen" }).click();
  const node = panel.getByRole("button", { name: "Fenster 1 · 4 Plätze", exact: true });
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down(); await page.mouse.move(box!.x + 200, box!.y + 100, { steps: 8 }); await page.mouse.up();
  expect(Number(await panel.getByLabel("Position X", { exact: true }).inputValue())).toBeGreaterThan(5);
  await panel.getByLabel("Position X", { exact: true }).fill("880");
  await panel.getByRole("button", { name: "Fenster 1 · 4 Plätze", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(panel.getByLabel("Position X", { exact: true })).toHaveValue("880");
  await panel.getByLabel("Bereich im Plan").selectOption(area2);
  await expect(panel.getByRole("button", { name: "Fenster 1 · 4 Plätze", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Bereich als Raster anordnen" }).click();
  await panel.getByRole("button", { name: "Tischplan speichern", exact: true }).click();
  await expect(panel).toHaveCount(0);
  const entries = fixture.layoutRequests()[0].p_entries as { table_id: string; area_id: string; layout: { x: number } }[];
  expect(entries.map((row) => [row.table_id, row.area_id, row.layout.x])).toEqual([[table1, area1, 880], [table2, area2, 5]]);
});

for (const operation of ["create", "amend"] as const) {
  test("uncertain " + operation + " freezes edits and leaving reloads the possibly saved date", async ({ page }) => {
    const fixture = await mockConsole(page, { seeded: true, amendments: true, uncertainCreate: operation === "create", uncertainAmend: operation === "amend" });
    await page.goto("/booking/console");
    let panel;
    if (operation === "create") {
      await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
      panel = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
      await panel.getByLabel("Buchungsdatum", { exact: true }).fill("2026-10-21");
    } else {
      panel = await editGuest(page);
      await panel.getByRole("checkbox", { name: "Zeit, Personen oder Tisch ändern" }).check();
      await panel.getByLabel("Buchungsdatum", { exact: true }).fill("2026-10-21");
    }
    await panel.getByLabel("Gastname", { exact: true }).fill("Unklarer Testgast");
    await panel.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: operation === "create" ? "18:00" : "19:00" });
    await panel.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
    await panel.getByRole("button", { name: operation === "create" ? "Reservierung speichern" : "Änderungen speichern", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Speicherstatus ist unklar");
    await expect(panel.getByLabel("Gastname", { exact: true })).toBeDisabled();
    await expect(panel.getByLabel("Buchungsdatum", { exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: operation === "create" ? "Reservierung speichern" : "Änderungen speichern", exact: true })).toBeEnabled();
    await page.keyboard.press("Escape");
    await panel.getByRole("button", { name: "Anfrage verlassen", exact: true }).click();
    await expect(page.getByLabel("Datum · Europe/Zurich")).toHaveValue("2026-10-21");
    await expect(page.getByRole("button", { name: "Reservierung von Unklarer Testgast öffnen", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("kann bereits gespeichert sein");
    expect(operation === "create" ? fixture.bookingCalls() : fixture.amendRequests().length).toBe(1);
  });
}


test("two consoles refresh saved changes while an open guest draft remains untouched", async ({ page, context }) => {
  const fixture = await mockConsole(page, { seeded: true, amendments: true, sharedContext: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  await other.goto("/booking/console");
  const edit = await editGuest(other);
  await edit.getByLabel("Gastname", { exact: true }).fill("Auf zweitem Gerät geändert");
  await edit.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(other.getByText("Die Änderungen wurden gespeichert.", { exact: true })).toBeVisible();
  // Bring the observing page to the foreground; focus/visibility also revalidate.
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Reservierung von Auf zweitem Gerät geändert öffnen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
  await draft.getByLabel("Gastname", { exact: true }).fill("Privater laufender Entwurf");
  const before = fixture.readCalls();
  await page.clock.runFor(31_000);
  expect(fixture.readCalls()).toBe(before);
  await expect(draft.getByLabel("Gastname", { exact: true })).toHaveValue("Privater laufender Entwurf");
});

test("offline and failed refresh preserve an explicit old snapshot until recovery", async ({ page, context }) => {
  const fixture = await mockConsole(page, { seeded: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole("region", { name: "Datenstand" })).toContainText("Offline");
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toBeDisabled();
  fixture.setReadError("network");
  await context.setOffline(false);
  await expect(page.getByRole("region", { name: "Datenstand" })).toContainText("Aktualisierung fehlgeschlagen");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toBeDisabled();
  fixture.setReadError(null);
  await page.clock.runFor(30_000);
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toBeEnabled();
  await expect(page.getByRole("region", { name: "Datenstand" })).not.toContainText("fehlgeschlagen");
});

for (const reason of ["denied", "safety"] as const) {
test("revoked access during automatic refresh removes private guest data: " + reason, async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
  fixture.setReadError(reason);
  await page.clock.runFor(30_000);
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toHaveCount(0);
});

}

test("a refresh begun before opening an editor cannot replace the current draft", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, amendments: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
  fixture.holdRead();
  const before = fixture.readCalls();
  await page.clock.runFor(30_000);
  await expect.poll(() => fixture.readCalls()).toBeGreaterThan(before);
  const panel = await editGuest(page);
  await panel.getByLabel("Gastname", { exact: true }).fill("Nicht überschreiben");
  fixture.releaseRead();
  await expect(panel.getByLabel("Gastname", { exact: true })).toHaveValue("Nicht überschreiben");
  await expect(page.getByRole("button", { name: "Aktualisieren", exact: true })).not.toBeDisabled();
});


test("a hung automatic read times out without overlapping requests and can recover", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
  const before = fixture.readCalls();
  fixture.holdRead();
  await page.clock.runFor(30_000);
  await expect.poll(() => fixture.readCalls()).toBe(before + 1);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(fixture.readCalls()).toBe(before + 1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("region", { name: "Datenstand" })).toContainText("Aktualisierung fehlgeschlagen");
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toBeDisabled();
  fixture.releaseRead();
  // Stop at the next request; do not advance its deadline before real I/O settles.
  await page.clock.runFor(15_000);
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toBeEnabled();
  expect(fixture.readCalls()).toBe(before + 2);
});


test("weekly planning preserves service and room scope and opens the selected day on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, planning: true });
  await page.goto("/booking/console");
  await page.getByRole("combobox", { name: "Service", exact: true }).selectOption(dinner);
  await page.getByRole("combobox", { name: "Bereich", exact: true }).selectOption(area2);
  await page.getByRole("button", { name: "Woche", exact: true }).click();
  const week = page.getByRole("region", { name: "Wochenübersicht", exact: true });
  const day = week.getByRole("article", { name: "Di., 20. Okt.", exact: true });
  await expect(day).toContainText("4 Gäste · 1 aktive Reservierung");
  await expect(day).toContainText("1 Anfrage");
  expect(fixture.weekRequests().at(-1)).toMatchObject({ p_start_date: "2026-10-19", p_service_id: dinner, p_area_id: area2 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("week-phone.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  const positions = await Promise.all((await week.getByRole("article").all()).map((card) => card.boundingBox()));
  expect(new Set(positions.map((position) => position?.y)).size).toBe(1);
  await page.screenshot({ path: test.info().outputPath("week-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 820 });
  await week.getByRole("button", { name: /Mi., 21. Okt.*Tagesbuch öffnen/ }).click();
  await expect(page.getByLabel("Datum · Europe/Zurich")).toHaveValue("2026-10-21");
  await expect(page.getByRole("combobox", { name: "Service", exact: true })).toHaveValue(dinner);
  await expect(page.getByRole("combobox", { name: "Bereich", exact: true })).toHaveValue(area2);
  await expect(page.getByRole("region", { name: "Reservierungen", exact: true })).toBeVisible();
});

test("closing a booked day requires explicit preservation and can be safely removed", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, planning: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Buchungssperre", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Buchungssperre", exact: true });
  await panel.getByLabel("Organisatorischer Grund (optional)").fill("Geschlossene Gesellschaft");
  await panel.getByRole("button", { name: "Buchungssperre speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("bestehende Reservierungen");
  await expect(panel.getByRole("button", { name: "Buchungssperre speichern", exact: true })).toBeDisabled();
  await panel.getByRole("checkbox", { name: "Bestehende Reservierungen ausdrücklich beibehalten", exact: true }).check();
  await panel.getByRole("button", { name: "Buchungssperre speichern", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Buchungssperren dieses Tages" }).getByRole("button").click();
  await panel.getByRole("button", { name: "Sperre aufheben", exact: true }).click();
  await panel.getByRole("button", { name: "Aufheben bestätigen", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toBeEnabled();
  expect(fixture.closureRequests()).toHaveLength(3);
  expect(fixture.bookingCalls()).toBe(0);
  expect(fixture.statusRequests()).toHaveLength(0);
});

test("an uncertain scoped closure freezes its exact payload for an identical retry", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, planning: true, uncertainClosure: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Buchungssperre", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Buchungssperre", exact: true });
  await panel.getByLabel("Datum der Sperre", { exact: true }).fill("2026-10-21");
  await panel.getByRole("checkbox", { name: "Ganzer Tag", exact: true }).uncheck();
  await panel.getByLabel("Beginn der Sperre", { exact: true }).fill("18:00");
  await panel.getByLabel("Ende der Sperre", { exact: true }).fill("19:00");
  await panel.getByRole("combobox", { name: "Service der Sperre", exact: true }).selectOption(dinner);
  await panel.getByRole("combobox", { name: "Bereich der Sperre", exact: true }).selectOption(area2);
  await panel.getByRole("button", { name: "Buchungssperre speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Speicherstatus ist unklar");
  await expect(panel.getByLabel("Datum der Sperre", { exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Unverändert erneut versuchen", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(fixture.closureRequests()).toHaveLength(2);
  expect(fixture.closureRequests()[0]).toEqual(fixture.closureRequests()[1]);
  expect(fixture.closureRequests()[0]).toMatchObject({ p_service_id: dinner, p_area_id: area2, p_start_time: "18:00", p_end_time: "19:00" });
});

test("a stale closure save preserves input and an incomplete week never appears empty", async ({ page }) => {
  await mockConsole(page, { seeded: true, planning: true, closureConflict: true, malformedWeek: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Woche", exact: true }).click();
  const week = page.getByRole("region", { name: "Wochenübersicht", exact: true });
  await expect(week.getByRole("alert")).toBeVisible();
  await expect(week.getByRole("article")).toHaveCount(0);
  await week.getByRole("button", { name: "Woche erneut laden", exact: true }).click();
  await expect(week.getByRole("article")).toHaveCount(7);
  await week.getByRole("article", { name: "Mi., 21. Okt.", exact: true }).getByRole("button", { name: "+ Buchungssperre", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Buchungssperre", exact: true });
  await panel.getByLabel("Organisatorischer Grund (optional)").fill("Entwurf beibehalten");
  await panel.getByRole("button", { name: "Buchungssperre speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("inzwischen");
  await expect(panel.getByLabel("Organisatorischer Grund (optional)")).toHaveValue("Entwurf beibehalten");
  await page.keyboard.press("Escape");
  await expect(panel.getByText("Ungespeicherte Eingaben verwerfen?", { exact: true })).toBeVisible();
});

test("the repeated autumn hour offers two distinct local times and sends the chosen instant", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, foldSlots: true });
  await page.goto("/booking/console");
  await page.getByLabel("Datum · Europe/Zurich").fill("2026-10-25");
  await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
  await panel.getByLabel("Gastname", { exact: true }).fill("Zeitumstellung Testgast");
  await panel.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "02:00 (UTC+2)" });
  await expect(panel.getByRole("combobox", { name: "Uhrzeit", exact: true }).getByRole("option", { name: "02:00 (UTC+1)", exact: true })).toHaveCount(1);
  await panel.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
  await panel.getByRole("button", { name: "Reservierung speichern", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(fixture.bookingCalls()).toBe(1);
  await expect(page.getByRole("button", { name: "Reservierung von Zeitumstellung Testgast öffnen", exact: true })).toHaveAccessibleDescription(/UTC\+2.*UTC\+1/);
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  await page.getByLabel("Belegung um").fill("02:30");
  await expect(page.getByRole("button", { name: /02:00 \(UTC\+2\) · Zeitumstellung Testgast/ })).toBeVisible();
  await page.getByLabel("Belegung um").fill("03:00");
  await expect(page.getByRole("button", { name: /Zeitumstellung Testgast/ })).toHaveCount(0);
});


test("leaving an uncertain closure reviews the possibly saved target date without claiming success", async ({ page }) => {
  await mockConsole(page, { seeded: true, planning: true, uncertainClosure: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Buchungssperre", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Buchungssperre", exact: true });
  await panel.getByLabel("Datum der Sperre", { exact: true }).fill("2026-10-21");
  await panel.getByRole("button", { name: "Buchungssperre speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Speicherstatus ist unklar");
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "Anfrage verlassen", exact: true }).click();
  await expect(page.getByLabel("Datum · Europe/Zurich")).toHaveValue("2026-10-21");
  await expect(page.getByRole("region", { name: "Buchungssperren dieses Tages", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("kann bereits gespeichert sein");
  await expect(page.getByText("Die Buchungssperre wurde gespeichert.", { exact: false })).toHaveCount(0);
});

test("a late weekly response cannot replace a newer room scope", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, planning: true, slowFirstWeek: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Woche", exact: true }).click();
  await expect.poll(() => fixture.weekRequests().length).toBe(1);
  await page.getByRole("combobox", { name: "Bereich", exact: true }).selectOption(area2);
  const day = page.getByRole("region", { name: "Wochenübersicht", exact: true }).getByRole("article", { name: "Di., 20. Okt.", exact: true });
  await expect(day).toContainText("4 Gäste · 1 aktive Reservierung");
  await expect.poll(() => fixture.weekReplies()).toContain("all");
  await expect(day).toContainText("4 Gäste · 1 aktive Reservierung");
  await expect(day).not.toContainText("8 Gäste");
  const before = fixture.readCalls();
  await day.getByRole("button", { name: /Tagesbuch öffnen/ }).click();
  await expect.poll(() => fixture.readCalls()).toBeGreaterThan(before);
});

test("a Safety denial from the week endpoint clears the whole private workspace", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, planning: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
  fixture.setReadError("safety");
  await page.getByRole("button", { name: "Woche", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Betreiberzugriff");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Wochenübersicht", exact: true })).toHaveCount(0);
});


test("a phone planning block can end at midnight with a reachable save action", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, planning: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Buchungssperre", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Buchungssperre", exact: true });
  await panel.getByLabel("Datum der Sperre", { exact: true }).fill("2026-10-21");
  await panel.getByRole("checkbox", { name: "Ganzer Tag", exact: true }).uncheck();
  await panel.getByRole("checkbox", { name: "Bis Tagesende", exact: true }).check();
  await expect(panel.getByText("Bis 00:00 des Folgetags", { exact: true })).toBeVisible();
  await panel.screenshot({ path: test.info().outputPath("closure-editor-phone.png") });
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await panel.getByRole("button", { name: "Buchungssperre speichern", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(fixture.closureRequests()[0]).toMatchObject({ p_start_time: "18:00", p_end_time: "24:00" });
  await expect(page.getByRole("region", { name: "Buchungssperren dieses Tages", exact: true })).toContainText("18:00–24:00");
});


test("a closure response timeout releases busy state and retries only its original saved patch", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, planning: true, deferClosureResponse: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Buchungssperre", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Buchungssperre", exact: true });
  await panel.getByLabel("Datum der Sperre", { exact: true }).fill("2026-10-21");
  await panel.getByRole("button", { name: "Buchungssperre speichern", exact: true }).click();
  await expect.poll(() => fixture.closureRequests().length).toBe(1);
  await page.clock.runFor(15_001);
  await expect(panel.getByRole("alert")).toContainText("Speicherstatus ist unklar");
  await expect(panel.getByRole("button", { name: "Schliessen", exact: true })).toBeEnabled();
  fixture.releaseClosureResponse();
  await panel.getByRole("button", { name: "Unverändert erneut versuchen", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(fixture.closureRequests()).toHaveLength(2);
  expect(fixture.closureRequests()[0]).toEqual(fixture.closureRequests()[1]);
});
