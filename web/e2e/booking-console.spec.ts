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
    const fixture = await mockConsole(page, { seeded: true, amendments: true, [failure]: true });
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

async function mockConsole(page: Page, options: { missingBackend?: boolean; noSpots?: boolean; conflict?: boolean; seeded?: boolean; slowFirstSlots?: boolean; uncertainCreate?: boolean; slotConflict?: boolean; lifecycle?: boolean; statusConflict?: boolean; uncertainStatus?: boolean; amendments?: boolean; amendSlotConflict?: boolean; amendRevisionConflict?: boolean; uncertainAmend?: boolean; slowAmendSlots?: boolean; unclosed?: boolean } = {}) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: owner, email: "operator@booking.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" };
  const session = { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: owner, role: "authenticated", exp: expires })}.local-signature`, refresh_token: "booking-test", token_type: "bearer", expires_in: 3600, expires_at: expires, user };
  await page.context().addCookies([{ name: "sb-127-auth-token", value: `base64-${encode(session)}`, domain: "127.0.0.1", path: "/" }]);
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/rest/v1/profiles?*", (route) => route.fulfill({ json: { display_name: "Test Operator", first_name: "Test", avatar_url: null } }));
  let snapshot: BookingSnapshot = options.seeded ? seededSnapshot() : { settings: null, areas: [], tables: [], services: [], reservations: [] };
  let savedSetup: BookingSetup | null = null;
  if (options.lifecycle) snapshot.capabilities = { service_lifecycle: true };
  if (options.amendments) { snapshot.capabilities = { service_lifecycle: true, reservation_amendments: true }; snapshot.reservations = snapshot.reservations.map((r) => ({ ...r, revision: 0 })); }
  if (options.unclosed) {
    snapshot.capabilities = { ...snapshot.capabilities, service_lifecycle: true, current_seating: true };
    snapshot.operating_date = "2026-10-20";
    snapshot.reservations.push({ id: "51000000-0000-4000-8000-000000000024", table_id: table1, service_id: dinner, guest_name: "Testgast Vorabend", guest_contact: null, note: null, party_size: 2, starts_at: "2026-10-19T18:00:00+02:00", ends_at: "2026-10-19T20:00:00+02:00", status: "seated", source: "phone", revision: 0, arrived_at: "2026-10-19T18:00:00+02:00", seated_at: "2026-10-19T18:00:00+02:00" });
  }
  let statusCalls = 0;
  const statusRequests: object[] = [];
  const amendRequests: Record<string, unknown>[] = [];
  const amendParties: number[] = [];
  let lastAmendId = "";
  let bookingCalls = 0;
  const slotParties: number[] = [];
  const slotReplies: number[] = [];
  const requestIds: string[] = [];
  await page.route("**/rest/v1/rpc/*", async (route) => {
    const method = route.request().url().split("/").pop();
    const body = route.request().postDataJSON();
    if (method === "get_owner_spots_v1") return route.fulfill({ json: options.noSpots ? [] : [{ spot_id: spot, name: "Restaurant Testbetrieb", city: "Basel", address: null, category_name: "Restaurant", status: "approved", website: null }] });
    if (options.missingBackend) return route.fulfill({ status: 404, json: { code: "PGRST202", message: "function not found" } });
    if (method === "booking_console_read_v1") return route.fulfill({ json: { ...snapshot, reservations: snapshot.reservations.filter((row) => row.starts_at.slice(0, 10) === body.p_date), unclosed_visits: options.unclosed && body.p_date === snapshot.operating_date ? snapshot.reservations.filter((row) => row.status === "seated" && row.starts_at.slice(0, 10) < body.p_date) : [] } });
    if (method === "booking_console_save_setup_v1") {
      if (options.conflict) return route.fulfill({ status: 409, json: { code: "40001", message: "booking_setup_changed_reload" } });
      savedSetup = body.p_setup;
      const setup = savedSetup!;
      snapshot = { ...snapshot, ...setup, settings: { revision: (snapshot.settings?.revision ?? 0) + 1, duration_minutes: setup.duration_minutes, max_party_size: setup.max_party_size } };
      return route.fulfill({ json: snapshot.settings!.revision });
    }
    if (method === "booking_console_slots_v1") {
      slotParties.push(body.p_party_size);
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
      snapshot.reservations = [{ id: reservationId, table_id: body.p_table_id, service_id: body.p_service_id, guest_name: body.p_guest_name, guest_contact: body.p_guest_contact, note: body.p_note, party_size: body.p_party_size, starts_at: body.p_starts_at, ends_at: new Date(Date.parse(body.p_starts_at) + 120 * 60 * 1000).toISOString(), status: body.p_status, source: body.p_source }];
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
    return route.fulfill({ status: 400, json: { message: "unexpected RPC" } });
  });
  return { setup: () => savedSetup, bookingCalls: () => bookingCalls, slotParties: () => slotParties, slotReplies: () => slotReplies, requestIds: () => requestIds, statusRequests: () => statusRequests, amendRequests: () => amendRequests, amendParties: () => amendParties };
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
    const fixture = await mockConsole(page, { seeded: true, [kind]: true });
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
