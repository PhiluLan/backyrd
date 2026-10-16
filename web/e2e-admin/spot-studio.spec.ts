import { expect, test, type Page } from '@playwright/test';

const spotId='41000000-0000-4000-8000-000000000001';
async function mockAdmin(page:Page){
 const encode=(value:object)=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const user={id:'41000000-0000-4000-8000-000000000099',aud:'authenticated',role:'authenticated',email:'admin@backyrd.test',app_metadata:{},user_metadata:{},identities:[],created_at:'2026-10-15T00:00:00Z'};
 const expires=Math.floor(Date.now()/1000)+3600;
 const session={access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,role:'authenticated',exp:expires})}.synthetic`,refresh_token:'synthetic',expires_at:expires,expires_in:3600,token_type:'bearer',user};
 await page.addInitScript(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),session);
 const reply=(value:unknown)=>({status:200,contentType:'application/json',body:JSON.stringify(value)});
 await page.route('**/auth/v1/user',route=>route.fulfill(reply(user)));
 await page.route('**/rest/v1/rpc/admin_is_admin_v1',route=>route.fulfill(reply(true)));
 await page.route('**/rest/v1/spots?**',route=>route.fulfill(reply({id:spotId,name:'Beispielhotel',city:'Zürich',status:'approved',category:'HOTEL',header_image_url:null,gallery_urls:[]})));
 await page.route('**/rest/v1/spot_hours?**',route=>route.fulfill(reply([])));
 await page.route('**/rest/v1/rpc/admin_spot_presentation_policy_v1',route=>route.fulfill(reply({fields:[]})));
 await page.route('**/rest/v1/rpc/world_product_authoring_detail_v1',route=>route.fulfill(reply({
  contractVersion:'backyrd.world-knowledge.product-authoring-detail@1.0',spotId,name:'Beispielhotel',status:'approved',
  actor:{role:'ADMIN',entitlement:'ADMIN',allowedAttributeKeys:['identity.name','classification.primary_category','classification.place_types','experience.profile']},
  answers:{'identity.name':{claimId:'name',knowledgeState:'KNOWN_VALUE',value:'Beispielhotel'},'classification.primary_category':{claimId:'category',knowledgeState:'KNOWN_VALUE',value:'STAY'}},openConflicts:[],manifest:null,
 })));
}
for(const width of [390,1280])test(`Admin bearbeitet Profil und Medien getrennt bei ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});await mockAdmin(page);
 await page.goto(`/spots/${spotId}/edit`);
 await expect(page.getByRole('heading',{name:'Dein Spotprofil'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Beispielhotel',exact:true})).toHaveCount(1);
 await expect(page.locator('#spot-information')).toBeHidden();
 await expect(page.getByText('Veröffentlicht',{exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath(`admin-home-${width}.png`),fullPage:true});
 await expect(page.getByRole('button',{name:/04 Räume & Bereiche/})).toBeVisible();
 await expect(page.getByRole('button',{name:/05 Gemeinsame Ausstattung & Anreise/})).toBeVisible();
 await page.getByRole('button',{name:/03 Angebote/}).click();
 await page.getByRole('button',{name:'Weiteres Angebot hinzufügen',exact:true}).click();
 await page.getByLabel('Weiteres Angebot hinzufügen',{exact:true}).selectOption('OVERNIGHT_STAY');
 await page.getByLabel('Name des Angebots',{exact:true}).fill('Übernachten im Doppelzimmer');
 await expect(page.getByRole('heading',{name:'Preise (0)',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Wann ist dieses Angebot erhältlich?',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Abschnitt des Angebots'})).toHaveCount(0);
 await page.getByRole('button',{name:'Bilder & Verwaltung',exact:true}).click();
 await expect(page.locator('#spot-understanding')).toBeHidden();
 await expect(page.locator('#spot-information')).toBeVisible();
 await page.getByRole('button',{name:'Profil & Angebote',exact:true}).click();
 await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue('Übernachten im Doppelzimmer');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.screenshot({path:testInfo.outputPath(`admin-offer-${width}.png`),fullPage:true});
});

test('Spotliste nutzt aktuelle Profilangaben statt Gold-Prozenten und aktualisiert nach Änderungen',async({page})=>{
 await mockAdmin(page);let complete=false,legacyReads=0,unavailable=false;
 const reply=(value:unknown)=>({status:200,contentType:'application/json',body:JSON.stringify(value)});
 await page.route('**/rest/v1/rpc/admin_spots_intelligence_v1',route=>route.fulfill(reply({summary:{spots:1,viewed:0,partner_spots:0,views:0},spots:[{spot_id:spotId,name:'Beispielhotel',city:'Zürich',status:'approved',views:0,ctr:0,reviews:0}]})));
 await page.route('**/rest/v1/rpc/admin_spot_readiness_worklist_v1',route=>{legacyReads++;return route.fulfill(reply([{spot_id:spotId,coverage:58,gap_count:5}]));});
 await page.route('**/rest/v1/rpc/world_product_authoring_detail_v1',route=>unavailable?route.fulfill({status:503,json:{message:'unavailable'}}):route.fulfill(reply({contractVersion:'backyrd.world-knowledge.product-authoring-detail@1.0',spotId,actor:{allowedAttributeKeys:['identity.name','classification.primary_category','classification.place_types']},answers:{'identity.name':{knowledgeState:'KNOWN_VALUE',value:'Beispielhotel'},'classification.primary_category':{knowledgeState:'KNOWN_VALUE',value:'STAY'},...(complete?{'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:['HOTEL']}}:{})},manifest:null})));
 await page.goto('/spots');await expect(page.getByRole('columnheader',{name:'Profilstand'})).toBeVisible();
 await expect(page.locator('.admin-desktopTable .admin-profileStatus')).toContainText('1 Pflichtangabe prüfen');
 await expect(page.getByText('58%',{exact:true})).toHaveCount(0);await expect(page.getByText('5 offene Punkte',{exact:true})).toHaveCount(0);expect(legacyReads).toBe(0);
 complete=true;await page.getByRole('button',{name:'Profilstatus aktualisieren',exact:true}).click();
 await expect(page.locator('.admin-desktopTable .admin-profileStatus')).toContainText('Grunddaten vorhanden');await expect(page.locator('.admin-desktopTable .admin-profileStatus')).toContainText('Noch keine Angebote erfasst');
 unavailable=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.admin-desktopTable .admin-profileStatus')).toContainText('Status nicht verfügbar');
});


test('Profilstand lädt nur die sichtbare Seite und begrenzt parallele Abfragen',async({page})=>{
 await mockAdmin(page);const ids=Array.from({length:26},(_,i)=>`41000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`);const requests:string[]=[];let concurrent=0,maximum=0;
 await page.route('**/rest/v1/rpc/admin_spots_intelligence_v1',route=>route.fulfill({json:{summary:{spots:26,viewed:0,partner_spots:0,views:0},spots:ids.map((id,i)=>({spot_id:id,name:`Spot ${i+1}`,city:'Basel',status:'approved',views:0,ctr:0,reviews:0}))}}));
 await page.route('**/rest/v1/rpc/world_product_authoring_detail_v1',async route=>{
  const id=route.request().postDataJSON().p_spot_id as string;requests.push(id);concurrent++;maximum=Math.max(maximum,concurrent);
  await new Promise(resolve=>setTimeout(resolve,20));await route.fulfill({json:{contractVersion:'backyrd.world-knowledge.product-authoring-detail@1.0',spotId:id,actor:{allowedAttributeKeys:['identity.name']},answers:{'identity.name':{knowledgeState:'KNOWN_VALUE',value:'Beispiel'}},manifest:null}});concurrent--;
 });
 await page.goto('/spots');await expect(page.locator('.admin-desktopTable .admin-profileStatus').filter({hasText:'Grunddaten vorhanden'})).toHaveCount(25);expect(requests).toHaveLength(25);expect(maximum).toBeLessThanOrEqual(4);
 await page.getByRole('button',{name:'Weiter',exact:true}).click();await expect(page.locator('.admin-desktopTable .admin-profileStatus').filter({hasText:'Grunddaten vorhanden'})).toHaveCount(1);expect(requests).toHaveLength(26);
});

for(const failure of ['none','gallery','header'] as const)test(`Medienupload bestätigt Titelbild und Galerie oder meldet Fehler: ${failure}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockAdmin(page);let header:string|null=null,sequence=0,uploads=0;const photos:Array<{id:number;spot_id:string;url:string}>=[];const patches:Array<Record<string,unknown>>=[];
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
 await page.route('**/rest/v1/rpc/backyrd_admin_save_spot_basics_v1',route=>{
  const patch=route.request().postDataJSON().p_patch as Record<string,unknown>;patches.push(patch);
  if(failure==='header'&&typeof patch.header_photo_path==='string'&&patch.header_photo_path) return route.fulfill({status:403,json:{message:'forbidden'}});
  if('header_photo_path' in patch)header=typeof patch.header_photo_path==='string'&&patch.header_photo_path.trim()?patch.header_photo_path:null;
  return route.fulfill({json:{spot:{id:spotId,name:'Beispielhotel',city:'Zürich',status:'approved',header_photo_path:header}}});
 });
 await page.route('**/storage/v1/object/spot-photos/**',route=>{uploads++;return route.fulfill({json:{Key:'spot-photos/test-image.png'}});});
 await page.route('**/rest/v1/spot_photos?**',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:photos});
  if(failure==='gallery')return route.fulfill({status:403,json:{message:'RLS denied'}});
  const body=route.request().postDataJSON();const row={...body,id:++sequence};photos.push(row);return route.fulfill({json:row});
 });
 await page.goto(`/spots/${spotId}/edit`);await page.getByRole('button',{name:'Bilder & Verwaltung',exact:true}).click();
 await page.getByLabel('Titelbild auswählen',{exact:true}).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:bytes});
 await page.getByLabel('Galeriebilder auswählen',{exact:true}).setInputFiles({name:'gallery.png',mimeType:'image/png',buffer:bytes});
 await page.locator('#spot-information').getByRole('button',{name:'Speichern',exact:true}).click();
 if(failure==='none'){
  await expect(page.getByText('2 Bilder und Verwaltungsangaben gespeichert.',{exact:true})).toBeVisible();expect(uploads).toBe(2);expect(photos).toHaveLength(2);expect(header).toContain('/storage/v1/object/public/spot-photos/header-');
  const committed=header;await page.locator('#spot-information').getByRole('button',{name:'Speichern',exact:true}).click();await expect(page.getByText('Verwaltungsangaben gespeichert. Es waren keine neuen Bilder ausgewählt.',{exact:true})).toBeVisible();expect(uploads).toBe(2);expect(header).toBe(committed);
 }else{
  await expect(page.locator('.by-alert').getByText(failure==='gallery'?'Das Bild wurde hochgeladen, konnte aber nicht dem Spot zugeordnet werden. Es wird noch kein Erfolg bestätigt.':'Das Foto ist in der Galerie gespeichert, konnte aber nicht als Titelbild bestätigt werden. Bitte versuche die Auswahl erneut.',{exact:true})).toBeVisible();await expect(page.getByText(/Bilder und Verwaltungsangaben gespeichert/)).toHaveCount(0);expect(header).toBeNull();
 }
 expect(patches.some(patch=>typeof patch.header_photo_path==='string'&&!!patch.header_photo_path)).toBe(failure!=='gallery');
});
