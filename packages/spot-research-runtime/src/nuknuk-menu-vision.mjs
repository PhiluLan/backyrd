// Independent check of local vision-model menu readings against OCR evidence.
// Corroborated rows are review leads; they never become catalog assertions.
import {normalizeOcrText} from './nuknuk-menu-media.mjs';
import {createHash} from 'node:crypto';
import {localModelEndpoint} from './nuknuk-research.mjs';

export const MENU_VISION_PROMPT='Read only the visible printed menu board. Return JSON with key rows, an array of objects {name, price}. Copy complete product names exactly as printed and pair each with its own price. Include concrete food and drink items; omit section headings, size labels, slogans, and items without a readable price. If two prices are printed for one item, give two rows with the same name and each price. Do not guess hidden words or normalize spellings.';

const amount=value=>{
  if(typeof value!=='string'||!/^\d{1,3}[.,]\d{1,2}$/u.test(value.trim()))return null;
  const number=Number(value.trim().replace(',','.'));
  return number>0&&number<1000?number:null;
};
const pricesIn=text=>[...String(text).matchAll(/(?<!\d)\d{1,3}[.,]\d{1,2}(?!\d)/gu)].map(match=>amount(match[0]));
const vagueName=name=>/^(?:(?:flasche|glas|fass|klein|gross|groß|small|large|wasser|weisswein|weißwein|rotwein|rosé|rose|bier|wein|drinks?|kaffee|hausgemacht|vegi|vegan|ipa|neipa)(?:\s|$)|diverse\s+tee$|landwein(?:\s|$))/iu.test(name.trim());

export function parseMenuVisionRows(raw) {
  if(typeof raw!=='string'||raw.length>24000)throw new Error('menu_vision_response_invalid');
  const body=raw.trim().replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'');
  let parsed;try{parsed=JSON.parse(body);}catch{throw new Error('menu_vision_response_invalid');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).length!==1||!Array.isArray(parsed.rows)||parsed.rows.length>100)throw new Error('menu_vision_response_invalid');
  return parsed.rows.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||typeof row.name!=='string'||typeof row.price!=='string'||row.name.length<2||row.name.length>120||row.price.length>20)throw new Error('menu_vision_row_invalid');
    return {name:row.name.trim(),price:row.price.trim()};
  });
}

export function corroborateMenuVisionRows(raw,imageAudit) {
  if(!imageAudit||!Array.isArray(imageAudit.visionLines)||!Array.isArray(imageAudit.tesseractLayoutLines)||!Array.isArray(imageAudit.tesseractLines)||typeof imageAudit.url!=='string'||typeof imageAudit.assetHash!=='string')throw new Error('menu_vision_audit_invalid');
  const rows=parseMenuVisionRows(raw),corroborated=[],held=[];
  for(const row of rows) {
    const value=amount(row.price),name=normalizeOcrText(row.name);
    let reason=null,evidence=null;
    if(!value)reason='PRICE_MISSING_OR_INVALID';
    else if(vagueName(row.name))reason='GENERIC_OR_CONTEXT_DEPENDENT_NAME';
    else {
      for(const priceLine of imageAudit.visionLines) {
        if(!pricesIn(priceLine.text).includes(value)||priceLine.confidence<0.65)continue;
        const left=imageAudit.visionLines.filter(line=>line!==priceLine&&line.confidence>=0.65&&line.x<priceLine.x&&Math.abs(line.y-priceLine.y)<=0.014&&!pricesIn(line.text).length)
          .sort((a,b)=>a.x-b.x);
        const joined=normalizeOcrText(left.map(line=>line.text).join(' '));
        if(joined===name||joined.includes(name)&&name.length>=8){evidence={method:'VISION_ROW_GEOMETRY',nameLines:left,priceLine};break;}
      }
      if(!evidence)for(const line of [...imageAudit.tesseractLayoutLines,...imageAudit.tesseractLines]){
        const normalized=normalizeOcrText(line);
        if(normalized.includes(name)&&name.length>=4&&pricesIn(line).includes(value)){evidence={method:'TESSERACT_ROW',line};break;}
      }
      if(!evidence)reason='NAME_PRICE_ROW_NOT_CORROBORATED';
    }
    const item={name:row.name,price:row.price,imageUrl:imageAudit.url,discoveredOn:imageAudit.discoveredOn,assetHash:imageAudit.assetHash,...(evidence?{evidence}:{reason})};
    (evidence?corroborated:held).push(item);
  }
  return {modelRows:rows.length,corroborated,held,catalogWrites:0,certifiedComplete:false};
}

/** @param {Buffer} imageBuffer
 * @param {'image/jpeg'|'image/png'} mimeType
 * @param {string} modelPath
 * @param {object} imageAudit
 * @param {{fetchImpl?:typeof fetch,timeoutMs?:number}} [options]
 */
export async function readLocalMenuImage(imageBuffer,mimeType,modelPath,imageAudit,{fetchImpl=fetch,timeoutMs=240000}={}) {
  if(!Buffer.isBuffer(imageBuffer)||imageBuffer.length<1||imageBuffer.length>4000000||!['image/jpeg','image/png'].includes(mimeType)||typeof modelPath!=='string'||!/^\/[\w./-]+\/[0-9a-f]{40}$/u.test(modelPath)||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>240000)throw new Error('menu_vision_request_invalid');
  if(createHash('sha256').update(imageBuffer).digest('hex')!==imageAudit?.assetHash)throw new Error('menu_vision_asset_mismatch');
  const endpoint=localModelEndpoint('http://127.0.0.1:8088/v1/chat/completions');
  const body={model:modelPath,temperature:0,max_tokens:1200,stream:false,messages:[{role:'user',content:[{type:'text',text:MENU_VISION_PROMPT},{type:'image_url',image_url:{url:`data:${mimeType};base64,${imageBuffer.toString('base64')}`}}]}]};
  const started=Date.now();
  const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)throw new Error(`menu_vision_http_${response.status}`);
  const responseText=await response.text();
  if(responseText.length>64000)throw new Error('menu_vision_response_too_large');
  let parsed;try{parsed=JSON.parse(responseText);}catch{throw new Error('menu_vision_response_invalid');}
  const raw=parsed?.choices?.[0]?.message?.content;
  return {...corroborateMenuVisionRows(raw,imageAudit),raw,modelRevision:modelPath.split('/').at(-1),promptHash:createHash('sha256').update(MENU_VISION_PROMPT).digest('hex'),latencyMs:Date.now()-started};
}
