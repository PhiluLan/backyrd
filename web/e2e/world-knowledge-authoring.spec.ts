import { SPOT_GROUPS, SPOT_TYPE_CATALOG, OFFER_CATALOG, emptyExperienceProfile, emptyExperienceConditions } from "@backyrd/world-knowledge-core";
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


const outerStep=async(page:Page,index:number)=>{if((page.viewportSize()?.width??1280)<=760)await page.getByLabel('Bereich auswählen').selectOption(String(index));else await page.getByRole('navigation',{name:'Bereiche der Spot-Pflege'}).getByRole('button').nth(index).click();};
const guided=(page:Page)=>page.locator('.wk-guided-authoring');
const addFromCatalogue=async(page:Page,label:string)=>{
 await expect(guided(page).getByRole('group',{name:'Angebote und Bereiche pflegen',exact:true})).toBeVisible();
 const button=guided(page).getByRole('button',{name:`+ ${label}`,exact:true});if(await button.count()){await button.click();return;}
 const select=guided(page).getByLabel('Weiteres Angebot hinzufügen',{exact:true});if(await select.count()){await select.selectOption({label});return;}
 await guided(page).getByLabel('Weiteren Bereich hinzufügen',{exact:true}).selectOption({label});
};
const mainStep=async(page:Page,step:number)=>guided(page).getByLabel('Schritt der Angebote und Bereiche').selectOption(String(step));
const part=async(page:Page,name:string)=>{
 const select=guided(page).getByLabel(/Abschnitt des (Angebots|Bereichs)/);
 const labels=await select.locator('option').allTextContents();const label=labels.find(label=>label.slice(label.indexOf('.')+2)===name);if(!label)throw new Error(`Missing topic: ${name}`);await select.selectOption({label});
};
const overview=async(page:Page)=>guided(page).getByRole('button',{name:'← Zur Übersicht',exact:true}).click();
const saveProfile=async(page:Page)=>{if(await guided(page).getByRole('button',{name:'← Zur Übersicht',exact:true}).count())await overview(page);await mainStep(page,4);await guided(page).getByRole('checkbox',{name:/Ich habe Angebote, Bereiche/}).check();await guided(page).getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();};

for(const scenario of [
 {category:'RESTAURANT',area:'Terrasse',offer:'Mittagessen'},
 {category:'BAR',area:'Terrasse',offer:'Apéro / Snacks'},
 {category:'ZOO',area:'Tierhaus',offer:'Zoobesuch'},
 {category:'MUSEUM',area:'Cafébereich',offer:'Café'},
 {category:'SPORT',area:'Boulderbereich',offer:'Bouldern'},
])test(`Geführte Pflege speichert ${scenario.category} und erhält Verknüpfungen`,async({page})=>{
 const type={RESTAURANT:'RESTAURANT',BAR:'WINE_BAR',ZOO:'ZOO',MUSEUM:'MUSEUM',SPORT:'CLIMBING_GYM'}[scenario.category];const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:[type]}});await page.goto(`/owner/spots/${spotId}`);
 await mainStep(page,1);await addFromCatalogue(page,scenario.area);await overview(page);
 await mainStep(page,0);await addFromCatalogue(page,scenario.offer);await guided(page).getByRole('checkbox',{name:scenario.area,exact:true}).check();
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const p=owner.submissions[0].p_value as {category:string;areas:Array<{id:string}>;offers:Array<{areaIds:string[]}>};expect(p.category).toBe(scenario.category==='RESTAURANT'?'EAT':scenario.category);expect(p.offers[0].areaIds).toEqual([p.areas[0].id]);
 await page.reload();await guided(page).getByLabel(`Angebot ${scenario.offer} bearbeiten`,{exact:true}).click();await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue(scenario.offer);await expect(guided(page).getByRole('checkbox',{name:scenario.area,exact:true})).toBeChecked();
});

for(const width of [320,390])test(`Mehrfachauswahl und flache Themenseiten bei ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:844});const owner=await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);
 await addFromCatalogue(page,'Getränke');await part(page,'Getränke einschließlich alkoholfreier Auswahl');
 const drinks=guided(page).getByRole('region',{name:'Getränke einschließlich alkoholfreier Auswahl',exact:true});
 for(const label of ['Wein','Bier','Kaffee','alkoholfreie Getränke'])await drinks.getByRole('button',{name:label,exact:true}).click();
 for(const label of ['Wein','Bier','Kaffee','alkoholfreie Getränke'])await expect(drinks.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
 await overview(page);await mainStep(page,1);await addFromCatalogue(page,'Terrasse');await part(page,'Atmosphäre');
 const atmosphere=guided(page).getByRole('region',{name:'Atmosphäre',exact:true});for(const label of ['gemütlich','lebendig','gesellig'])await atmosphere.getByRole('button',{name:label,exact:true}).click();
 await expect(atmosphere.getByRole('button',{name:'gemütlich',exact:true})).toHaveAttribute('aria-pressed','true');await expect(atmosphere.getByRole('button',{name:'lebendig',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(guided(page).getByRole('heading',{name:'Preise (0)'})).toHaveCount(0);expect(await guided(page).locator('details details').count()).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.screenshot({path:testInfo.outputPath(`guided-atmosphere-${width}.png`),fullPage:true});await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const p=owner.submissions[0].p_value as {areas:Array<{properties:Array<{key:string;value:unknown}>}>;offers:Array<{properties:Array<{key:string;value:unknown}>}>};expect(p.areas[0].properties.filter(x=>x.key==='atmosphere.character').map(x=>x.value)).toEqual(['gemütlich','lebhaft','gesellig']);expect(p.offers[0].properties.filter(x=>x.key==='food.drink')).toHaveLength(4);
 await page.reload();await mainStep(page,1);await guided(page).getByLabel('Bereich Terrasse bearbeiten',{exact:true}).click();await part(page,'Atmosphäre');for(const label of ['gemütlich','lebendig','gesellig'])await expect(guided(page).getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
 await guided(page).getByRole('button',{name:'gemütlich',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(2);const p2=owner.submissions[1].p_value as typeof p;expect(p2.areas[0].properties.map(x=>x.value)).toContain('lebhaft');expect(p2.areas[0].properties.map(x=>x.value)).not.toContain('gemütlich');
});

test('Weiter und Zurück zeigen genau eine Themenseite und behalten den Entwurf',async({page})=>{
 await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);await addFromCatalogue(page,'Mittagessen');await page.getByLabel('Name des Angebots',{exact:true}).fill('Mittag am Rhein');await guided(page).getByRole('button',{name:'Weiter',exact:true}).click();await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveCount(0);await expect(guided(page).getByRole('heading',{name:'Was kann man hier machen?',exact:true})).toBeVisible();await guided(page).getByRole('button',{name:'Zurück',exact:true}).click();await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue('Mittag am Rhein');
 await outerStep(page,1);await expect(page.getByRole('status').filter({hasText:/noch nicht gespeichert/})).toBeVisible();await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue('Mittag am Rhein');
});

test('Einzelantworten ersetzen sich ohne andere Wünsche zu löschen',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);await addFromCatalogue(page,'Mittagessen');await part(page,'Reservation erforderlich?');const booking=guided(page).getByRole('region',{name:'Reservation erforderlich?',exact:true});await booking.getByRole('button',{name:'Erforderlich',exact:true}).click();await booking.getByRole('button',{name:'Nicht erforderlich',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const p=owner.submissions[0].p_value as {offers:Array<{properties:Array<{key:string;value:unknown}>}>};expect(p.offers[0].properties.filter(x=>x.key==='participation.booking').map(x=>x.value)).toEqual(['Nicht erforderlich']);
});

test('Leere und ungültige Preise werden nicht gespeichert und der Entwurf bleibt erhalten',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);await addFromCatalogue(page,'Mittagessen');await part(page,'Preise');await addFromCatalogue(page,'Preis hinzufügen');await expect(page.getByLabel('Preis 1 Von',{exact:true})).toHaveValue('');await saveProfile(page);await expect(page.getByRole('alert').filter({hasText:/Bitte prüfe Namen/})).toBeVisible();expect(owner.submissions).toHaveLength(0);
 await guided(page).getByRole('button',{name:'Angebot Mittagessen prüfen',exact:true}).click();await part(page,'Preise');await page.getByLabel('Preisbezeichnung',{exact:true}).fill('Menü');await page.getByLabel('Preis 1 Von',{exact:true}).fill('30');await page.getByLabel('Preis 1 Bis',{exact:true}).fill('20');await saveProfile(page);expect(owner.submissions).toHaveLength(0);await guided(page).getByRole('button',{name:'Angebot Mittagessen prüfen',exact:true}).click();await part(page,'Preise');await expect(page.getByLabel('Preis 1 Bis',{exact:true})).toHaveValue('20');
 await page.getByLabel('Preis 1 Von',{exact:true}).fill('0');await page.getByLabel('Preis 1 Bis',{exact:true}).fill('0');await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
});

test('Verknüpfte Bereiche bleiben vor versehentlichem Entfernen geschützt',async({page})=>{
 await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);await addFromCatalogue(page,'Mittagessen');await guided(page).getByRole('button',{name:'Bereich anlegen: Terrasse',exact:true}).click();await overview(page);await mainStep(page,1);await guided(page).getByLabel('Bereich Terrasse bearbeiten',{exact:true}).click();await expect(guided(page).getByRole('button',{name:'Bereich entfernen',exact:true})).toBeDisabled();
});

test('Speicherfehler meldet keinen Erfolg und kann mit unverändertem Entwurf wiederholt werden',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');let fail=true;await page.route('**/rest/v1/rpc/world_product_owner_submit_claim_v1',async(route)=>{if(fail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'test unavailable'})});}else await route.fallback();});
 await page.goto(`/owner/spots/${spotId}`);await addFromCatalogue(page,'Mittagessen');await page.getByLabel('Name des Angebots',{exact:true}).fill('Mein Mittag');await saveProfile(page);await expect(guided(page).getByRole('alert')).toContainText('Speichern fehlgeschlagen');expect(owner.submissions).toHaveLength(0);fail=false;await guided(page).getByRole('button',{name:'Angebote und Bereiche speichern',exact:true}).click();await expect.poll(()=>owner.submissions.length).toBe(1);
});

test('Gespeicherter Stand bleibt nach späterem Verwerfen erhalten',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);await addFromCatalogue(page,'Mittagessen');await page.getByLabel('Name des Angebots',{exact:true}).fill('Gespeichert');await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);await mainStep(page,0);await guided(page).getByLabel('Angebot Gespeichert bearbeiten',{exact:true}).click();await page.getByLabel('Name des Angebots',{exact:true}).fill('Ungespeichert');await guided(page).getByRole('button',{name:'Ungespeicherten Entwurf verwerfen',exact:true}).click();await mainStep(page,0);await guided(page).getByLabel('Angebot Gespeichert bearbeiten',{exact:true}).click();await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue('Gespeichert');
});

test('Bisherige allgemeine Angaben werden weiterhin bearbeitet und eindeutig erklärt',async({page})=>{
 await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);await outerStep(page,5);await expect(page.getByText('Allgemeines Spotprofil · gesamter Spot',{exact:true})).toBeVisible();await expect(page.locator('[id="field-operation.price_options"]')).toBeVisible();
});

test('Ungültiges gespeichertes Profil wird nicht leer überschrieben',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'broken',knowledgeState:'KNOWN_VALUE',value:{category:'BROKEN'}}});await page.goto(`/owner/spots/${spotId}`);await expect(guided(page).getByRole('alert')).toContainText('nicht sicher geladen');await expect(guided(page).getByLabel('Weiteres Angebot hinzufügen')).toBeDisabled();expect(owner.submissions).toHaveLength(0);
});

test('Mehrfachauswahl erhält vorhandene bedingte und freie Angaben',async({page})=>{
 const p={...emptyExperienceProfile('BAR'),reviewed:true,offers:[{id:'drinks',kind:'DRINKS',name:'Getränke',areaIds:[],prices:[],schedule:[],validFrom:null,validUntil:null,properties:[{key:'food.drink',label:null,state:'KNOWN',value:'Wein',conditions:{...emptyExperienceConditions(),weekdays:[6]}},{key:'experience.activity',label:null,state:'KNOWN',value:'Bisheriger Sammeltext',conditions:emptyExperienceConditions()}]}]};
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'seed-profile',knowledgeState:'KNOWN_VALUE',value:p}});await page.goto(`/owner/spots/${spotId}`);await guided(page).getByLabel('Angebot Getränke bearbeiten',{exact:true}).click();await part(page,'Getränke einschließlich alkoholfreier Auswahl');await guided(page).getByRole('button',{name:'Bier',exact:true}).click();await part(page,'Was kann man hier machen?');await expect(guided(page).locator('blockquote').filter({hasText:'Bisheriger Sammeltext'})).toBeVisible();await guided(page).getByRole('button',{name:'etwas trinken',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const saved=owner.submissions[0].p_value as typeof p;expect(saved.offers[0].properties).toEqual(expect.arrayContaining(p.offers[0].properties));expect(saved.offers[0].properties.map(v=>v.value)).toEqual(expect.arrayContaining(['Wein','Bier','Bisheriger Sammeltext','etwas trinken']));
});

test('Bisherige Küche wird nur dem ausdrücklich ausgewählten Angebot zugeordnet',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'offering.cuisines':{claimId:'cuisine',knowledgeState:'KNOWN_VALUE',value:['ITALIAN']}});await page.goto(`/owner/spots/${spotId}`);await addFromCatalogue(page,'Mittagessen');await overview(page);await mainStep(page,3);await guided(page).getByLabel('Zuordnen zu',{exact:true}).selectOption({label:'Angebot: Mittagessen'});await guided(page).getByRole('button',{name:'In Entwurf übernehmen',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const p=owner.submissions[0].p_value as {properties:unknown[];offers:Array<{properties:Array<{key:string;value:unknown}>}>};expect(p.properties).toEqual([]);expect(p.offers[0].properties).toEqual(expect.arrayContaining([expect.objectContaining({key:'food.cuisine',value:'Italienisch'})]));
});

test('Vorkenntnisse schliessen sich aus, Begleitung bleibt unabhängig',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);
 await addFromCatalogue(page,'Bouldern');await part(page,'Voraussetzungen und nötige Begleitung');
 const q=guided(page).getByRole('region',{name:'Voraussetzungen und nötige Begleitung',exact:true});
 await q.getByRole('button',{name:'Keine Vorkenntnisse',exact:true}).click();await q.getByRole('button',{name:'Begleitung erforderlich',exact:true}).click();await q.getByRole('button',{name:'Vorkenntnisse erforderlich',exact:true}).click();
 await expect(q.getByRole('button',{name:'Keine Vorkenntnisse',exact:true})).toHaveAttribute('aria-pressed','false');await expect(q.getByRole('button',{name:'Begleitung erforderlich',exact:true})).toHaveAttribute('aria-pressed','true');
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const p=owner.submissions[0].p_value as {offers:Array<{properties:Array<{key:string;value:unknown}>}>};expect(p.offers[0].properties.filter(p=>p.key==='participation.prerequisite').map(p=>p.value)).toEqual(['Begleitung erforderlich','Vorkenntnisse erforderlich']);
});
test('Innen und Aussen sind unabhängig vom Zweck des Bereichs pflegbar',()=>{const spec=experienceAnswerGuidance('location.setting','SPORT',undefined,'BOULDER_AREA');expect(spec?.kind).toBe('CHOICES');if(spec?.kind==='CHOICES')expect(spec.choices).toEqual(expect.arrayContaining(['drinnen','draussen']));});

test('Bewegungslandschaft speichert Bewegungsspiel und Klettern am selben Angebot',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const p={...emptyExperienceProfile('SPORT'),reviewed:true,offers:[{id:'kids-play',kind:'MOVEMENT_PLAY',name:'Bewegungslandschaft für Kinder',areaIds:[],prices:[],schedule:[],validFrom:null,validUntil:null,properties:[{key:'experience.activity',label:null,state:'KNOWN',value:'Bewegungsspiel',conditions:emptyExperienceConditions()},{key:'participation.minimum_age',label:null,state:'KNOWN',value:1,conditions:emptyExperienceConditions()}]}]};
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'seed-sport',knowledgeState:'KNOWN_VALUE',value:p}});
 await page.goto(`/owner/spots/${spotId}`);await guided(page).getByLabel('Angebot Bewegungslandschaft für Kinder bearbeiten',{exact:true}).click();await part(page,'Was kann man hier machen?');
 const q=guided(page).getByRole('region',{name:'Was kann man hier machen?',exact:true});await expect(q.getByRole('button',{name:'Bewegungsspiel',exact:true})).toHaveAttribute('aria-pressed','true');await expect(q.getByRole('button',{name:'Klettern',exact:true})).toHaveAttribute('aria-pressed','false');
 await q.getByRole('button',{name:'Klettern',exact:true}).click();await expect(q.getByRole('button',{name:'Bewegungsspiel',exact:true})).toHaveAttribute('aria-pressed','true');await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const saved=owner.submissions[0].p_value as typeof p;expect(saved.offers).toHaveLength(1);expect(saved.offers[0].id).toBe('kids-play');expect(saved.offers[0].properties).toEqual(expect.arrayContaining([...p.offers[0].properties,expect.objectContaining({key:'experience.activity',value:'Klettern'})]));
 await page.reload();await guided(page).getByLabel('Angebot Bewegungslandschaft für Kinder bearbeiten',{exact:true}).click();await part(page,'Was kann man hier machen?');for(const name of ['Bewegungsspiel','Klettern'])await expect(guided(page).getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('Sportangebotstyp beschränkt Tätigkeiten nicht auf sein eigenes Label',()=>{
 for(const kind of ['MOVEMENT_PLAY','BOULDERING','CLIMBING','TRAINING','COURSE','CHILDREN_COURSE']){const spec=experienceAnswerGuidance('experience.activity','SPORT',kind);expect(spec?.kind).toBe('CHOICES');if(spec?.kind==='CHOICES'){expect(spec.multiple).toBe(true);expect(spec.choices).toEqual(expect.arrayContaining(['Bewegungsspiel','Klettern','Bouldern']));expect(new Set(spec.choices).size).toBe(spec.choices.length);}}
 const cafe=experienceAnswerGuidance('experience.activity','SPORT','CAFE');if(cafe?.kind==='CHOICES')expect(cafe.choices).not.toContain('Klettern');
});

test('Hotel übernimmt den Spottyp und kombiniert Übernachtung mit Bar ohne Pflegeart',async({page})=>{
 await page.setViewportSize({width:390,height:844});const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'classification.primary_category':{knowledgeState:'KNOWN_VALUE',value:'STAY'},'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:['HOTEL']}});
 await page.goto(`/owner/spots/${spotId}`);await expect(guided(page).getByText('Hotel',{exact:true})).toBeVisible();await expect(page.getByLabel('Art des Spots')).toHaveCount(0);
 await addFromCatalogue(page,'Übernachtung');await part(page,'Check-in ab');await guided(page).getByLabel('Check-in ab Wert').fill('15:00');await part(page,'Preise');await guided(page).getByRole('button',{name:'+ Preis hinzufügen',exact:true}).click();await guided(page).getByLabel('Preisbezeichnung').fill('Zimmer pro Nacht');await guided(page).getByLabel('Berechnung').selectOption('PER_ROOM_NIGHT');
 await guided(page).getByLabel('Preis 1 Von',{exact:true}).fill('160');await guided(page).getByLabel('Preis 1 Bis',{exact:true}).fill('160');await overview(page);
 await guided(page).getByLabel('Weiteres Angebot hinzufügen').selectOption('DRINKS');await part(page,'Getränke einschließlich alkoholfreier Auswahl');await guided(page).getByRole('button',{name:'Wein',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const p=owner.submissions[0].p_value as {category:string;properties:unknown[];offers:Array<{kind:string;properties:Array<{key:string;value:unknown}>;prices:Array<{basis:string}>}>};expect(p.category).toBe('STAY');expect(p.properties).toEqual([]);expect(p.offers.map(o=>o.kind)).toEqual(['OVERNIGHT_STAY','DRINKS']);expect(p.offers[0].prices[0].basis).toBe('PER_ROOM_NIGHT');expect(p.offers[0].properties).toEqual(expect.arrayContaining([expect.objectContaining({key:'stay.check_in',value:'15:00'})]));expect(p.offers[1].properties).toEqual(expect.arrayContaining([expect.objectContaining({key:'food.drink',value:'Wein'})]));
 await page.reload();await guided(page).getByLabel('Angebot Übernachtung bearbeiten',{exact:true}).click();await part(page,'Check-in ab');await expect(guided(page).getByLabel('Check-in ab Wert')).toHaveValue('15:00');
});

for(const group of SPOT_GROUPS)test(`Universelle Pflege ${group.id}: Vorschlag und Speicherung`,async({page})=>{
 const type=SPOT_TYPE_CATALOG.find(t=>t.group===group.id)!;const item=OFFER_CATALOG.find(o=>o.group===group.id);
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'classification.primary_category':{knowledgeState:'KNOWN_VALUE',value:group.id},'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:[type.kind]}});
 await page.goto(`/owner/spots/${spotId}`);await expect(guided(page).getByText(type.label,{exact:true})).toBeVisible();await expect(guided(page).getByLabel('Weiteres Angebot hinzufügen')).toBeVisible();
 if(item)await guided(page).getByLabel('Weiteres Angebot hinzufügen').selectOption(item.kind);else await addFromCatalogue(page,'Eigenes Angebot');
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const p=owner.submissions[0].p_value as {offers:Array<{kind:string}>};expect(p.offers[0].kind).toBe(item?.kind??'OTHER');
});

test('Spottypen zeigen passende Vorschläge, suchen global und behalten zusätzliche Auswahl',async({page})=>{
 await page.setViewportSize({width:390,height:844});const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'classification.primary_category':{knowledgeState:'KNOWN_VALUE',value:'STAY'},'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:['HOTEL']}});
 await page.goto(`/owner/spots/${spotId}`);await outerStep(page,2);const field=page.locator('[id="field-classification.place_types"]');await expect(field.getByRole('button',{name:'Hotel',exact:true})).toHaveAttribute('aria-pressed','true');await expect(field.getByRole('button',{name:'Weinbar',exact:true})).toHaveCount(0);
 await field.getByLabel('Auswahl durchsuchen').fill('Weinbar');await field.getByRole('button',{name:'Weinbar',exact:true}).click();await field.getByLabel('Auswahl durchsuchen').fill('');await expect(field.getByRole('button',{name:'Hotel',exact:true})).toHaveAttribute('aria-pressed','true');await expect(field.getByRole('button',{name:'Weinbar',exact:true})).toHaveAttribute('aria-pressed','true');
 await field.getByRole('button',{name:'Auswahl übernehmen',exact:true}).click();await expect.poll(()=>owner.submissions.length).toBe(1);expect(owner.submissions[0].p_value).toEqual(['HOTEL','WINE_BAR']);await page.reload();await outerStep(page,2);for(const name of ['Hotel','Weinbar'])await expect(field.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
});
