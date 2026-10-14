import { EXPERIENCE_QUESTIONS, EXPERIENCE_TEMPLATES, librarianConcept } from "@backyrd/world-knowledge-core";
import { experienceAnswerGuidance } from "../../packages/world-knowledge-authoring-ui/src/experience-answer-guidance";
import { expect, test, type Page } from "@playwright/test";

const spotId = "41000000-0000-4000-8000-000000000001";
const ownerId = "41000000-0000-4000-8000-000000000099";
const basicKeys = [
  "experience.profile", "description.discovery_source", "discovery.profile",
  "identity.name", "location.address_line1", "location.locality", "contact.public_email",
  "classification.primary_category", "classification.place_types", "offering.cuisines",
  "purpose.primary_visit", "operation.price_level", "operation.price_options", "hours.regular",
];
const proKeys = [...basicKeys, "capacity.seats_total", "amenity.features"];

async function mockOwner(page: Page, tier: "OWNER_BASIC" | "OWNER_PRO", role: "VERIFIED_OWNER" | "ADMIN" = "VERIFIED_OWNER", seedAnswers:Record<string,unknown>={}) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: ownerId, aud: "authenticated", role: "authenticated", email: "owner@backyrd.test",
    app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-09-17T00:00:00.000Z",
  };
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: ownerId, role: "authenticated", exp: expiresAt })}.local-signature`,
    refresh_token: "owner-test-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: expiresAt, user,
  };
  await page.context().addCookies([{
    name: "sb-127-auth-token",
    value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
    domain: "127.0.0.1", path: "/",
  }]);
  await page.route("**/auth/v1/user", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(user),
  }));
  await page.route("**/rest/v1/rpc/get_owner_spots_v1", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{ spot_id: spotId, name: "Volta Bräu", city: "Basel", address: "Voltastrasse 30", status: "approved" }]),
  }));
  const answers: Record<string, unknown> = {
    "classification.primary_category": {claimId:"classification-default",knowledgeState:"KNOWN_VALUE",value:"EAT"},
    ...seedAnswers,
    "identity.name": { claimId: "41000000-0000-4000-8000-000000000010", knowledgeState: "KNOWN_VALUE", value: "Volta Bräu" },
  };
  let manifest: null | { manifestHash: string; worldSnapshot: { spotId: string; conflicts: never[] } } = null;
  const detail = () => ({
    contractVersion: "backyrd.world-knowledge.product-authoring-detail@1.0",
    spotId, name: "Volta Bräu", status: "approved",
    actor: { role, entitlement: role === "ADMIN" ? "ADMIN" : tier, allowedAttributeKeys: role === "ADMIN" || tier === "OWNER_PRO" ? proKeys : basicKeys },
    answers, openConflicts: [], manifest,
  });
  await page.route("**/rest/v1/rpc/world_product_authoring_detail_v1", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(detail()),
  }));
  const submissions: Array<Record<string, unknown>> = [];
  await page.route("**/rest/v1/rpc/world_product_owner_submit_claim_v1", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    submissions.push(body);
    answers[String(body.p_attribute_key)] = {
      claimId: "41000000-0000-4000-8000-000000000011",
      knowledgeState: body.p_knowledge_state, value: body.p_value,
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/world-knowledge/shadow", async (route) => {
    manifest = { manifestHash: "a".repeat(64), worldSnapshot: { spotId, conflicts: [] } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      manifestHash: manifest.manifestHash, readerSnapshot: manifest.worldSnapshot,
    }) });
  });
  return { submissions };
}

test("Owner wählt seinen Spot nach Namen statt per ID", async ({ page }, testInfo) => {
  await mockOwner(page, "OWNER_BASIC");
  await page.goto("/owner/world-knowledge");
  await expect(page.getByRole("navigation", { name: "Owner Navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Volta Bräu Basel/ })).toBeVisible();
  await expect(page.getByText("Spot-ID")).toHaveCount(0);
  await page.getByRole("button", { name: /Volta Bräu Basel/ }).click();
  await expect(page.getByRole("heading", { name: "Volta Bräu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /2 Grundinformationen/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("owner-spot-editor-desktop.png"), fullPage: true });
});

test("Basis-Owner kann 1–6 pflegen, während 7–8 sichtbar gesperrt bleiben", async ({ page }) => {
  const owner = await mockOwner(page, "OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByRole("button", { name: /6 Preise und Bezahlung/ }).click();
  await page.getByText("Weitere Angaben").click();
  await page.getByLabel("Preislevel").selectOption("MEDIUM");
  await expect.poll(() => owner.submissions.length).toBe(1);
  expect(owner.submissions[0].p_attribute_key).toBe("operation.price_level");
  await page.getByRole("button", { name: /8 Objektive Eigenschaften/ }).click();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toBeVisible();
  await expect(page.getByText("CHF 39.–")).toBeVisible();
  await expect(page.getByRole("link", { name: "Owner Pro entdecken" })).toHaveAttribute("href", `/owner/billing?spot=${spotId}`);
  await expect(page.getByText("Sitzplätze gesamt")).toHaveCount(0);
  await page.getByRole("button", { name: /9 Ausstattung und Einschränkungen/ }).click();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toBeVisible();
  await expect(page.getByText("CHF 39.–")).toBeVisible();
  await expect(page.getByText("Spot-ID")).toHaveCount(0);
});

test("Pro-Owner erhält die vom Server erlaubten Zusatzfelder", async ({ page }) => {
  await mockOwner(page, "OWNER_PRO");
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByRole("button", { name: /8 Objektive Eigenschaften/ }).click();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toHaveCount(0);
  await page.getByText("Weitere Angaben").click();
  await expect(page.getByText("Sitzplätze gesamt")).toBeVisible();
});

test("Admin-Zugriff erklärt die Freigabe der Pro-Bereiche", async ({ page }) => {
  await mockOwner(page, "OWNER_BASIC", "ADMIN");
  await page.goto(`/owner/spots/${spotId}`);
  await expect(page.getByText("Admin-Zugriff: Alle Bereiche sind für dich freigeschaltet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /8 Objektive Eigenschaften/ }).click();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toHaveCount(0);
});

test("Der alte Bearbeitungslink führt zum aktuellen World-Wissen-Editor", async ({ page }) => {
  await mockOwner(page, "OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}/edit`);
  await expect(page).toHaveURL(new RegExp(`/owner/spots/${spotId}$`));
  await expect(page.getByRole("heading", { name: "Volta Bräu" })).toBeVisible();
  await expect(page.getByText("Keywords, kommagetrennt")).toHaveCount(0);
});

test("Ein fremder Spot bleibt trotz direkter URL gesperrt", async ({ page }) => {
  await mockOwner(page, "OWNER_BASIC");
  await page.route("**/rest/v1/rpc/world_product_authoring_detail_v1", (route) =>
    route.fulfill({
      status: 403, contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "world_authoring_scope_denied" }),
    }),
  );
  await page.goto("/owner/spots/41000000-0000-4000-8000-000000000002");
  await expect(page.locator(".wk-toast[role=alert]")).toContainText("nicht berechtigt");
  await expect(page.getByRole("button", { name: /2 Grundinformationen/ })).toHaveCount(0);
});

test("Die Spot-Pflege bleibt auf dem Smartphone lesbar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOwner(page, "OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}`);
  await expect(page.getByRole("heading", { name: "Volta Bräu" })).toBeVisible();
  await expect(page.getByLabel("Bereich auswählen")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Bereiche der Spot-Pflege" })).toBeHidden();
  await page.getByLabel("Bereich auswählen").selectOption({label:"8. Eigenschaften"});
  await expect(page.getByRole("heading", { name: "Objektive Eigenschaften und Nutzungsmöglichkeiten" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Weiter", exact: true })).toBeVisible();
  await page.locator(".owner-mobile-menu summary").click();
  await expect(page.getByRole("navigation", { name: "Owner Navigation mobil" })).toBeVisible();
  await page.locator(".owner-mobile-menu summary").click();
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("body *")]
      .map((element) => ({ name: element.tagName.toLowerCase(), className: typeof element.className === "string" ? element.className : "", right: Math.round(element.getBoundingClientRect().right) }))
      .filter((element) => element.right > 391)
      .slice(0, 15),
  }));
  expect(overflow.width, JSON.stringify(overflow.elements)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("owner-spot-editor-mobile.png"), fullPage: true });
});

test("Owner-Einblicke versprechen keine vNext-Platzierung", async ({ page }) => {
  await mockOwner(page, "OWNER_BASIC");
  await page.route("**/rest/v1/rpc/owner_intelligence_overview_v1", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      summary: { views: 12, visitors: 4, route_clicks: 2, website_clicks: 1, phone_clicks: 0, reviews: 1, spots: 1 },
      spots: [{ spot_id: spotId, name: "Volta Bräu", city: "Basel", views: 12, visitors: 4, reviews: 1, route_clicks: 2, website_clicks: 1, phone_clicks: 0 }],
    }),
  }));
  await page.goto("/owner/analytics");
  await expect(page.getByRole("heading", { name: "Was bei deinen Spots passiert" })).toBeVisible();
  await expect(page.getByText("Diese Zahlen zeigen keine Platzierung oder Bewertung durch Decision vNext.")).toBeVisible();
  await expect(page.getByText("Decision CTR")).toHaveCount(0);
  await expect(page.getByText("Volta Bräu")).toBeVisible();
});

for (const mobile of [false,true]) test(`Konkrete Owner-Preise bleiben vollständig und bearbeitbar (${mobile?'mobil':'desktop'})`,async({page},testInfo)=>{
 if(mobile)await page.setViewportSize({width:390,height:844});
 const owner=await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);
 if(mobile)await page.getByLabel('Bereich auswählen').selectOption('5');else await page.getByRole('button',{name:/6 Preise und Bezahlung/}).click();
 const field=page.locator('[id="field-operation.price_options"]');
 await field.getByRole('button',{name:'+ Preis hinzufügen',exact:true}).click();
 await expect(field.getByLabel('Preis 1 Von',{exact:true})).toHaveValue('');
 await field.getByRole('button',{name:'Getränk',exact:true}).click();await field.getByRole('button',{name:'Snack / Kuchen',exact:true}).click();
 await field.getByLabel('Preis 1 Von',{exact:true}).fill('8.5');await field.getByLabel('Preis 1 Bis',{exact:true}).fill('12.5');
 await expect(field.getByRole('checkbox').nth(0)).not.toBeChecked();await expect(field.getByRole('checkbox').nth(1)).not.toBeChecked();
 await field.getByRole('checkbox').nth(0).check();await field.getByRole('checkbox').nth(1).check();
 await field.getByRole('button',{name:'Preise übernehmen',exact:true}).click();await expect.poll(()=>owner.submissions.length).toBe(1);
 expect(owner.submissions[0].p_attribute_key).toBe('operation.price_options');expect(owner.submissions[0].p_value).toMatchObject([{purposes:['DRINK','SNACK'],min:8.5,max:12.5,basis:'PER_PERSON',minimumAge:null,maximumAge:null,allOfferingsCovered:true,mandatoryFeesIncluded:true}]);
 await page.reload();if(mobile)await page.getByLabel('Bereich auswählen').selectOption('5');else await page.getByRole('button',{name:/6 Preise und Bezahlung/}).click();
 await expect(field.getByLabel('Preis 1 Von',{exact:true})).toHaveValue('8.5');await expect(field.getByLabel('Preis 1 Bis',{exact:true})).toHaveValue('12.5');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile?390:1280);
 await page.screenshot({path:testInfo.outputPath(`comparable-prices-${mobile?'mobile':'desktop'}.png`),fullPage:true});
});

for(const mobile of [false,true])test(`Spotwissen Consent Review Reload ${mobile}`,async({page})=>{
 if(mobile)await page.setViewportSize({width:390,height:844});
 const owner=await mockOwner(page,'OWNER_BASIC');let published=0,prepared=0;
 const source='Gäste bauen selbst Moosterrarien.';
 await page.route('**/rest/v1/rpc/world_product_discovery_publish_source_v1',async route=>{published++;expect(JSON.parse(route.request().postData()??'{}').p_source_text).toBe(source);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sourceHash:'a'.repeat(64)})});});
 await page.route('**/api/world-knowledge/discovery',async route=>{prepared++;const input=JSON.parse(route.request().postData()??'{}');expect(Object.keys(input).sort()).toEqual(['consentToOpenAI','sourceHash','spotId']);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({requiresHumanReview:true,draft:{contractVersion:'backyrd.world-knowledge.discovery-profile@1.0',description:source,reviewed:false,offerings:[],assertions:[{id:'build',kind:'VISIT',concepts:['build moss terrariums'],offeringId:null,state:'PRESENT',evidence:source,conditions:null,validFrom:null,validUntil:null}]}})});});
 await page.goto(`/owner/spots/${spotId}`);
 await page.getByText("Angaben aus öffentlichem Text vorbereiten (optional)",{exact:true}).click();
 const field=page.locator('[id="field-discovery.profile"]');
 await field.getByLabel('Öffentlicher Beschreibungstext',{exact:true}).fill(source);
 await expect(field.getByRole('button',{name:'Vorschläge vorbereiten',exact:true})).toBeDisabled();
 await field.getByRole('checkbox').first().check();await field.getByRole('button',{name:'Vorschläge vorbereiten',exact:true}).click();
 await expect(field.getByText('Bedeutung: build moss terrariums')).toBeVisible();expect(published).toBe(1);expect(prepared).toBe(1);expect(owner.submissions).toHaveLength(0);
 await expect(field.getByRole('button',{name:'Geprüftes Wissen übernehmen',exact:true})).toBeDisabled();
 await field.getByRole('checkbox').last().check();await field.getByRole('button',{name:'Geprüftes Wissen übernehmen',exact:true}).click();
 await expect.poll(()=>owner.submissions.length).toBe(1);expect(owner.submissions[0].p_value).toMatchObject({reviewed:true,description:source});
 await page.reload();await page.getByText("Angaben aus öffentlichem Text vorbereiten (optional)",{exact:true}).click();await expect(field.getByLabel('Öffentlicher Beschreibungstext',{exact:true})).toHaveValue(source);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile?390:1280);
});

for (const scenario of [
  {category:"RESTAURANT", area:"Terrasse", offer:"Mittagessen"},
  {category:"ZOO", area:"Tierhaus", offer:"Zoobesuch"},
  {category:"MUSEUM", area:"Cafébereich", offer:"Café"},
  {category:"BAR", area:"Terrasse", offer:"Getränke"},
]) test(`Angebote und Bereiche: ${scenario.category} wird gespeichert und zurückgelesen`, async ({page},testInfo)=>{
  const owner=await mockOwner(page,"OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByLabel("Art des Spots").selectOption(scenario.category);
  await page.getByRole("button",{name:`+ ${scenario.area}`,exact:true}).click();
  await page.getByRole("button",{name:`+ ${scenario.offer}`,exact:true}).click();
  await page.getByRole("checkbox",{name:scenario.area,exact:true}).check();
  await page.getByRole("checkbox",{name:/Ich habe Angebote, Bereiche, Preise/}).check();
  await page.getByRole("button",{name:"Angebote und Bereiche speichern",exact:true}).click();
  await expect.poll(()=>owner.submissions.length).toBe(1);
  const profile=owner.submissions[0].p_value as {category:string;reviewed:boolean;areas:Array<{id:string;name:string}>;offers:Array<{areaIds:string[];name:string}>};
  expect(owner.submissions[0].p_attribute_key).toBe("experience.profile");
  expect(profile.category).toBe(scenario.category);
  expect(profile.reviewed).toBe(true);
  expect(profile.offers[0].areaIds).toEqual([profile.areas[0].id]);
  await page.reload();
  await page.getByLabel(`Angebot ${scenario.offer} bearbeiten`,{exact:true}).click();
  await page.getByLabel(`Bereich ${scenario.area} bearbeiten`,{exact:true}).click();
  await expect(page.getByLabel("Name des Angebots")).toHaveValue(scenario.offer);
  await expect(page.getByLabel("Name des Bereichs")).toHaveValue(scenario.area);
  if(scenario.category==="RESTAURANT")await page.screenshot({path:testInfo.outputPath("restaurant-offers-areas.png"),fullPage:true});
});

test("Ungültiger Preis bleibt erhalten und wird nicht geschrieben",async({page})=>{
  const owner=await mockOwner(page,"OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByRole("button",{name:"+ Mittagessen",exact:true}).click();
  await page.getByText("Preise (0)",{exact:true}).click();
  await page.getByRole("button",{name:"+ Preis hinzufügen",exact:true}).first().click();
  await page.getByLabel("Preisbezeichnung",{exact:true}).fill("Menü");
  await page.getByLabel("Preis 1 Von",{exact:true}).fill("30");
  await page.getByLabel("Preis 1 Bis",{exact:true}).fill("20");
  await page.getByRole("checkbox",{name:/Ich habe Angebote, Bereiche, Preise/}).check();
  await page.getByRole("button",{name:"Angebote und Bereiche speichern",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:/Bitte prüfe Namen/})).toBeVisible();
  expect(owner.submissions).toHaveLength(0);
  await expect(page.getByLabel("Preis 1 Von",{exact:true})).toHaveValue("30");
  await expect(page.getByLabel("Name des Angebots")).toHaveValue("Mittagessen");
});

test("Ein verknüpfter Bereich bleibt vor versehentlichem Entfernen geschützt",async({page})=>{
  await mockOwner(page,"OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByRole("button",{name:"+ Terrasse",exact:true}).click();
  await page.getByRole("button",{name:"+ Mittagessen",exact:true}).click();
  await page.getByRole("checkbox",{name:"Terrasse",exact:true}).check();
  await expect(page.getByRole("button",{name:"Bereich entfernen",exact:true})).toBeDisabled();
  await page.getByRole("checkbox",{name:"Terrasse",exact:true}).uncheck();
  await page.getByRole("button",{name:"Bereich entfernen",exact:true}).click();
  await expect(page.getByLabel("Name des Bereichs")).toHaveCount(0);
});


test('Vorhandene Küche wird gezielt übernommen und nach dem Speichern erhalten',async({page},testInfo)=>{
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'offering.cuisines':{claimId:'seed-cuisine',knowledgeState:'KNOWN_VALUE',value:['ITALIAN']}});
 await page.goto(`/owner/spots/${spotId}`);
 await page.getByRole('button',{name:'+ Abendessen',exact:true}).click();
 await page.getByText('Vorhandene Angaben übernehmen (1)',{exact:true}).click();
 await page.getByLabel('Zuordnen zu',{exact:true}).selectOption({label:'Angebot: Abendessen'});
 await page.getByRole('button',{name:'In Entwurf übernehmen',exact:true}).click();
 expect(owner.submissions).toHaveLength(0);
 await page.getByRole('checkbox',{name:/Ich habe Angebote, Bereiche, Preise/}).check();
 await page.getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();
 await expect.poll(()=>owner.submissions.length).toBe(1);
 const value=owner.submissions[0].p_value as {offers:Array<{properties:Array<{key:string;value:string}>}>};
 expect(value.offers[0].properties).toContainEqual(expect.objectContaining({key:'food.cuisine',value:'Italienisch'}));
 await page.reload();
 const card=page.locator('.wk-experience-card').filter({has:page.locator('summary').filter({hasText:'Abendessen'})}).first();
 await expect(card.locator(':scope > summary')).toBeVisible();
 await expect(page.getByLabel('Name des Angebots')).toBeHidden();
 await page.locator('.wk-experience-editor').screenshot({path:testInfo.outputPath('spot-knowledge-compact-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 const editor=page.locator('.wk-experience-editor');
 expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await editor.screenshot({path:testInfo.outputPath('spot-knowledge-compact-mobile.png')});
 await card.locator(':scope > summary').click();
 await card.getByText('Essen und Trinken',{exact:true}).click();
 await expect(card.getByRole('button',{name:'Italienisch',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(card.getByLabel('Küche Wert',{exact:true})).toHaveCount(0);
});

test('Gemeinsame Atmosphäre-Vorlage wird im richtigen Bereich gespeichert',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');
 await page.goto(`/owner/spots/${spotId}`);
 await page.getByRole('button',{name:'+ Terrasse',exact:true}).click();
 const area=page.locator('.wk-experience-card').filter({has:page.getByLabel('Name des Bereichs')}).first();
 await area.getByText('Atmosphäre',{exact:true}).click();
 await area.getByRole('button',{name:'+ Atmosphäre',exact:true}).click();
 const property=area.locator('.wk-experience-property').first();
 await property.getByRole('combobox').first().selectOption('KNOWN');
 await property.getByRole('button',{name:'entspannt',exact:true}).click();
 await expect(property.getByRole('button',{name:'entspannt',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(property.getByLabel('Atmosphäre Wert',{exact:true})).toHaveCount(0);
 await page.getByRole('checkbox',{name:/Ich habe Angebote, Bereiche, Preise/}).check();
 await page.getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();
 await expect.poll(()=>owner.submissions.length).toBe(1);
 expect(owner.submissions[0].p_value).toMatchObject({properties:[],areas:[{kind:'TERRACE',properties:[{key:'atmosphere.character',value:'entspannt'}]}]});
});

for (const width of [320,390]) test(`Mobile Spotpflege: breiter Arbeitsbereich und vollständiges Angebot bei ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});
  const owner=await mockOwner(page,"OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}`);
  await expect(page.getByLabel("Bereich auswählen")).toBeVisible();
  await expect(page.locator(".wk-experience-guide")).toContainText("Angebot anlegen");
  await page.getByRole("button",{name:"+ Abendessen",exact:true}).click();
  const offer=page.locator('.wk-experience-card').filter({has:page.getByLabel("Name des Angebots")}).first();
  await offer.getByLabel("Name des Angebots").fill("Romantisches Abendessen");
  await offer.getByText("Preise (0)",{exact:true}).click();
  await offer.getByRole("button",{name:"+ Preis hinzufügen",exact:true}).click();
  await offer.getByLabel("Preisbezeichnung",{exact:true}).fill("Menü");
  await offer.getByLabel("Preis 1 Von",{exact:true}).fill("30");
  await offer.getByLabel("Preis 1 Bis",{exact:true}).fill("30");
  await offer.getByText("Angebotszeiten und Gültigkeit",{exact:true}).click();
  await offer.getByRole("button",{name:"+ Angebotszeit",exact:true}).click();
  await page.getByRole("combobox",{name:"Wochentag",exact:true}).selectOption("6");
  await offer.getByLabel("Angebotszeit 1 Beginn",{exact:true}).fill("18:00");
  await offer.getByLabel("Angebotszeit 1 Ende",{exact:true}).fill("22:00");
  await page.getByRole("button",{name:"+ Terrasse",exact:true}).click();
  const area=page.locator('.wk-experience-card').filter({has:page.getByLabel("Name des Bereichs")}).first();
  await area.getByText("Atmosphäre",{exact:true}).click();
  await area.getByRole("button",{name:"+ Atmosphäre",exact:true}).click();
  const property=area.locator('.wk-experience-property').first();
  await expect(property.getByText("Zeiten oder Ausnahmen (optional)",{exact:true})).toHaveCount(0);
  await property.getByRole("combobox").first().selectOption("KNOWN");
  await property.getByRole("button",{name:"entspannt",exact:true}).click();
  await property.getByText("Zeiten oder Ausnahmen (optional)",{exact:true}).click();
  await property.getByRole("checkbox",{name:"Samstag",exact:true}).check();
  await property.getByLabel("Gültig ab",{exact:true}).fill("2026-10-17");
  await property.getByLabel("Gültig bis einschließlich",{exact:true}).fill("2026-12-31");
  const geometry=await property.locator('input:not([type=checkbox]),select,textarea').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {width:r.width,left:r.left,right:r.right};}));
  for(const field of geometry){expect(field.width).toBeGreaterThan(width*.65);expect(field.left).toBeGreaterThanOrEqual(0);expect(field.right).toBeLessThanOrEqual(width);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await property.scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath(`mobile-detail-${width}.png`)});
  await offer.getByRole("checkbox",{name:"Terrasse",exact:true}).check();
  await page.getByRole("checkbox",{name:/Ich habe Angebote, Bereiche, Preise/}).check();
  await page.getByRole("button",{name:"Angebote und Bereiche speichern",exact:true}).click();
  await expect.poll(()=>owner.submissions.length).toBe(1);
  expect(owner.submissions[0].p_value).toMatchObject({reviewed:true,areas:[{properties:[{key:"atmosphere.character",value:"entspannt",conditions:{weekdays:[6],validFrom:"2026-10-17",validUntil:"2026-12-31"}}]}],offers:[{name:"Romantisches Abendessen",prices:[{min:30,max:30}],schedule:[{weekday:6,start:"18:00",end:"22:00"}]}]});
  await page.reload();
  await page.getByLabel("Angebot Romantisches Abendessen bearbeiten",{exact:true}).click();
  await expect(page.getByLabel("Name des Angebots")).toHaveValue("Romantisches Abendessen");
});

test('Bereich lässt sich mobil direkt im Angebot anlegen und zuordnen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const owner=await mockOwner(page,'OWNER_BASIC');
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByRole('button',{name:'+ Abendessen',exact:true}).click();
  const offer=page.locator('.wk-experience-card').filter({has:page.getByLabel('Name des Angebots')}).first();
  await offer.getByText('Neuen Bereich hier anlegen',{exact:true}).click();
  await offer.getByRole('button',{name:'Bereich anlegen: Terrasse',exact:true}).click();
  await expect(offer.getByRole('checkbox',{name:'Terrasse',exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:/Ich habe Angebote, Bereiche, Preise/}).check();
  await page.getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();
  await expect.poll(()=>owner.submissions.length).toBe(1);
  const profile=owner.submissions[0].p_value as {areas:Array<{id:string;name:string}>;offers:Array<{areaIds:string[]}>};
  expect(profile.areas).toHaveLength(1);expect(profile.areas[0].name).toBe('Terrasse');
  expect(profile.offers[0].areaIds).toEqual([profile.areas[0].id]);
});

test('Apéro hat passende Antworten und bewahrt einen alten Sammeltext unverändert',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const oldText='Apeeoplättli, Wein, gute Qualität';
  const conditions={weekdays:[],dayparts:[],event:null,validFrom:null,validUntil:null};
  const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{knowledgeState:'KNOWN_VALUE',value:{contractVersion:'backyrd.world-knowledge.experience-profile@1.0',category:'RESTAURANT',reviewed:true,properties:[],areas:[],offers:[{id:'apero',kind:'APERITIF',name:'Apéro',areaIds:[],properties:[{key:'experience.activity',label:null,state:'KNOWN',value:oldText,conditions}],prices:[],schedule:[],validFrom:null,validUntil:null}]}}});
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByLabel('Angebot Apéro bearbeiten',{exact:true}).click();
  const offer=page.locator('.wk-experience-card').filter({has:page.getByLabel('Name des Angebots')}).first();
  await offer.getByText('Erlebnis',{exact:true}).click();
  const property=offer.locator('.wk-experience-property').first();
  await expect(property.locator('textarea')).toHaveCount(0);
  await expect(property.getByRole('button',{name:'etwas trinken',exact:true})).toBeVisible();
  await expect(property.getByRole('button',{name:'Zoo besuchen',exact:true})).toHaveCount(0);
  await expect(property.getByText(oldText,{exact:true})).toBeVisible();
  await page.getByLabel('Name des Angebots').fill('Apéro am Abend');
  await page.getByRole('checkbox',{name:/Ich habe Angebote, Bereiche, Preise/}).check();
  await page.getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();
  await expect.poll(()=>owner.submissions.length).toBe(1);
  expect(owner.submissions[0].p_value).toMatchObject({offers:[{properties:[{key:'experience.activity',value:oldText}]}]});
  await property.getByRole('button',{name:'etwas trinken',exact:true}).click();
  await expect(property.getByRole('button',{name:'etwas trinken',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('checkbox',{name:/Ich habe Angebote, Bereiche, Preise/}).check();
  await page.getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();
  await expect.poll(()=>owner.submissions.length).toBe(2);
  expect(owner.submissions[1].p_value).toMatchObject({offers:[{properties:[{key:'experience.activity',value:'etwas trinken',state:'KNOWN'}]}]});
  const profile=owner.submissions[1].p_value as {offers:Array<{properties:unknown[]}>};
  expect(profile.offers[0].properties).toHaveLength(1);
});

test('Wein ist eine eigene Auswahl und ein Gericht hat eine klare Texteingabe',async({page})=>{
  const owner=await mockOwner(page,'OWNER_BASIC');
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByRole('button',{name:'+ Apéro',exact:true}).click();
  const offer=page.locator('.wk-experience-card').filter({has:page.getByLabel('Name des Angebots')}).first();
  await offer.getByText('Essen und Trinken',{exact:true}).click();
  await offer.getByRole('button',{name:'+ Getränke einschließlich alkoholfreier Auswahl',exact:true}).click();
  await offer.getByRole('button',{name:'Wein',exact:true}).click();
  await expect(offer.getByRole('button',{name:'Wein',exact:true})).toHaveAttribute('aria-pressed','true');
  await offer.getByRole('button',{name:'+ Weitere Antwort: Getränke einschließlich alkoholfreier Auswahl',exact:true}).click();
  const drinks=offer.locator('.wk-experience-property').filter({has:page.getByRole('combobox',{name:'Getränke einschließlich alkoholfreier Auswahl',exact:true})});
  await drinks.nth(1).getByRole('button',{name:'Bier',exact:true}).click();
  await expect(drinks.nth(0).getByRole('button',{name:'Wein',exact:true})).toHaveAttribute('aria-pressed','true');
  await offer.getByRole('button',{name:'+ Gerichte und Spezialitäten',exact:true}).click();
  const dish=offer.locator('.wk-experience-property').filter({has:page.getByRole('combobox',{name:'Gerichte und Spezialitäten',exact:true})});
  await dish.getByRole('combobox').selectOption('KNOWN');
  await expect(dish.getByRole('textbox')).toHaveAttribute('placeholder','Zum Beispiel Apéroplättli');
  await dish.getByRole('textbox').fill('Apéroplättli');
  await expect(offer.getByRole('button',{name:'+ Eigene Besonderheit',exact:true})).toHaveCount(0);
  await page.getByRole('checkbox',{name:/Ich habe Angebote, Bereiche, Preise/}).check();
  await page.getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();
  await expect.poll(()=>owner.submissions.length).toBe(1);
  expect(owner.submissions[0].p_value).toMatchObject({offers:[{properties:[{key:'food.drink',state:'KNOWN',value:'Wein'},{key:'food.drink',state:'KNOWN',value:'Bier'},{key:'food.dish',state:'KNOWN',value:'Apéroplättli'}]}]});
});

test('Ja und Nein speichern explizite Fakten ohne Freitext und ohne unbekannt zu verwechseln',async({page})=>{
  const owner=await mockOwner(page,'OWNER_BASIC');
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByRole('button',{name:'+ Terrasse',exact:true}).click();
  const area=page.locator('.wk-experience-card').filter({has:page.getByLabel('Name des Bereichs')}).first();
  await area.getByText('Ausstattung',{exact:true}).click();
  await area.getByRole('button',{name:'+ WC vorhanden?',exact:true}).click();
  const property=area.locator('.wk-experience-property').first();
  await expect(property.getByRole('combobox')).toHaveValue('UNKNOWN');
  await property.getByRole('button',{name:'Nein',exact:true}).click();
  await expect(property.getByRole('combobox')).toHaveValue('KNOWN');
  await expect(property.locator('textarea')).toHaveCount(0);
  await page.getByRole('checkbox',{name:/Ich habe Angebote, Bereiche, Preise/}).check();
  await page.getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();
  await expect.poll(()=>owner.submissions.length).toBe(1);
  expect(owner.submissions[0].p_value).toMatchObject({areas:[{properties:[{key:'amenity.toilet',state:'KNOWN',value:false}]}]});
});


test('Jedes Textfeld hat eine bewusste Antwortart und Aktivitäten verwenden bekannte Begriffe',()=>{
  for(const question of EXPERIENCE_QUESTIONS.filter(q=>q.control==='TEXT'))for(const category of question.categories){
    const spec=experienceAnswerGuidance(question.key,category);
    expect(spec,`${category}:${question.key}`).not.toBeNull();
    if(spec?.kind==='CHOICES'){expect(spec.choices.length).toBeGreaterThan(0);expect(new Set(spec.choices).size).toBe(spec.choices.length);}
    if(spec?.kind==='NAME'){expect(spec.placeholder.length).toBeGreaterThan(0);expect(spec.help.length).toBeGreaterThan(0);}
  }
  for(const category of ['RESTAURANT','ZOO','MUSEUM','BAR','SPORT'] as const)for(const offer of EXPERIENCE_TEMPLATES[category].offers){
    const spec=experienceAnswerGuidance('experience.activity',category,offer.kind);
    if(spec?.kind==='CHOICES')for(const value of spec.choices)expect(librarianConcept(value),`${category}:${offer.kind}:${value}`).not.toBeNull();
  }
});

for(const scenario of [
 {name:'Weinbar',category:'BAR',types:['WINE_BAR'],offer:'Apéro / Snacks',kind:'APERITIF'},
 {name:'Zoo',category:'ZOO',types:['ZOO'],offer:'Zoobesuch',kind:'VISIT'},
 {name:'Boulderhalle',category:'SPORT',types:['CLIMBING_GYM'],offer:'Bouldern',kind:'BOULDERING'},
] as const)test(`Passende Pflege: ${scenario.name} ohne Restaurant-Vorbelegung`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{
  'classification.primary_category':{claimId:'category',knowledgeState:'KNOWN_VALUE',value:scenario.category==='BAR'?'DRINKS':scenario.category==='SPORT'?'SPORT_MOVEMENT':'ATTRACTIONS_LANDMARKS'},
  'classification.place_types':{claimId:'types',knowledgeState:'KNOWN_VALUE',value:scenario.types},
 });
 await page.goto(`/owner/spots/${spotId}`);
 await expect(page.getByLabel('Art des Spots')).toHaveValue(scenario.category);
 await page.getByRole('button',{name:`+ ${scenario.offer}`,exact:true}).click();
 const card=page.locator('.wk-experience-card').filter({has:page.getByLabel('Name des Angebots')});
 await expect(card.getByRole('button',{name:'+ Selbstständig, geführt oder betreut?',exact:true})).toHaveCount(0);
 await expect(card.getByRole('button',{name:'+ Verfügbare Sprachen',exact:true})).toHaveCount(0);
 if(scenario.category==='BAR'){
  await card.getByText('Besuchsregeln',{exact:true}).click();
  await card.getByRole('button',{name:'+ Reservation erforderlich?',exact:true}).click();
  await card.getByRole('button',{name:'Keine Reservation möglich',exact:true}).click();
  await expect(card.getByRole('button',{name:'+ Eintrittsticket erforderlich?',exact:true})).toHaveCount(0);
 }else if(scenario.category==='SPORT'){
  await card.getByText('Sport',{exact:true}).click();
  await card.getByRole('button',{name:'+ Benötigte Ausrüstung',exact:true}).click();
  await expect(card.getByRole('button',{name:'Klettergurt',exact:true})).toHaveCount(0);
  await card.getByRole('button',{name:'Kletterschuhe',exact:true}).click();
  await card.getByRole('button',{name:'+ Ausrüstung vor Ort ausleihbar?',exact:true}).click();
  const rental=card.locator('.wk-experience-property').filter({hasText:'Ausrüstung vor Ort ausleihbar?'});
  await rental.getByRole('button',{name:'Ja',exact:true}).click();
 }else{
  await card.getByText('Besuchsregeln',{exact:true}).click();
  await card.getByRole('button',{name:'+ Eintrittsticket erforderlich?',exact:true}).click();
  await card.getByRole('button',{name:'Ticket erforderlich',exact:true}).click();
 }
 await page.getByRole('checkbox',{name:/Ich habe Angebote, Bereiche, Preise/}).check();
 await page.getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();
 await expect.poll(()=>owner.submissions.length).toBe(1);
 expect(owner.submissions[0].p_value).toMatchObject({category:scenario.category,offers:[{kind:scenario.kind}],reviewed:true});
 await page.reload();
 await expect(page.getByLabel('Art des Spots')).toHaveValue(scenario.category);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Unbekannte Pflegeart benötigt Auswahl und errät kein Restaurant',async({page})=>{
 await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'classification.primary_category':{claimId:'unknown',knowledgeState:'UNKNOWN',value:null}});
 await page.goto(`/owner/spots/${spotId}`);
 await expect(page.getByLabel('Art des Spots')).toHaveValue('');
 await expect(page.getByRole('button',{name:'+ Mittagessen',exact:true})).toHaveCount(0);
});

test('Gespeicherte kompatible Pflegeart lässt sich ohne Datenverlust berichtigen',async({page})=>{
 const saved={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',category:'RESTAURANT',reviewed:true,properties:[],areas:[{id:'inside',kind:'INDOOR',name:'Gastraum',properties:[]}],offers:[{id:'apero',kind:'APERITIF',name:'Apéro',areaIds:['inside'],properties:[],prices:[],schedule:[],validFrom:null,validUntil:null}]};
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'profile',knowledgeState:'KNOWN_VALUE',value:saved}});
 await page.goto(`/owner/spots/${spotId}`);
 await page.getByLabel('Art des Spots').selectOption('BAR');
 await page.getByRole('checkbox',{name:/Ich habe Angebote, Bereiche, Preise/}).check();
 await page.getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();
 await expect.poll(()=>owner.submissions.length).toBe(1);
 expect(owner.submissions[0].p_value).toEqual({...saved,category:'BAR'});
});

test('Unlesbares Angebotsprofil wird sichtbar gesperrt statt leer überschrieben',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'broken',knowledgeState:'KNOWN_VALUE',value:{category:'INVALID'}}});
 await page.goto(`/owner/spots/${spotId}`);
 await expect(page.getByRole('alert').filter({hasText:'Das gespeicherte Angebotsprofil konnte nicht sicher geladen werden.'})).toBeVisible();
 await expect(page.getByLabel('Art des Spots')).toBeDisabled();
 expect(owner.submissions).toHaveLength(0);
});
