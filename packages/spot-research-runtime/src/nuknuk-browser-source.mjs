import {lookup} from 'node:dns/promises';
import {publicSourceUrl,isPublicIPv4,matchesExistingWebsite} from './nuknuk-sources.mjs';

/** Anonymous public browser fallback. No user session, CAPTCHA solving or
 * copied security tokens. A continuing access denial remains a source failure. */
export async function fetchBrowserSource(value,{timeoutMs=45000,maxBytes=2000000,launch,resolve=lookup}={}) {
  const url=publicSourceUrl(value),origin=new URL(url).origin;
  const hosts=[new URL(url).hostname,'challenges.cloudflare.com'];
  const addresses=await Promise.all(hosts.map(async host=>{
    const rows=await resolve(host,{family:4,all:true});
    if(!rows.length||rows.some(row=>!isPublicIPv4(row.address)))throw new Error('source_private_address');
    return [host,rows[0].address];
  }));
  const launchBrowser=launch??(await import('playwright')).chromium.launch.bind((await import('playwright')).chromium);
  const browser=await launchBrowser({headless:true,args:['--host-resolver-rules='+addresses.map(([host,ip])=>`MAP ${host} ${ip}`).join(', ')]});
  try {
    const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
    let requests=0;
    await context.route('**/*',async route=>{
      const req=route.request();
      try {
        const target=publicSourceUrl(req.url());
        const verificationPost=req.method()==='POST'&&/\/cdn-cgi\/challenge-platform\//u.test(new URL(target).pathname);
        if(req.method()!=='GET'&&!verificationPost||++requests>80||!hosts.includes(new URL(target).hostname)||['image','media','font'].includes(req.resourceType()))return await route.abort();
        if(req.isNavigationRequest()&&new URL(target).origin!==origin)return await route.abort();
        await route.continue();
      }catch{await route.abort();}
    });
    const page=await context.newPage();let mainStatus=0;
    page.on('response',response=>{if(response.request().isNavigationRequest()&&response.frame()===page.mainFrame())mainStatus=response.status();});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:timeoutMs});
    // Allow only the ordinary public page's own verification to complete.
    await page.waitForFunction(()=>!/(?:just a moment|checking your browser|sicherheitsüberprüfung|verify you are human)/iu.test(document.title+' '+document.body.innerText.slice(0,1500)),{},{timeout:timeoutMs});
    const finalUrl=publicSourceUrl(page.url());
    if(!matchesExistingWebsite(finalUrl,url)||new URL(finalUrl).origin!==origin)throw new Error('UNEXPECTED_SOURCE_URL');
    if(mainStatus>=400)throw new Error('source_browser_http_'+mainStatus);
    const body=await page.content();
    if(/(?:403\s+Forbidden|Access\s+Denied|captcha)/iu.test(await page.title()))throw new Error('source_browser_access_denied');
    if(Buffer.byteLength(body)>maxBytes)throw new Error('source_too_large');
    if(/cf-chl-|challenge-platform/iu.test(body)&&/(?:just a moment|verify you are human|sicherheitsüberprüfung)/iu.test(await page.title()))throw new Error('source_browser_access_denied');
    return {url:finalUrl,contentType:'text/html',body,observedAt:new Date().toISOString(),acquisition:'ANONYMOUS_BROWSER',...(finalUrl!==url?{redirectedFrom:[url]}:{})};
  }finally{await browser.close();}
}
