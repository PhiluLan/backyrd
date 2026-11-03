import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

// Never use production configuration or real email recipients in this suite.
const path = process.env.BACKYRD_ENTRY_LOCAL_STATUS;
const config = path ? JSON.parse(readFileSync(path, "utf8")) as Record<string, string> : null;
if (config && (!/^http:\/\/127\.0\.0\.1:\d+$/.test(config.API_URL) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(config.MAILPIT_URL))) throw new Error("Entry tests require isolated localhost Auth and Mailpit");
test.skip(!config, "Requires BACKYRD_ENTRY_LOCAL_STATUS from an isolated local stack");
test.describe.configure({ mode: "default" });
let admin: SupabaseClient;
const created: string[] = [];
type Fixture = { id: string; email: string; password: string; client: SupabaseClient };
async function account(acceptLegal = true): Promise<Fixture> {
  const email = `entry-${randomUUID()}@backyrd.test`, password = `Fixture!${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("Local fixture account creation failed");
  created.push(data.user.id);
  const client = createClient(config!.API_URL, config!.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error("Local fixture sign-in failed");
  const profile = await client.rpc("complete_profile_onboarding_v2", { p_display_name: "Lea Beispiel", p_username: `lea_${randomUUID().slice(0, 8)}`, p_age: 31, p_city: "Basel", p_country: "Schweiz" });
  if (profile.error || profile.data?.ok !== true) throw new Error("Local fixture onboarding failed");
  const pending = await client.rpc("get_my_pending_legal_documents_v1", { p_locale: "de-CH" });
  if (pending.error) throw new Error("Local fixture legal read failed");
  for (const document of acceptLegal ? pending.data ?? [] : []) {
    const accepted = await client.rpc("accept_legal_document_v1", { p_document_id: document.document_id, p_source: "web", p_app_version: "entry-e2e", p_locale: "de-CH" });
    if (accepted.error || accepted.data !== true) throw new Error("Local fixture legal confirmation failed");
  }
  return { id: data.user.id, email, password, client };
}
async function login(page: Page, fixture: Fixture, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-Mail", { exact: true }).fill(fixture.email);
  await page.getByLabel("Passwort", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(next + "$"));
}
async function emailCode(email: string) {
  let token = "";
  await expect.poll(async () => {
    const inbox = await (await fetch(`${config!.MAILPIT_URL}/api/v1/messages`)).json();
    const found = (inbox.messages ?? []).find((message: { To: { Address: string }[] }) => message.To.some((to) => to.Address === email));
    if (!found) return false;
    const message = await (await fetch(`${config!.MAILPIT_URL}/api/v1/message/${found.ID}`)).json();
    token = (String(message.Text).match(/\b\d{6}\b/) ?? [""])[0];
    return token.length === 6;
  }, { timeout: 15_000 }).toBe(true);
  return token;
}
test.beforeAll(() => { admin = createClient(config!.API_URL, config!.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); });
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
test.afterAll(() => {
  // Audit records intentionally prevent arbitrary admin deletion of these
  // accounts. The disposable runner must remove its whole local stack/volume.
  console.info(`Isolated fixture accounts: ${created.length}; remove the disposable stack after the run.`);
});

test("real registration, pasted code, legal confirmation and saved onboarding", async ({ page }) => {
  const email = `signup-${randomUUID()}@backyrd.test`, password = `Fixture!${randomUUID()}`;
  await page.goto("/signup");
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByLabel("Passwort bestätigen", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Konto erstellen", exact: true }).click();
  await expect(page).toHaveURL(/\/verify\?email=/);
  const token = await emailCode(email);
  let confirmations = 0;
  page.on("request", (request) => { if (request.url().endsWith("/auth/v1/verify")) confirmations += 1; });
  await page.getByLabel("Bestätigungscode", { exact: true }).fill(`${token.slice(0,3)} ${token.slice(3)}`);
  await expect(page).toHaveURL(/\/legal-consent\?next=/); expect(confirmations).toBe(1);
  await page.getByText("Vollständiges Dokument lesen").click();
  await expect(page.getByText("Diese synthetischen Bedingungen gelten nur im isolierten Test.")).toBeVisible();
  await page.getByRole("button", { name: "Dokumente bestätigen und weiter" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Öffentlicher Name", { exact: true }).fill("Anna Maria");
  await expect(page.getByLabel("Benutzername", { exact: true })).toHaveValue("annamaria");
  await page.getByLabel("Benutzername", { exact: true }).fill(`anna_${randomUUID().slice(0,8)}`);
  await page.getByLabel("Alter", { exact: true }).fill("31");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page).toHaveURL(/\/decision$/);
  const client = createClient(config!.API_URL, config!.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  expect(Boolean(signedIn.data.user)).toBe(true); created.push(signedIn.data.user!.id);
  const profile = await client.from("profiles").select("display_name,city,profile_onboarding_completed_at").eq("id", signedIn.data.user!.id).single();
  expect(profile.error).toBeNull(); expect(profile.data?.display_name).toBe("Anna Maria"); expect(profile.data?.city).toBe("Basel"); expect(Boolean(profile.data?.profile_onboarding_completed_at)).toBe(true);
  const consents = await client.rpc("get_my_consent_state_v1", { p_locale: "de-CH" });
  expect((consents.data ?? []).filter((row: { is_required: boolean; current_status: string }) => !row.is_required && row.current_status === "granted")).toHaveLength(0);
});

test("expired code: one automatic attempt, actionable error, explicit retry", async ({ page }) => {
  let attempts = 0;
  await page.route("**/auth/v1/verify", async (route) => { attempts += 1; await new Promise((resolve) => setTimeout(resolve, 400)); await route.fulfill({ status: 403, json: { error_code: "otp_expired", message: "SENSITIVE_PROVIDER_DETAIL" } }); });
  await page.goto("/verify?email=expired%40backyrd.test");
  await page.getByLabel("Bestätigungscode", { exact: true }).fill("123 456");
  await page.locator("form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await expect(page.locator(".b-field-error[role=alert]")).toContainText("abgelaufen"); expect(attempts).toBe(1);
  await expect(page.locator(".b-field-error[role=alert]")).not.toContainText("SENSITIVE_PROVIDER_DETAIL");
  await page.getByRole("button", { name: "E-Mail bestätigen", exact: true }).click(); await expect.poll(() => attempts).toBe(2);
});

test("resend provides feedback and prevents immediate repeated requests", async ({ page }) => {
  let sends = 0;
  await page.route("**/auth/v1/resend*", (route) => { sends += 1; return route.fulfill({ status: 200, json: {} }); });
  await page.goto("/verify?email=resend%40backyrd.test"); await page.getByRole("button", { name: "Code erneut anfordern" }).click();
  await expect(page.getByRole("status")).toContainText("Falls für diese Adresse");
  await expect(page.getByRole("button", { name: /Neuer Code in/ })).toBeDisabled(); expect(sends).toBe(1);
});

test("onboarding loads existing data and rejects partial age input", async ({ page }) => {
  const fixture = await account(); await login(page, fixture, "/onboarding");
  await expect(page.getByLabel("Öffentlicher Name", { exact: true })).toHaveValue("Lea Beispiel");
  let writes = 0; page.on("request", (request) => { if (request.url().endsWith("/rpc/complete_profile_onboarding_v2")) writes += 1; });
  await page.getByLabel("Alter", { exact: true }).fill("13abc"); await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator(".b-field-error[role=alert]")).toContainText("ganze Zahl"); expect(writes).toBe(0);
});

test("a zero-row profile write preserves the draft; successful retry persists", async ({ page }) => {
  const fixture = await account(); await login(page, fixture, "/settings/profile");
  await page.getByLabel("Öffentlicher Name", { exact: true }).fill("Geänderter Name");
  await page.route("**/rest/v1/profiles**", (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 200, json: [] }) : route.continue());
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("nicht gespeichert"); await expect(page.getByLabel("Öffentlicher Name", { exact: true })).toHaveValue("Geänderter Name");
  await page.unroute("**/rest/v1/profiles**"); await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profil gespeichert"); await page.reload();
  await expect(page.getByLabel("Öffentlicher Name", { exact: true })).toHaveValue("Geänderter Name");
});

test("consent grant and revocation persist without enabling other purposes", async ({ page }) => {
  const fixture = await account(); await login(page, fixture, "/settings/consents");
  const toggle = page.getByRole("switch", { name: "Persönliche Vorschläge", exact: true });
  await expect(toggle).not.toBeChecked(); await toggle.click(); await expect(page.getByRole("status")).toContainText("aktiviert und gespeichert");
  await page.reload(); await expect(toggle).toBeChecked(); await toggle.click(); await expect(page.getByRole("status")).toContainText("deaktiviert und gespeichert");
  await page.reload(); await expect(toggle).not.toBeChecked(); await expect(page.getByRole("switch", { name: "Präziser Standort", exact: true })).not.toBeChecked();
});

test("private profile requires informed confirmation and saves the returned state", async ({ page }) => {
  const fixture = await account(); await login(page, fixture, "/settings/privacy");
  const toggle = page.getByRole("switch", { name: "Privates Profil", exact: true }); await expect(toggle).not.toBeChecked(); await toggle.click();
  await expect(page.getByRole("region", { name: "Privates Profil bestätigen" })).toContainText("nicht wiederhergestellt");
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click(); await expect(toggle).not.toBeChecked(); await toggle.click();
  await page.getByRole("button", { name: "Privat setzen", exact: true }).click(); await expect(page.getByRole("status")).toContainText("privat");
  await page.reload(); await expect(toggle).toBeChecked();
});

test("recovery without a session provides a new link before password entry", async ({ page }) => {
  await page.goto("/reset-password"); await expect(page.locator(".b-field-error[role=alert]")).toContainText("Link ist abgelaufen");
  await expect(page.getByRole("link", { name: "Neuen Link anfordern" })).toBeVisible(); await expect(page.getByRole("button", { name: "Passwort speichern" })).toBeDisabled();
  await expect(page.getByLabel("Passwort", { exact: true })).toHaveCount(0);
});

test("small phone and enlarged text keep confirmation usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); await page.goto("/verify?email=layout%40backyrd.test");
  await page.addStyleTag({ content: "html { font-size: 200%; }" }); await expect(page.getByLabel("Bestätigungscode", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => ["critical", "serious"].includes(v.impact ?? ""))).toEqual([]);
});

test("real recovery link stores a new password and returns to sign-in", async ({ page }) => {
  const fixture = await account();
  await page.goto("/forgot-password"); await page.getByLabel("E-Mail", { exact: true }).fill(fixture.email);
  await page.getByRole("button", { name: "Link senden", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Wenn ein Konto existiert");
  let href = "";
  await expect.poll(async () => {
    const inbox = await (await fetch(`${config!.MAILPIT_URL}/api/v1/messages`)).json();
    const found = (inbox.messages ?? []).find((message: { To: { Address: string }[] }) => message.To.some((to) => to.Address === fixture.email));
    if (!found) return false;
    const message = await (await fetch(`${config!.MAILPIT_URL}/api/v1/message/${found.ID}`)).json();
    href = (String(message.HTML).match(/href="([^"<>]*\/auth\/v1\/verify[^"<>]*)"/) ?? ["", ""])[1].replaceAll("&amp;", "&");
    return href.startsWith(`${config!.API_URL}/auth/v1/verify`);
  }, { timeout: 15_000 }).toBe(true);
  await page.goto(href); await expect(page).toHaveURL(/\/reset-password$/);
  const nextPassword = `Updated!${randomUUID()}`;
  await page.getByLabel("Passwort", { exact: true }).fill(nextPassword);
  await page.getByLabel("Passwort bestätigen", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Passwort speichern", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?status=password-updated$/);
  await expect(page.getByRole("status")).toContainText("Passwort ist gespeichert");
  const client = createClient(config!.API_URL, config!.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await client.auth.signInWithPassword({ email: fixture.email, password: nextPassword })).error).toBeNull();
  expect(Boolean((await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password })).error)).toBe(true);
});

test("failed consent update keeps the previous switch state", async ({ page }) => {
  const fixture = await account(); await login(page, fixture, "/settings/consents");
  await page.route("**/rest/v1/rpc/set_my_consent_v1", (route) => route.fulfill({ status: 403, json: { code: "42501", message: "SENSITIVE_DETAIL" } }));
  const toggle = page.getByRole("switch", { name: "Persönliche Vorschläge", exact: true });
  await expect(toggle).not.toBeChecked(); await toggle.click();
  await expect(page.getByRole("status")).toContainText("nicht bestätigt"); await expect(toggle).not.toBeChecked();
});

test("profile draft remains when the user cancels leaving", async ({ page }) => {
  const fixture = await account(); await login(page, fixture, "/settings/profile");
  await page.getByLabel("Öffentlicher Name", { exact: true }).fill("Noch nicht gespeichert");
  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("noch nicht gespeichert"); await dialog.dismiss(); });
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(page.getByLabel("Öffentlicher Name", { exact: true })).toHaveValue("Noch nicht gespeichert");
});

test("an authenticated account cannot read or overwrite another raw profile", async () => {
  const first = await account(), second = await account();
  const read = await first.client.from("profiles").select("id").eq("id", second.id);
  expect(read.error).toBeNull(); expect(read.data).toEqual([]);
  const write = await first.client.from("profiles").update({ display_name: "Unauthorized" }).eq("id", second.id).select("id");
  expect(write.error).toBeNull(); expect(write.data).toEqual([]);
  const own = await second.client.from("profiles").select("display_name").eq("id", second.id).single();
  expect(own.data?.display_name).toBe("Lea Beispiel");
});

test("profile photo upload respects Storage policy and persists its URL", async ({ page }) => {
  const fixture = await account(); await login(page, fixture, "/settings/profile");
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJxkAAAAASUVORK5CYII=", "base64");
  await page.locator('input[type="file"]').setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: pixel });
  await expect(page.getByRole("status")).toContainText("Profilfoto gespeichert");
  const profile = await fixture.client.from("profiles").select("avatar_url").eq("id", fixture.id).single();
  expect(profile.error).toBeNull();
  expect(profile.data?.avatar_url).toContain(`/profile-photos/avatar_${fixture.id}_`);
  await page.reload();
  await expect(page.locator('img[src*="profile-photos"]')).toHaveCount(2);
});

test("pending documents remain pending when acceptance is not acknowledged", async ({ page }) => {
  const fixture = await account(false); await login(page, fixture, "/legal-consent");
  await page.route("**/rest/v1/rpc/accept_legal_document_v1", (route) => route.fulfill({ status: 200, json: false }));
  await page.getByRole("button", { name: "Dokumente bestätigen und weiter" }).click();
  await expect(page.locator(".b-field-error[role=alert]")).toContainText("noch nicht vollständig gespeichert");
  await expect(page).toHaveURL(/\/legal-consent$/);
  await page.unroute("**/rest/v1/rpc/accept_legal_document_v1");
  await page.getByRole("button", { name: "Dokumente bestätigen und weiter" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("an unavailable onboarding profile offers retry instead of an empty form", async ({ page }) => {
  const fixture = await account();
  await page.route("**/rest/v1/profiles**", (route) => route.request().url().includes("birthdate") ? route.fulfill({ status: 503, json: { message: "unavailable" } }) : route.continue());
  await login(page, fixture, "/onboarding");
  await expect(page.getByRole("heading", { name: "Profil nicht geladen" })).toBeVisible();
  await expect(page.getByLabel("Öffentlicher Name", { exact: true })).toHaveCount(0);
  await page.unroute("**/rest/v1/profiles**");
  await page.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
  await expect(page.getByLabel("Öffentlicher Name", { exact: true })).toHaveValue("Lea Beispiel");
});

test("all public account forms fit small and large phones with enlarged text", async ({ page }) => {
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 850 });
    for (const route of ["/login", "/signup", "/forgot-password", "/reset-password", "/verify"]) {
      await page.goto(route); await page.addStyleTag({ content: "html { font-size: 200%; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width}px ${route}`).toBe(true);
    }
  }
});

test("browser logout closes this session while another session can still refresh", async ({ page }) => {
  const fixture = await account(); await login(page, fixture, "/settings");
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings/profile"); await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fprofile/);
  const other = await fixture.client.auth.refreshSession();
  expect(other.error).toBeNull(); expect(other.data.user?.id).toBe(fixture.id);
});

test("changing account in another tab discards the previous account's private draft", async ({ page }) => {
  const first = await account(), second = await account(); await login(page, first, "/settings/profile");
  await page.getByLabel("Öffentlicher Name", { exact: true }).fill("Privater Entwurf Konto A");
  const other = await page.context().newPage();
  try {
    await login(other, second, "/settings/profile");
    await expect(page.getByLabel("Öffentlicher Name", { exact: true })).toHaveValue("Lea Beispiel");
    const profile = await first.client.from("profiles").select("display_name").eq("id", first.id).single();
    expect(profile.data?.display_name).toBe("Lea Beispiel");
  } finally { await other.close(); }
});
