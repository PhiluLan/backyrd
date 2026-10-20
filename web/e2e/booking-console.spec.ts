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

async function mockConsole(page: Page, options: { missingBackend?: boolean; noSpots?: boolean; conflict?: boolean; seeded?: boolean; slowFirstSlots?: boolean; uncertainCreate?: boolean; slotConflict?: boolean } = {}) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: owner, email: "operator@booking.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" };
  const session = { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: owner, role: "authenticated", exp: expires })}.local-signature`, refresh_token: "booking-test", token_type: "bearer", expires_in: 3600, expires_at: expires, user };
  await page.context().addCookies([{ name: "sb-127-auth-token", value: `base64-${encode(session)}`, domain: "127.0.0.1", path: "/" }]);
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/rest/v1/profiles?*", (route) => route.fulfill({ json: { display_name: "Test Operator", first_name: "Test", avatar_url: null } }));
  let snapshot: BookingSnapshot = options.seeded ? seededSnapshot() : { settings: null, areas: [], tables: [], services: [], reservations: [] };
  let savedSetup: BookingSetup | null = null;
  let bookingCalls = 0;
  const slotParties: number[] = [];
  const slotReplies: number[] = [];
  const requestIds: string[] = [];
  await page.route("**/rest/v1/rpc/*", async (route) => {
    const method = route.request().url().split("/").pop();
    const body = route.request().postDataJSON();
    if (method === "get_owner_spots_v1") return route.fulfill({ json: options.noSpots ? [] : [{ spot_id: spot, name: "Restaurant Testbetrieb", city: "Basel", address: null, category_name: "Restaurant", status: "approved", website: null }] });
    if (options.missingBackend) return route.fulfill({ status: 404, json: { code: "PGRST202", message: "function not found" } });
    if (method === "booking_console_read_v1") return route.fulfill({ json: { ...snapshot, reservations: snapshot.reservations.filter((row) => row.starts_at.slice(0, 10) === body.p_date) } });
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
      snapshot.reservations = snapshot.reservations.map((r) => r.id === body.p_reservation_id ? { ...r, status: body.p_status } : r);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 400, json: { message: "unexpected RPC" } });
  });
  return { setup: () => savedSetup, bookingCalls: () => bookingCalls, slotParties: () => slotParties, slotReplies: () => slotReplies, requestIds: () => requestIds };
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
