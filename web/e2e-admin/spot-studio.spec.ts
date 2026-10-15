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
 await expect(page.getByRole('heading',{name:'Was möchtest du bearbeiten?'})).toBeVisible();
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
 await expect(page.getByRole('heading',{name:'Zeiten dieses Angebots',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Abschnitt des Angebots'})).toHaveCount(0);
 await page.getByRole('button',{name:'Bilder & Verwaltung',exact:true}).click();
 await expect(page.locator('#spot-understanding')).toBeHidden();
 await expect(page.locator('#spot-information')).toBeVisible();
 await page.getByRole('button',{name:'Profil & Angebote',exact:true}).click();
 await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue('Übernachten im Doppelzimmer');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.screenshot({path:testInfo.outputPath(`admin-offer-${width}.png`),fullPage:true});
});
