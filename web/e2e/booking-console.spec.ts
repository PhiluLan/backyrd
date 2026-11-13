import { expect, test, type Page } from "@playwright/test";
import type { BookingCombination, BookingSlot, BookingSpecialHours, BookingSetup, BookingSnapshot, BookingRole, BookingTeamRole } from "../lib/booking-api";

const spot = "51000000-0000-4000-8000-000000000001";
const owner = "51000000-0000-4000-8000-000000000099";
const reservationId = "51000000-0000-4000-8000-000000000020";
const area1 = "51000000-0000-4000-8000-000000000030";
const area2 = "51000000-0000-4000-8000-000000000031";
const table1 = "51000000-0000-4000-8000-000000000040";
const table2 = "51000000-0000-4000-8000-000000000041";
const dinner = "51000000-0000-4000-8000-000000000050";
const groupAB = "53000000-0000-4000-8000-000000000010";
const groupBC = "53000000-0000-4000-8000-000000000011";
const table3 = "53000000-0000-4000-8000-000000000042";
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

async function mockConsole(page: Page, options: { missingBackend?: boolean; noSpots?: boolean; conflict?: boolean; seeded?: boolean; slowFirstSlots?: boolean; uncertainCreate?: boolean; slotConflict?: boolean; lifecycle?: boolean; statusConflict?: boolean; uncertainStatus?: boolean; amendments?: boolean; amendSlotConflict?: boolean; amendRevisionConflict?: boolean; uncertainAmend?: boolean; slowAmendSlots?: boolean; unclosed?: boolean; walkIns?: boolean; walkInConflict?: boolean; uncertainWalkIn?: boolean; walkInClosed?: boolean; slowWalkInSlots?: boolean; deferWalkInWrite?: boolean; layouts?: boolean; layoutConflict?: boolean; uncertainLayout?: boolean; longSession?: boolean; sharedContext?: boolean; planning?: boolean; closureConflict?: boolean; uncertainClosure?: boolean; malformedWeek?: boolean; slowFirstWeek?: boolean; foldSlots?: boolean; deferClosureResponse?: boolean; teams?: boolean; teamRole?: BookingRole; requireJoin?: boolean; uncertainTeamInvite?: boolean; uncertainInviteAccept?: boolean; memberConflict?: boolean; teamSpotsDenied?: boolean; incompleteTeamBackend?: boolean; history?: boolean; hours?: boolean; uncertainHours?: boolean; hoursConflict?: boolean; hoursAffected?: number; deferHours?: boolean; combinations?: boolean; combinedSeed?: boolean; emptyCombinations?: boolean; uncertainCombination?: boolean; combinationConfigConflict?: boolean; malformedCombinedCreate?: boolean } = {}) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + (options.longSession ? 7 * 86400 : 3600);
  const actor = options.requireJoin || (options.teamRole && options.teamRole !== "owner") ? "51000000-0000-4000-8000-000000000111" : owner;
  const user = { id: actor, email: options.requireJoin ? "service@booking.invalid" : "operator@booking.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" };
  const session = { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: actor, role: "authenticated", exp: expires })}.local-signature`, refresh_token: "booking-test", token_type: "bearer", expires_in: 3600, expires_at: expires, user };
  await page.context().addCookies([{ name: "sb-127-auth-token", value: `base64-${encode(session)}`, domain: "127.0.0.1", path: "/" }]);
  const routing = options.sharedContext ? page.context() : page;
  await routing.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await routing.route("**/rest/v1/profiles?*", (route) => route.fulfill({ json: { display_name: "Test Operator", first_name: "Test", avatar_url: null } }));
  let snapshot: BookingSnapshot = options.seeded ? seededSnapshot() : { settings: null, areas: [], tables: [], services: [], reservations: [] };
  if (options.layouts) { snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: !!options.lifecycle, table_layouts: true }; snapshot.tables = snapshot.tables.map((table) => ({ ...table, layout: null })); }
  if (options.planning) { snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: !!snapshot.capabilities?.service_lifecycle, week_planning: true }; snapshot.closures = []; }
  if (options.hours) { snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: !!snapshot.capabilities?.service_lifecycle, special_hours: true }; snapshot.special_hours = []; snapshot.services = snapshot.services.map((row) => ({ ...row, ends_next_day: false })); }
  if (options.foldSlots && snapshot.settings) snapshot.settings.duration_minutes = 60;
  let currentTeamRole: BookingRole = options.teamRole ?? (options.requireJoin ? "host" : "owner");
  let teamRevoked = false, joined = !options.requireJoin, legacyOwnerCalls = 0;
  const access = () => ({ role: currentTeamRole, can_write: currentTeamRole !== "viewer", can_manage: ["owner", "manager"].includes(currentTeamRole), can_manage_team: currentTeamRole === "owner" });
  if (options.teams) snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: !!snapshot.capabilities?.service_lifecycle, team_access: true };
  const teamMembers = [{ user_id: "51000000-0000-4000-8000-000000000111", email: "service@booking.invalid", role: "host" as BookingTeamRole, revision: 0, revoked_at: null as string | null }];
  const teamInvitations: { id: string; email: string; role: BookingTeamRole; expires_at: string; accepted_at: string | null; revoked_at: string | null }[] = [];
  const teamInviteRequests: Record<string, unknown>[] = [], memberRequests: Record<string, unknown>[] = [], invitationRequests: Record<string, unknown>[] = [], accessRequests: Record<string, unknown>[] = [];
  const inviteBodies = new Map<string, string>();
  let savedSetup: BookingSetup | null = null;
  if (options.history) { snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: !!snapshot.capabilities?.service_lifecycle, reservation_history: true }; snapshot.reservations = snapshot.reservations.map((r) => ({ ...r, revision: 1 })); }
  if (options.lifecycle) snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: true };
  if (options.amendments) { snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: true, reservation_amendments: true }; snapshot.reservations = snapshot.reservations.map((r) => ({ ...r, revision: 0 })); }
  if (options.walkIns) {
    snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: true, reservation_amendments: true, current_seating: true, walk_ins: true };
    snapshot.operating_date = "2026-10-20";
    snapshot.reservations = snapshot.reservations.map((r) => ({ ...r, revision: 0, is_walk_in: false }));
    snapshot.services = snapshot.services.map((service) => service.id === lunch ? { ...service, closes_at: "17:00" } : service);
    if (options.slowWalkInSlots) snapshot.tables = snapshot.tables.map((table) => table.id === table1 ? { ...table, seats: 2 } : table);
  }
  if (options.incompleteTeamBackend && snapshot.capabilities) snapshot.capabilities.team_access = false;
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
  const hoursRequests: Record<string, unknown>[] = [];
  const hoursBodies = new Map<string, string>();
  let releaseHours = () => {};
  const hoursGate = new Promise<void>((resolve) => { releaseHours = resolve; });
  const combinationConfigRequests: Record<string, unknown>[] = [];
  const combinedWrites: Record<string, unknown>[] = [];
  const combinedOps = new Map<string, { body: string; result: unknown }>();
  if (options.combinations) {
    snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: true, reservation_amendments: true, current_seating: true, walk_ins: true, table_combinations: true };
    snapshot.operating_date = "2026-10-20";
    snapshot.tables = [...snapshot.tables.map((t) => ({ ...t, seats: 4, area_id: area1 })), { id: table3, label: "Fenster 3", area_id: area1, seats: 4, is_active: true }];
    snapshot.combinations = options.emptyCombinations ? [] : [
      { id: groupAB, name: "Familientisch", primary_table_id: table1, table_ids: [table1, table2], max_party_size: 8, is_active: true, is_available: true },
      { id: groupBC, name: "Gruppentisch", primary_table_id: table2, table_ids: [table2, table3], max_party_size: 8, is_active: true, is_available: true },
    ];
    snapshot.archived_combination_count = 0;
    snapshot.reservations = options.combinedSeed ? [{ ...snapshot.reservations[0], table_ids: [table1, table2], combination_id: groupAB, party_size: 6, revision: 0, is_walk_in: false }] : [];
  }
  const combinedChoices = (party: number, service: string, start: string, duration: number, amend = false): BookingSlot[] => {
    const end = new Date(Date.parse(start) + duration * 60_000).toISOString();
    const singles: BookingSlot[] = party <= 4 ? snapshot.tables.map((t) => ({ table_id: t.id, table_ids: [t.id], combination_id: null, service_id: service, starts_at: start, ends_at: end, allocation_label: t.label })) : [];
    const groups = (snapshot.combinations ?? []).filter((g) => g.is_active && g.max_party_size >= party && (!amend || g.id === groupBC)).map((g) => ({ table_id: g.primary_table_id, table_ids: g.table_ids, combination_id: g.id, service_id: service, starts_at: start, ends_at: end, allocation_label: g.name + " · " + g.table_ids.map((id) => snapshot.tables.find((t) => t.id === id)?.label).join(" + ") }));
    return [...singles, ...groups];
  };
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
    if (method === "get_owner_spots_v1") { legacyOwnerCalls++; return route.fulfill({ json: options.noSpots ? [] : [{ spot_id: spot, name: "Restaurant Testbetrieb", city: "Basel", address: null, category_name: "Restaurant", status: "approved", website: null }] }); }
    if (method === "booking_console_spots_v1") {
      if (!options.teams) return route.fulfill({ status: 404, json: { code: "PGRST202", message: "function not found" } });
      if (options.teamSpotsDenied) return route.fulfill({ status: 403, json: { code: "42501", message: "booking_operator_required" } });
      return route.fulfill({ json: !joined || teamRevoked || options.noSpots ? [] : [{ spot_id: spot, name: "Restaurant Testbetrieb", city: "Basel", access_role: currentTeamRole }] });
    }
    if (method === "booking_console_access_v1") {
      accessRequests.push(body);
      if (teamRevoked) return route.fulfill({ status: 403, json: { code: "42501", message: "booking_operator_required" } });
      return route.fulfill({ json: access() });
    }
    if (method === "booking_console_team_v1") return currentTeamRole === "owner" ? route.fulfill({ json: { members: teamMembers, invitations: teamInvitations } }) : route.fulfill({ status: 403, json: { code: "42501", message: "booking_operator_required" } });
    if (method === "booking_console_invite_v1") {
      teamInviteRequests.push(body);
      const previous = inviteBodies.get(body.p_request_id);
      if (previous && previous !== JSON.stringify(body)) return route.fulfill({ status: 400, json: { code: "22023", message: "booking_request_reused" } });
      if (!previous) { inviteBodies.set(body.p_request_id, JSON.stringify(body)); teamInvitations.push({ id: body.p_request_id, email: body.p_email, role: body.p_role, expires_at: "2026-10-27T12:00:00Z", accepted_at: null, revoked_at: null }); }
      if (options.uncertainTeamInvite && teamInviteRequests.length === 1) return route.fulfill({ status: 500, json: { message: "response_lost_after_accept" } });
      return route.fulfill({ json: { id: body.p_request_id, expires_at: "2026-10-27T12:00:00Z" } });
    }
    if (method === "booking_console_member_v1") {
      memberRequests.push(body); const member = teamMembers.find((row) => row.user_id === body.p_user_id)!;
      if (options.memberConflict) { member.role = "manager"; member.revision++; return route.fulfill({ status: 409, json: { code: "40001", message: "booking_changed_reload" } }); }
      if (body.p_role === null) member.revoked_at = "2026-10-20T12:00:00Z"; else member.role = body.p_role;
      member.revision++; return route.fulfill({ json: member.revision });
    }
    if (method === "booking_console_revoke_invite_v1") { const invitation = teamInvitations.find((row) => row.id === body.p_id); if (invitation) invitation.revoked_at = "2026-10-20T12:00:00Z"; return route.fulfill({ status: 204 }); }
    if (method === "booking_console_invitation_v1") {
      invitationRequests.push(body);
      if (body.p_token !== "e".repeat(64)) return route.fulfill({ status: 400, json: { code: "22023", message: "booking_invitation_unavailable" } });
      if (body.p_accept) joined = true;
      if (options.uncertainInviteAccept && body.p_accept && invitationRequests.filter((row) => row.p_accept).length === 1) return route.fulfill({ status: 500, json: { message: "response_lost_after_accept" } });
      return route.fulfill({ json: { spot_id: spot, spot_name: "Restaurant Testbetrieb", role: "host", expires_at: "2026-10-27T12:00:00Z", accepted: joined } });
    }
    if (options.missingBackend) return route.fulfill({ status: 404, json: { code: "PGRST202", message: "function not found" } });
    if (method === "booking_console_read_v1") {
      readCalls++;
      if (teamRevoked) return route.fulfill({ status: 403, json: { code: "42501", message: "booking_operator_required" } });
      const data = { ...snapshot, special_hours: (snapshot.special_hours ?? []).filter((h) => h.book_date <= body.p_date && h.book_date >= new Date(Date.parse(body.p_date + "T12:00:00Z") - 86400_000).toISOString().slice(0, 10)), ...(options.teams ? { access: access() } : {}), closures: (snapshot.closures ?? []).filter((row) => row.book_date === body.p_date), reservations: snapshot.reservations.filter((row) => row.starts_at.slice(0, 10) === body.p_date), unclosed_visits: options.unclosed && body.p_date === snapshot.operating_date ? snapshot.reservations.filter((row) => row.status === "seated" && row.starts_at.slice(0, 10) < body.p_date) : [] };
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
        return { date, active_reservations: active.length, active_guests: active.reduce((sum, row) => sum + row.party_size, 0), pending: rows.filter((row) => row.status === "pending").length, completed: rows.filter((row) => row.status === "completed").length, cancelled: rows.filter((row) => ["cancelled", "declined"].includes(row.status)).length, no_show: rows.filter((row) => row.status === "no_show").length, special_hours: (snapshot.special_hours ?? []).filter((h) => h.book_date === date && (!body.p_service_id || h.service_id === body.p_service_id)), closed: closures.some((closure) => !closure.start_time && !closure.area_id && !closure.service_id), closures };
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
    if (method === "booking_console_save_hours_v1") {
      hoursRequests.push(body);
      if (teamRevoked) return route.fulfill({ status: 403, json: { code: "42501", message: "booking_operator_required" } });
      const same = hoursBodies.get(body.p_id) === JSON.stringify(body);
      if (same) return route.fulfill({ json: { revision: snapshot.settings!.revision, existing_reservations: 0 } });
      if (options.hoursConflict || body.p_revision !== snapshot.settings!.revision) return route.fulfill({ status: 409, json: { code: "40001", message: "booking_setup_changed_reload" } });
      if (options.hoursAffected && !body.p_keep_existing) return route.fulfill({ status: 400, json: { code: "22023", message: "booking_hours_has_reservations", details: String(options.hoursAffected) } });
      const endDate = body.p_next_day ? new Date(Date.parse(body.p_date + "T12:00:00Z") + 86400_000).toISOString().slice(0, 10) : body.p_date;
      const h: BookingSpecialHours = { id: body.p_id, service_id: body.p_service_id, book_date: body.p_date, opens_at: body.p_opens_at, closes_at: body.p_closes_at, next_day: body.p_next_day, is_closed: body.p_closed, interval_minutes: body.p_interval, starts_at: body.p_closed ? null : fixtureInstant(body.p_date, body.p_opens_at), ends_at: body.p_closed ? null : fixtureInstant(endDate, body.p_closes_at), note: body.p_note || null };
      snapshot.special_hours = (snapshot.special_hours ?? []).filter((row) => row.id !== body.p_id);
      if (!body.p_archive) snapshot.special_hours.push(h);
      snapshot.settings!.revision++; hoursBodies.set(body.p_id, JSON.stringify(body));
      if (options.deferHours && hoursRequests.length === 1) await hoursGate;
      if (options.uncertainHours && hoursRequests.length === 1) return route.fulfill({ status: 503, json: { message: "saved_response_lost" } });
      return route.fulfill({ json: { revision: snapshot.settings!.revision, existing_reservations: options.hoursAffected ?? 0 } });
    }
    if (method === "booking_console_save_combination_v1") {
      combinationConfigRequests.push(body);
      if (teamRevoked || !["owner", "manager"].includes(currentTeamRole)) return route.fulfill({ status: 403, json: { code: "42501", message: "booking_operator_required" } });
      const g: BookingCombination = { id: body.p_id, name: body.p_name, primary_table_id: body.p_primary_table_id, table_ids: body.p_table_ids, max_party_size: body.p_max_party_size, is_active: body.p_active, is_available: body.p_active };
      const old = snapshot.combinations?.find((row) => row.id === body.p_id);
      const same = old && JSON.stringify(old) === JSON.stringify(g);
      if (options.combinationConfigConflict || (!same && body.p_revision !== snapshot.settings!.revision)) return route.fulfill({ status: 409, json: { code: "40001", message: "booking_setup_changed_reload" } });
      if (!same) { snapshot.combinations = [...(snapshot.combinations ?? []).filter((row) => row.id !== body.p_id), g]; snapshot.settings!.revision++; snapshot.archived_combination_count = snapshot.combinations.filter((row) => !row.is_active).length; }
      if (options.uncertainCombination && combinationConfigRequests.length === 1) return route.fulfill({ status: 503, json: { message: "saved_response_lost" } });
      return route.fulfill({ json: snapshot.settings!.revision });
    }
    if (method === "booking_console_slots_v2") return route.fulfill({ json: combinedChoices(body.p_party_size, body.p_service_id || dinner, body.p_date + "T" + (body.p_time || (body.p_reservation_id ? "19:00" : "18:00")) + ":00+02:00", body.p_duration_minutes || snapshot.settings!.duration_minutes, !!body.p_reservation_id) });
    if (method === "booking_console_walk_in_slots_v2") {
      const observed = "2026-10-20T12:00:00Z";
      const slots = combinedChoices(body.p_party_size, lunch, observed, body.p_duration_minutes).map((slot) => ({ ...slot, table_label: slot.allocation_label, seats: slot.combination_id ? snapshot.combinations!.find((g) => g.id === slot.combination_id)!.max_party_size : 4, area_id: area1, area_name: "Gastraum", service_name: "Mittag" }));
      return route.fulfill({ json: { observed_at: observed, services: [{ id: lunch, name: "Mittag" }], slots } });
    }
    if (["booking_console_create_v2", "booking_console_amend_v2", "booking_console_walk_in_v2"].includes(method!)) {
      combinedWrites.push(body);
      const saved = combinedOps.get(body.p_request_id);
      if (saved) return saved.body === JSON.stringify(body) ? route.fulfill({ json: saved.result }) : route.fulfill({ status: 400, json: { code: "22023", message: "booking_request_reused" } });
      if (options.amendRevisionConflict && method === "booking_console_amend_v2") return route.fulfill({ status: 409, json: { code: "40001", message: "booking_changed_reload" } });
      if (options.slotConflict) return route.fulfill({ status: 409, json: { code: "22023", message: "booking_slot_unavailable" } });
      const instant = method === "booking_console_walk_in_v2" ? "2026-10-20T12:02:00Z" : body.p_starts_at;
      const outcome = { id: body.p_reservation_id || (method === "booking_console_walk_in_v2" ? "53000000-0000-4000-8000-000000000060" : reservationId), service_id: body.p_service_id, table_id: body.p_table_id, table_ids: body.p_table_ids, combination_id: body.p_combination_id, starts_at: instant, ends_at: new Date(Date.parse(instant) + body.p_duration_minutes * 60_000).toISOString() };
      if (method === "booking_console_amend_v2") snapshot.reservations = snapshot.reservations.map((r) => r.id === body.p_reservation_id ? { ...r, ...outcome, guest_name: body.p_guest_name, guest_contact: body.p_guest_contact, note: body.p_note, party_size: body.p_party_size, revision: (r.revision ?? 0) + 1 } : r);
      else snapshot.reservations.push({ ...outcome, guest_name: body.p_guest_name?.trim() || "Walk-in", guest_contact: body.p_guest_contact || null, note: body.p_note || null, party_size: body.p_party_size, source: method === "booking_console_walk_in_v2" ? "walk_in" : body.p_source, status: method === "booking_console_walk_in_v2" ? "seated" : body.p_status, revision: 0, is_walk_in: method === "booking_console_walk_in_v2" });
      const result: unknown = method === "booking_console_amend_v2" ? body.p_reservation_id : outcome;
      combinedOps.set(body.p_request_id, { body: JSON.stringify(body), result });
      if ((options.uncertainCreate || options.uncertainAmend || options.uncertainWalkIn) && combinedWrites.length === 1) return route.fulfill({ status: 503, json: { message: "saved_response_lost" } });
      if (options.malformedCombinedCreate && combinedWrites.length === 1) return route.fulfill({ json: { ...outcome, table_ids: [body.p_table_id] } });
      return route.fulfill({ json: result });
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
  return { combinationConfigRequests: () => combinationConfigRequests, combinedWrites: () => combinedWrites, hoursRequests: () => hoursRequests, releaseHours, teamInviteRequests: () => teamInviteRequests, memberRequests: () => memberRequests, invitationRequests: () => invitationRequests, accessRequests: () => accessRequests, setTeamRole: (role: BookingRole) => { currentTeamRole = role; }, revokeTeam: () => { teamRevoked = true; }, legacyOwnerCalls: () => legacyOwnerCalls, releaseClosureResponse, closureRequests: () => closureRequests, weekRequests: () => weekRequests, weekReplies: () => weekReplies, readCalls: () => readCalls, setReadError: (error: typeof readError) => { readError = error; }, holdRead: () => { holdRead = true; readGate = new Promise<void>((resolve) => { releaseRead = () => { holdRead = false; resolve(); }; }); }, releaseRead: () => releaseRead(), layoutRequests: () => layoutRequests, setup: () => savedSetup, bookingCalls: () => bookingCalls, slotParties: () => slotParties, slotReplies: () => slotReplies, requestIds: () => requestIds, statusRequests: () => statusRequests, amendRequests: () => amendRequests, amendParties: () => amendParties, walkInRequests: () => walkInRequests, walkInParties: () => walkInParties, walkInReplies: () => walkInReplies, releaseWalkInWrite, session };
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


for (const role of ["viewer", "host", "manager"] as const) {
  test("the " + role + " role exposes only its Booking actions", async ({ page }) => {
    await mockConsole(page, { seeded: true, teams: true, teamRole: role, amendments: true, layouts: true, planning: true });
    await page.goto("/booking/console");
    await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Team verwalten", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Einrichtung", exact: true })).toHaveCount(role === "manager" ? 1 : 0);
    await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toHaveCount(role === "viewer" ? 0 : 1);
    await expect(page.getByRole("button", { name: "+ Buchungssperre", exact: true })).toHaveCount(role === "manager" ? 1 : 0);
    await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Reservierung", exact: true });
    await expect(panel.getByRole("button", { name: "Reservierung bearbeiten", exact: true })).toHaveCount(role === "viewer" ? 0 : 1);
    await expect(panel.getByRole("button", { name: "Stornieren", exact: true })).toHaveCount(role === "viewer" ? 0 : 1);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
    await page.getByRole("button", { name: "Tischplan", exact: true }).click();
    await expect(page.getByRole("button", { name: "Tischplan bearbeiten", exact: true })).toHaveCount(role === "manager" ? 1 : 0);
  });
}

test("a changed team role closes an open guest draft and reloads read-only access", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, teams: true, teamRole: "host" });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
  await panel.getByLabel("Gastname", { exact: true }).fill("Nicht unter alten Rechten speichern");
  fixture.setTeamRole("viewer");
  await page.clock.runFor(30_000);
  await expect(panel).toHaveCount(0);
  await expect(page.getByText("Dein Zugang: Nur lesen", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toHaveCount(0);
  expect(fixture.bookingCalls()).toBe(0);
});

test("revocation is checked while a private reservation dialog is open", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, teams: true, teamRole: "host" });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true }).click();
  fixture.revokeTeam();
  await page.clock.runFor(30_000);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Betreiberzugriff");
  expect(fixture.accessRequests().length).toBeGreaterThan(0);
});

test("an uncertain team invite retries one secret and exposes no token in the request URL", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, teams: true, uncertainTeamInvite: true });
  const urls: string[] = []; page.on("request", (request) => urls.push(request.url()));
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Team verwalten", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Teamzugänge", exact: true });
  await panel.getByLabel("E-Mail der eingeladenen Person", { exact: true }).fill("new@booking.invalid");
  await panel.getByRole("combobox", { name: "Rolle der Einladung", exact: true }).selectOption("manager");
  await panel.getByRole("button", { name: "Einladungslink erstellen", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Ausgang ist unklar");
  await expect(panel.getByLabel("E-Mail der eingeladenen Person", { exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Unverändert erneut versuchen", exact: true }).click();
  const link = await panel.getByLabel("Einladungslink", { exact: true }).inputValue();
  expect(new URL(link).search).toBe(""); expect(new URL(link).hash).toMatch(/^#invite=[0-9a-f]{64}$/);
  expect(fixture.teamInviteRequests()).toHaveLength(2);
  expect(fixture.teamInviteRequests()[0]).toEqual(fixture.teamInviteRequests()[1]);
  expect(urls.some((url) => url.includes(String(fixture.teamInviteRequests()[0].p_token)))).toBe(false);
  await panel.screenshot({ path: test.info().outputPath("team-phone.png") });
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("a stale team role keeps the captured revision until the owner discards the draft", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, teams: true, memberConflict: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Team verwalten", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Teamzugänge", exact: true });
  await panel.getByRole("combobox", { name: "Rolle für service@booking.invalid", exact: true }).selectOption("viewer");
  await panel.getByRole("button", { name: "Rolle speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "Rolle für service@booking.invalid", exact: true })).toHaveValue("viewer");
  await expect(panel.getByRole("button", { name: "Team aktualisieren", exact: true })).toBeDisabled();
  expect(fixture.memberRequests()[0]).toMatchObject({ p_revision: 0, p_role: "viewer" });
  await panel.getByRole("button", { name: "Rollenentwurf verwerfen", exact: true }).click();
  await panel.getByRole("button", { name: "Team aktualisieren", exact: true }).click();
  await expect(panel.getByRole("combobox", { name: "Rolle für service@booking.invalid", exact: true })).toHaveValue("manager");
});

test("an invitation survives login in its tab without a token in login URLs", async ({ page, context }) => {
  const fixture = await mockConsole(page, { seeded: true, teams: true, requireJoin: true });
  await context.clearCookies();
  const token = "e".repeat(64);
  const urls: string[] = []; page.on("request", (request) => urls.push(request.url()));
  await page.goto("/booking/console#invite=" + token);
  await expect(page.getByRole("link", { name: "Mit Backyrd anmelden", exact: true })).toHaveAttribute("href", "/login?next=%2Fbooking%2Fconsole");
  expect(new URL(page.url()).hash).toBe("");
  expect(await page.evaluate(() => sessionStorage.getItem("backyrd.booking.pending-invitation.v1"))).toContain(token);
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(fixture.session)).toString("base64url"), domain: "127.0.0.1", path: "/" }]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Restaurant Testbetrieb", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Einladung annehmen", exact: true })).toBeVisible();
  expect(fixture.invitationRequests().filter((row) => row.p_accept)).toHaveLength(0);
  await page.getByRole("button", { name: "Einladung annehmen", exact: true }).click();
  await expect(page.getByText("Dein Zugang: Service", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("backyrd.booking.pending-invitation.v1"))).toBe(null);
  expect(urls.some((url) => url.includes(token))).toBe(false);
});

test("an uncertain invitation acceptance repeats the same link and never grants owner controls", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, teams: true, requireJoin: true, uncertainInviteAccept: true });
  await page.goto("/booking/console#invite=" + "e".repeat(64));
  await page.getByRole("button", { name: "Einladung annehmen", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("kann bereits gespeichert sein");
  await page.getByRole("button", { name: "Annahme unverändert wiederholen", exact: true }).click();
  await expect(page.getByText("Dein Zugang: Service", { exact: true })).toBeVisible();
  const writes = fixture.invitationRequests().filter((row) => row.p_accept);
  expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1]);
  await expect(page.getByRole("button", { name: "Team verwalten", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Einrichtung", exact: true })).toHaveCount(0);
});

test("a denied new team spot endpoint never falls back to Owner discovery", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, teams: true, teamSpotsDenied: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("heading", { name: "Zugang konnte nicht geladen werden.", exact: true })).toBeVisible();
  expect(fixture.legacyOwnerCalls()).toBe(0);
});


test("an incomplete delegated backend never renders Owner permissions for a staff account", async ({ page }) => {
  await mockConsole(page, { seeded: true, teams: true, teamRole: "host", incompleteTeamBackend: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("noch nicht vollständig");
  await expect(page.getByRole("button", { name: "+ Neue Reservierung", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toHaveCount(0);
});


test("the owner explicitly revokes a member and a pending invitation", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, teams: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Team verwalten", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Teamzugänge", exact: true });
  await panel.getByRole("button", { name: "Zugang für service@booking.invalid entziehen", exact: true }).click();
  expect(fixture.memberRequests()).toHaveLength(0);
  await panel.getByRole("button", { name: "Entzug bestätigen", exact: true }).click();
  await expect(panel.getByRole("article", { name: "service@booking.invalid", exact: true })).toContainText("Zugang entzogen");
  expect(fixture.memberRequests()[0]).toMatchObject({ p_revision: 0, p_role: null });
  await panel.getByLabel("E-Mail der eingeladenen Person", { exact: true }).fill("pending@booking.invalid");
  await panel.getByRole("button", { name: "Einladungslink erstellen", exact: true }).click();
  await panel.getByRole("button", { name: "Link für pending@booking.invalid widerrufen", exact: true }).click();
  await panel.getByRole("button", { name: "Entzug bestätigen", exact: true }).click();
  await expect(panel.getByText("Der Einladungslink wurde widerrufen.", { exact: true })).toBeVisible();
});

test("expired tab credentials are discarded and an active invitation handoff expires after an hour", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, teams: true, teamRole: "host" });
  await page.addInitScript(() => sessionStorage.setItem("backyrd.booking.pending-invitation.v1", JSON.stringify({ token: "e".repeat(64), receivedAt: 0 })));
  await page.goto("/booking/console");
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
  expect(fixture.invitationRequests()).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem("backyrd.booking.pending-invitation.v1"))).toBe(null);
  await page.goto("/booking/console#invite=" + "e".repeat(64));
  await expect(page.getByRole("button", { name: "Zur Booking Console", exact: true })).toBeVisible();
  await page.clock.fastForward("01:00:01");
  await expect(page.getByRole("heading", { name: "Einladung erneut öffnen.", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("backyrd.booking.pending-invitation.v1"))).toBe(null);
});

function historyEvent(index: number, detailed = false) {
  const state = { revision: 0, status: "confirmed", party_size: 2, starts_at: "2026-10-20T16:00:00Z", ends_at: "2026-10-20T18:00:00Z", table_id: table1, table_label: "Fenster 1", service_id: dinner, service_name: "Abendservice", arrived_at: null, seated_at: null, completed_at: null };
  return { id: `52000000-0000-4000-8000-${String(index).padStart(12, "0")}`, at: "2026-10-20T11:00:00Z", action: detailed ? "reservation_amended" : "reservation_created", actor_id: owner, actor_is_you: true, details: detailed ? { schema: "reservation_history_v1", actor_role: "owner", before: { ...state, party_size: 4, revision: 0, table_id: table2, table_label: "Garten 2" }, after: { ...state, revision: 1 }, changed_fields: ["guest_contact", "note"] } : null };
}
function historyPage(events: ReturnType<typeof historyEvent>[], next: string | null = null, revision = 1) {
  return { reservation_id: reservationId, revision, observed_at: "2026-10-20T12:00:00Z", events, next_cursor: next };
}
async function openHistory(page: Page) {
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true }).click();
  await page.getByRole("button", { name: "Änderungsverlauf anzeigen", exact: true }).click();
  return page.getByRole("region", { name: "Änderungsverlauf", exact: true });
}

test("history loads on demand and shows actual changes and honest legacy entries on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, history: true });
  const requests: object[] = [];
  await page.route("**/rest/v1/rpc/booking_console_history_v1", async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ json: historyPage([historyEvent(2, true), historyEvent(1)]) }); });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Änderungsverlauf anzeigen", exact: true }).click();
  const history = page.getByRole("region", { name: "Änderungsverlauf", exact: true });
  await expect(history.getByRole("heading", { name: "Reservierung bearbeitet", exact: true })).toBeVisible();
  await expect(history).toContainText("Vorher: 4");
  await expect(history).toContainText("Jetzt: 2");
  await expect(history).toContainText("Vorher: Garten 2");
  await expect(history).toContainText("Jetzt: Fenster 1");
  await expect(history).toContainText("Kontakt aktualisiert · Interne Notiz aktualisiert");
  await expect(history).toContainText("Für diesen älteren Eintrag sind keine Detailwerte gespeichert.");
  expect(requests).toEqual([{ p_spot_id: spot, p_reservation_id: reservationId, p_before_id: null }]);
  expect(fixture.bookingCalls()).toBe(0);
  expect(await history.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await history.screenshot({ path: test.info().outputPath("history-phone.png") });
});

test("history keyset pagination appends once and retry retains existing entries honestly", async ({ page }) => {
  await mockConsole(page, { seeded: true, history: true, teams: true, teamRole: "viewer" });
  const rows = Array.from({ length: 50 }, (_, i) => historyEvent(100 - i));
  const calls: Record<string, unknown>[] = [];
  let fail = true;
  await page.route("**/rest/v1/rpc/booking_console_history_v1", async (route) => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (!body.p_before_id) return route.fulfill({ json: historyPage(rows, rows.at(-1)!.id) });
    if (fail) { fail = false; return route.fulfill({ status: 503, json: { message: "network error" } }); }
    return route.fulfill({ json: historyPage([historyEvent(50), historyEvent(49)]) });
  });
  const history = await openHistory(page);
  await expect(history.getByRole("listitem")).toHaveCount(50);
  await history.getByRole("button", { name: "Ältere Einträge laden", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("Die bisherigen Einträge bleiben sichtbar");
  await expect(history.getByRole("listitem")).toHaveCount(50);
  await history.getByRole("button", { name: "Ältere Einträge laden", exact: true }).click();
  await expect(history.getByRole("listitem")).toHaveCount(52);
  await expect(history.getByRole("button", { name: "Ältere Einträge laden", exact: true })).toHaveCount(0);
  expect(calls[1]).toEqual(calls[2]);
  expect(calls[1].p_before_id).toBe(rows.at(-1)!.id);
  await expect(page.getByRole("button", { name: "Stornieren", exact: true })).toHaveCount(0);
});

for (const reason of ["denied", "safety"] as const) {
  test("history " + reason + " clears the whole private reservation workspace", async ({ page }) => {
    await mockConsole(page, { seeded: true, history: true });
    await page.route("**/rest/v1/rpc/booking_console_history_v1", (route) => route.fulfill({ status: reason === "denied" ? 403 : 400, json: reason === "denied" ? { code: "42501", message: "booking_operator_required" } : { code: "P0001", message: "SAFETY_ACCOUNT_RESTRICTED" } }));
    await openHistory(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Betreiberzugriff");
  });
}

test("history failure and a malformed reply never become a fabricated empty history", async ({ page }) => {
  await mockConsole(page, { seeded: true, history: true });
  let calls = 0;
  await page.route("**/rest/v1/rpc/booking_console_history_v1", (route) => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 503, json: { message: "network error" } }) : calls === 2 ? route.fulfill({ json: { ...historyPage([historyEvent(1)]), reservation_id: table2 } }) : route.fulfill({ json: historyPage([]) });
  });
  const history = await openHistory(page);
  await expect(history.getByRole("alert")).toContainText("Es konnte kein Verlauf geladen werden");
  await expect(history.getByText("Für diese Reservierung sind noch keine Einträge vorhanden.", { exact: true })).toHaveCount(0);
  await history.getByRole("button", { name: "Verlauf aktualisieren", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("ungültige Antwort");
  await history.getByRole("button", { name: "Verlauf aktualisieren", exact: true }).click();
  await expect(history.getByText("Für diese Reservierung sind noch keine Einträge vorhanden.", { exact: true })).toBeVisible();
});

test("a newer canonical history revision asks for a reservation reload", async ({ page }) => {
  await mockConsole(page, { seeded: true, history: true, amendments: true });
  await page.route("**/rest/v1/rpc/booking_console_history_v1", (route) => route.fulfill({ json: historyPage([historyEvent(2, true)], null, 2) }));
  const history = await openHistory(page);
  await expect(history).toContainText("Die Reservierung wurde inzwischen geändert.");
  await expect(history.getByRole("button", { name: "Reservierung neu laden", exact: true })).toBeVisible();
});

test("a history reply after logout cannot restore private content", async ({ page }) => {
  await mockConsole(page, { seeded: true, history: true });
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let called = false;
  await page.route("**/rest/v1/rpc/booking_console_history_v1", async (route) => { called = true; await gate; try { await route.fulfill({ json: historyPage([historyEvent(2, true)]) }); } catch { /* cancelled request after sign-out */ } });
  await openHistory(page);
  await expect.poll(() => called).toBe(true);
  await page.evaluate(() => { const channel = new BroadcastChannel("sb-127-auth-token"); channel.postMessage({ event: "SIGNED_OUT", session: null }); channel.close(); });
  await expect(page.getByRole("link", { name: "Zur Booking Console anmelden", exact: true })).toBeVisible();
  release();
  await expect(page.getByRole("region", { name: "Änderungsverlauf", exact: true })).toHaveCount(0);
  await expect(page.getByText("Kontakt aktualisiert", { exact: false })).toHaveCount(0);
});

async function openHours(page: Page) {
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Sonderzeiten", exact: true }).click();
  return page.getByRole("dialog", { name: "Sonderzeiten", exact: true });
}

test("a phone operator configures a regular weekly overnight service", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, hours: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Einrichtung", exact: true }).click();
  await page.getByRole("button", { name: "Servicezeiten", exact: false }).click();
  await page.getByRole("checkbox", { name: "Ende am Folgetag für Service 1", exact: true }).check();
  await page.getByLabel("Ende für Service 1", { exact: true }).fill("02:00");
  await page.getByRole("button", { name: "Einrichtung speichern", exact: true }).click();
  await expect(page.getByText("Die Einrichtung wurde gespeichert.", { exact: true })).toBeVisible();
  expect(fixture.setup()?.services[0]).toMatchObject({ closes_at: "02:00", ends_next_day: true });
  await page.reload();
  await page.getByRole("button", { name: "Einrichtung", exact: true }).click();
  await page.getByRole("button", { name: "Servicezeiten", exact: false }).click();
  await expect(page.getByRole("checkbox", { name: "Ende am Folgetag für Service 1", exact: true })).toBeChecked();
  await expect(page.getByLabel("Ende für Service 1", { exact: true })).toHaveValue("02:00");
});

test("special service hours save a night window and show its carryover on the next actual calendar day", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, hours: true, planning: true });
  const panel = await openHours(page);
  await panel.getByRole("checkbox", { name: "Ende am Folgetag", exact: true }).check();
  await panel.getByLabel("Serviceende", { exact: true }).fill("02:00");
  await panel.getByLabel("Buchungsintervall in Minuten", { exact: true }).fill("");
  await expect(panel.getByLabel("Buchungsintervall in Minuten", { exact: true })).toHaveValue("");
  await expect(panel.getByRole("button", { name: "Sonderzeiten speichern", exact: true })).toBeDisabled();
  await panel.getByLabel("Buchungsintervall in Minuten", { exact: true }).fill("30");
  await panel.screenshot({ path: test.info().outputPath("special-hours-phone.png") });
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await panel.getByRole("button", { name: "Sonderzeiten speichern", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(fixture.hoursRequests()[0]).toMatchObject({ p_date: "2026-10-20", p_opens_at: "18:00", p_closes_at: "02:00", p_next_day: true, p_closed: false, p_interval: 30 });
  await page.getByRole("button", { name: "Nächster Tag", exact: true }).click();
  const context = page.getByRole("region", { name: "Sonderzeiten im Tageskontext", exact: true });
  await expect(context).toContainText("18:00–02:00 am Folgetag");
  await page.getByRole("button", { name: "Woche", exact: true }).click();
  await expect(page.getByRole("region", { name: "Wochenübersicht", exact: true })).toContainText("18:00–02:00 am Folgetag");
});

test("a closed special service keeps guests only after explicit acknowledgement and archives back to weekly hours", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, hours: true, hoursAffected: 2 });
  const panel = await openHours(page);
  await panel.getByRole("checkbox", { name: "Service mit diesem Beginn entfällt", exact: true }).check();
  await panel.getByRole("button", { name: "Sonderzeiten speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Bestätige ausdrücklich");
  await expect(panel.getByRole("button", { name: "Sonderzeiten speichern", exact: true })).toBeDisabled();
  await panel.getByRole("checkbox", { name: "Bestehende Reservierungen ausdrücklich beibehalten", exact: true }).check();
  await panel.getByRole("button", { name: "Sonderzeiten speichern", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("region", { name: "Sonderzeiten im Tageskontext", exact: true }).getByRole("button", { name: /Service entfällt/ }).click();
  const existing = page.getByRole("dialog", { name: "Sonderzeiten", exact: true });
  await existing.getByLabel("Buchungsintervall in Minuten", { exact: true }).fill("");
  await existing.getByRole("button", { name: "Wochenzeiten wieder verwenden", exact: true }).click();
  await expect(existing.getByRole("status")).toContainText("archiviert");
  await existing.getByRole("checkbox", { name: "Bestehende Reservierungen ausdrücklich beibehalten", exact: true }).check();
  await existing.getByRole("button", { name: "Wochenzeiten bestätigen", exact: true }).click();
  await expect(existing).toHaveCount(0);
  expect(fixture.hoursRequests().at(-1)).toMatchObject({ p_archive: true, p_keep_existing: true });
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toBeVisible();
});

test("uncertain special hours freeze and repeat exactly one configuration patch", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, hours: true, uncertainHours: true });
  const panel = await openHours(page);
  await panel.getByLabel("Organisatorischer Hinweis (optional)", { exact: true }).fill("Synthetischer Sonderanlass");
  await panel.getByRole("button", { name: "Sonderzeiten speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Speicherstatus ist unklar");
  await expect(panel.getByLabel("Servicebeginn", { exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Unverändert erneut versuchen", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(fixture.hoursRequests()).toHaveLength(2);
  expect(fixture.hoursRequests()[0]).toEqual(fixture.hoursRequests()[1]);
});

test("special-hours deadlines preserve an identical retry and stale configuration cannot fake success", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, hours: true, deferHours: true });
  const panel = await openHours(page);
  await panel.getByRole("button", { name: "Sonderzeiten speichern", exact: true }).click();
  await expect.poll(() => fixture.hoursRequests().length).toBe(1);
  await page.clock.runFor(15_001);
  await expect(panel.getByRole("alert")).toContainText("Speicherstatus ist unklar");
  fixture.releaseHours();
  await panel.getByRole("button", { name: "Unverändert erneut versuchen", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(fixture.hoursRequests()[0]).toEqual(fixture.hoursRequests()[1]);
});

test("a stale hours revision preserves the editor and never reports saved special hours", async ({ page }) => {
  await mockConsole(page, { seeded: true, hours: true, hoursConflict: true });
  const panel = await openHours(page);
  await panel.getByLabel("Organisatorischer Hinweis (optional)", { exact: true }).fill("Nicht verlieren");
  await panel.getByRole("button", { name: "Sonderzeiten speichern", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("inzwischen geändert");
  await expect(panel.getByLabel("Organisatorischer Hinweis (optional)", { exact: true })).toHaveValue("Nicht verlieren");
  await expect(page.getByText("Die Sonderzeiten wurden gespeichert. Bestehende Reservierungen bleiben erhalten.", { exact: true })).toHaveCount(0);
});

for (const role of ["viewer", "host"] as const) {
  test(role + " reads special hours without configuration actions", async ({ page }) => {
    await mockConsole(page, { seeded: true, hours: true, teams: true, teamRole: role });
    await page.goto("/booking/console");
    await expect(page.getByRole("region", { name: "Sonderzeiten im Tageskontext", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Sonderzeiten", exact: true })).toHaveCount(0);
  });
}

test("revoked management rights close a private special-hours draft", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, hours: true, teams: true, teamRole: "manager" });
  const panel = await openHours(page);
  await panel.getByLabel("Organisatorischer Hinweis (optional)", { exact: true }).fill("Nicht nach Rechteentzug speichern");
  fixture.revokeTeam();
  await page.clock.runFor(30_000);
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Sonderzeiten im Tageskontext", exact: true })).toHaveCount(0);
  expect(fixture.hoursRequests()).toHaveLength(0);
});


test("a midnight-crossing reservation names the following day in its editor, book and details", async ({ page }) => {
  await mockConsole(page, { seeded: true, hours: true });
  await page.route("**/rest/v1/rpc/booking_console_slots_v1", (route) => route.fulfill({ json: [{ service_id: dinner, table_id: table1, starts_at: "2026-10-20T23:30:00+02:00", ends_at: "2026-10-21T01:30:00+02:00" }] }));
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
  await panel.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "23:30" });
  await panel.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
  await panel.getByLabel("Gastname", { exact: true }).fill("Synthetischer Nachtgast");
  await expect(panel).toContainText("01:30 (+1 Tag)");
  await panel.getByRole("button", { name: "Reservierung speichern", exact: true }).click();
  const row = page.getByRole("button", { name: "Reservierung von Synthetischer Nachtgast öffnen", exact: true });
  await expect(row).toContainText("01:30 (+1 Tag)");
  await row.click();
  await expect(page.getByRole("dialog", { name: "Reservierung", exact: true })).toContainText("01:30 (+1 Tag)");
});

test("a phone manager configures a compatible table combination with editable numeric drafts", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const fixture = await mockConsole(page, { seeded: true, combinations: true, emptyCombinations: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Tischkombinationen verwalten", exact: true }).click();
  await page.getByRole("button", { name: "Neue Kombination", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Neue Tischkombination", exact: true });
  await editor.getByLabel("Name der Kombination", { exact: true }).fill("Gemeinsamer Tisch");
  await editor.getByRole("checkbox", { name: "Fenster 1 · 4 Plätze", exact: true }).check();
  await editor.getByRole("checkbox", { name: "Terrasse 2 · 4 Plätze", exact: true }).check();
  await editor.getByLabel("Maximale Personen dieser Kombination", { exact: true }).fill("");
  await expect(editor.getByLabel("Maximale Personen dieser Kombination", { exact: true })).toHaveValue("");
  await expect(editor.getByRole("button", { name: "Kombination speichern", exact: true })).toBeDisabled();
  await editor.getByLabel("Maximale Personen dieser Kombination", { exact: true }).fill("6");
  await editor.screenshot({ path: test.info().outputPath("combination-phone.png") });
  expect(await editor.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await editor.getByRole("button", { name: "Kombination speichern", exact: true }).click();
  const list = page.getByRole("dialog", { name: "Tischkombinationen", exact: true });
  await expect(list).toContainText("Gemeinsamer Tisch");
  expect(fixture.combinationConfigRequests()[0]).toMatchObject({ p_name: "Gemeinsamer Tisch", p_max_party_size: 6, p_active: true });
  expect(fixture.combinationConfigRequests()[0].p_table_ids).toEqual([table1, table2]);
  await list.getByRole("button", { name: "Schliessen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Aktualisieren", exact: true })).toBeEnabled();
});

async function enterCombinedBooking(page: Page, guest = "Synthetische Tischgruppe") {
  await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
  await panel.getByRole("button", { name: "6 Personen", exact: true }).click();
  await panel.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "18:00" });
  await panel.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
  await panel.getByLabel("Gastname", { exact: true }).fill(guest);
  return panel;
}

test("a six-person reservation books every table but counts its guests once", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, combinations: true });
  await page.goto("/booking/console");
  const panel = await enterCombinedBooking(page);
  await expect(panel).toContainText("Familientisch · Fenster 1 + Terrasse 2");
  await panel.getByRole("button", { name: "Reservierung speichern", exact: true }).click();
  const row = page.getByRole("button", { name: "Reservierung von Synthetische Tischgruppe öffnen", exact: true });
  await expect(row).toContainText("Fenster 1 + Terrasse 2");
  await expect(page.getByLabel("Buchungsübersicht der Auswahl", { exact: true }).getByText("6", { exact: true })).toHaveCount(1);
  expect(fixture.combinedWrites()[0]).toMatchObject({ p_table_id: table1, p_table_ids: [table1, table2], p_combination_id: groupAB, p_party_size: 6 });
  await row.click();
  await expect(page.getByRole("dialog", { name: "Reservierung", exact: true })).toContainText("Fenster 1 + Terrasse 2");
});

test("seating and departure appear on every physical member of a table combination", async ({ page }) => {
  await mockConsole(page, { seeded: true, combinations: true, combinedSeed: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Reservierung", exact: true });
  await details.getByRole("button", { name: "Am Tisch platzieren", exact: true }).click();
  await details.getByRole("button", { name: "Status speichern", exact: true }).click();
  await details.getByRole("button", { name: "Schliessen", exact: true }).click();
  await page.getByRole("button", { name: "Tischübersicht", exact: true }).click();
  for (const name of ["Fenster 1", "Terrasse 2"]) {
    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(card.getByRole("button", { name: "Laufenden Besuch von Testgast Abend öffnen", exact: true })).toBeVisible();
    await expect(card).toContainText("6 Personen in der Tischgruppe");
  }
  await page.getByRole("button", { name: "Laufenden Besuch von Testgast Abend öffnen", exact: true }).first().click();
  await details.getByRole("button", { name: "Besuch beenden", exact: true }).click();
  await details.getByRole("button", { name: "Status speichern", exact: true }).click();
  await details.getByRole("button", { name: "Schliessen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Laufenden Besuch von Testgast Abend öffnen", exact: true })).toHaveCount(0);
});

test("a combined amendment changes the complete member set including its primary", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, combinations: true, combinedSeed: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true }).click();
  await page.getByRole("button", { name: "Reservierung bearbeiten", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Reservierung bearbeiten", exact: true });
  await expect(editor).toContainText("Fenster 1 + Terrasse 2");
  await editor.getByRole("checkbox", { name: "Zeit, Personen oder Tisch ändern", exact: true }).check();
  await editor.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "19:00" });
  await editor.getByRole("combobox", { name: "Tisch", exact: true }).selectOption("0");
  await editor.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Reservierung", exact: true })).toContainText("Terrasse 2 + Fenster 3");
  expect(fixture.combinedWrites()[0]).toMatchObject({ p_table_id: table2, p_table_ids: [table2, table3], p_combination_id: groupBC, p_expected_revision: 0 });
});

for (const malformed of [false, true]) {
  test("an uncertain combined creation preserves its exact members: " + (malformed ? "malformed response" : "lost response"), async ({ page }) => {
    const fixture = await mockConsole(page, { seeded: true, combinations: true, uncertainCreate: !malformed, malformedCombinedCreate: malformed });
    await page.goto("/booking/console");
    const panel = await enterCombinedBooking(page);
    await panel.getByRole("button", { name: "Reservierung speichern", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Speicherstatus ist unklar");
    await expect(panel.getByRole("combobox", { name: "Tisch", exact: true })).toBeDisabled();
    await panel.getByRole("button", { name: "Reservierung speichern", exact: true }).click();
    await expect(panel).toHaveCount(0);
    expect(fixture.combinedWrites()).toHaveLength(2);
    expect(fixture.combinedWrites()[0]).toEqual(fixture.combinedWrites()[1]);
    await expect(page.getByRole("button", { name: "Reservierung von Synthetische Tischgruppe öffnen", exact: true })).toHaveCount(1);
  });
}

test("an uncertain combination definition is retried without changing its selected tables", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, combinations: true, uncertainCombination: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Tischkombinationen verwalten", exact: true }).click();
  await page.getByRole("button", { name: /Familientisch/, exact: false }).click();
  const editor = page.getByRole("dialog", { name: "Kombination bearbeiten", exact: true });
  await editor.getByLabel("Name der Kombination", { exact: true }).fill("Geänderter Gruppentisch");
  await editor.getByRole("button", { name: "Kombination speichern", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("Ausgang ist unklar");
  await expect(editor.getByLabel("Name der Kombination", { exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "Unverändert erneut versuchen", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Tischkombinationen", exact: true })).toContainText("Geänderter Gruppentisch");
  expect(fixture.combinationConfigRequests()[0]).toEqual(fixture.combinationConfigRequests()[1]);
});

for (const role of ["viewer", "host"] as const) {
  test(role + " reads full table membership without combination management rights", async ({ page }) => {
    await mockConsole(page, { seeded: true, combinations: true, combinedSeed: true, teams: true, teamRole: role });
    await page.goto("/booking/console");
    await expect(page.getByRole("button", { name: "Tischkombinationen verwalten", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toContainText("Fenster 1 + Terrasse 2");
  });
}

test("a combined walk-in retains both tables through an uncertain admission retry", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, combinations: true, uncertainWalkIn: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Walk-in für jetzt", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Walk-in platzieren", exact: true });
  await panel.getByRole("button", { name: "6 Personen", exact: true }).click();
  await panel.getByRole("button", { name: /Familientisch.*wählen/ }).click();
  await panel.getByRole("button", { name: "Walk-in platzieren", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Speicherergebnis ist unklar");
  await panel.getByRole("button", { name: "Unverändert erneut versuchen", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(fixture.combinedWrites()[0]).toEqual(fixture.combinedWrites()[1]);
  expect(fixture.combinedWrites()[0]).toMatchObject({ p_table_ids: [table1, table2], p_combination_id: groupAB });
  await expect(page.getByRole("button", { name: "Reservierung von Walk-in öffnen", exact: true })).toContainText("Fenster 1 + Terrasse 2");
});

test("archiving a combination ignores an unfinished numeric draft and preserves its booked members", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, combinations: true, combinedSeed: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Tischkombinationen verwalten", exact: true }).click();
  await page.getByRole("button", { name: /Familientisch/ }).click();
  const editor = page.getByRole("dialog", { name: "Kombination bearbeiten", exact: true });
  await editor.getByLabel("Maximale Personen dieser Kombination", { exact: true }).fill("");
  await editor.getByRole("button", { name: "Kombination aufheben", exact: true }).click();
  await editor.getByRole("button", { name: "Aufheben bestätigen", exact: true }).click();
  const list = page.getByRole("dialog", { name: "Tischkombinationen", exact: true });
  await expect(list).toBeVisible();
  expect(fixture.combinationConfigRequests()[0]).toMatchObject({ p_name: "Familientisch", p_max_party_size: 8, p_active: false, p_table_ids: [table1, table2] });
  await list.getByRole("button", { name: "Schliessen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reservierung von Testgast Abend öffnen", exact: true })).toContainText("Fenster 1 + Terrasse 2");
});

test("a stale combination configuration keeps its draft without a saved result", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, combinations: true, combinationConfigConflict: true });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Tischkombinationen verwalten", exact: true }).click();
  await page.getByRole("button", { name: /Familientisch/ }).click();
  const editor = page.getByRole("dialog", { name: "Kombination bearbeiten", exact: true });
  await editor.getByLabel("Name der Kombination", { exact: true }).fill("Nicht überschreiben");
  await editor.getByRole("button", { name: "Kombination speichern", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("Die Einrichtung wurde inzwischen geändert");
  await expect(editor.getByLabel("Name der Kombination", { exact: true })).toHaveValue("Nicht überschreiben");
  expect(fixture.combinationConfigRequests()).toHaveLength(1);
});

test("a revoked manager loses an open combination draft before saving", async ({ page }) => {
  const fixture = await mockConsole(page, { seeded: true, combinations: true, teams: true, teamRole: "manager" });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "Tischkombinationen verwalten", exact: true }).click();
  await page.getByRole("button", { name: /Familientisch/ }).click();
  const editor = page.getByRole("dialog", { name: "Kombination bearbeiten", exact: true });
  await editor.getByLabel("Name der Kombination", { exact: true }).fill("Privater Entwurf");
  fixture.revokeTeam();
  await page.clock.runFor(30_000);
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("Privater Entwurf", { exact: true })).toHaveCount(0);
  expect(fixture.combinationConfigRequests()).toHaveLength(0);
});

test("a large combination availability scope can recover by narrowing its requested minute", async ({ page }) => {
  await mockConsole(page, { seeded: true, combinations: true });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/booking_console_slots_v2", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (!body.p_time) return route.fulfill({ status: 400, json: { code: "22023", message: "booking_availability_scope_too_large" } });
    return route.fallback();
  });
  await page.goto("/booking/console");
  await page.getByRole("button", { name: "+ Neue Reservierung", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Neue Reservierung", exact: true });
  await expect(editor.getByRole("alert")).toContainText("Grenze die Auswahl");
  await editor.getByLabel("Uhrzeit eingrenzen (optional)", { exact: true }).fill("18:00");
  await editor.getByRole("combobox", { name: "Uhrzeit", exact: true }).selectOption({ label: "18:00" });
  expect(requests.at(-1)).toMatchObject({ p_time: "18:00" });
  await expect(editor.getByRole("alert")).toHaveCount(0);
});
