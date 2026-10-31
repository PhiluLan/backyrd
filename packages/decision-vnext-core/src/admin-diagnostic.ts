import type { DecisionProductAuthenticatedActor } from './product-decision.js';

export const BASEL_DIAGNOSTIC_QUERIES = Object.freeze([
  'Ein ruhiges Café in Basel für einen Kaffee mit einer Freundin.',
  'Wo können wir heute Abend in Basel gratis Pingpong spielen?',
  'Ich möchte heute in Basel schwimmen gehen.',
  'Wir suchen ein veganes Mittagessen in Basel.',
  'Eine gemütliche Bar in Basel für ein erstes Date, wo wir uns gut unterhalten können.',
  'Mit zwei Kindern etwas draussen in Basel unternehmen, möglichst kostenlos.',
  'Wir sind sechs Personen und möchten am Samstag einen Escape Room in Basel spielen.',
  'Ich möchte in Basel spontan eine Sauna besuchen, ohne in einem Hotel zu übernachten.',
  'Wo kann ich diesen Sonntag in Basel über einen Flohmarkt schlendern?',
  'Ich bin mit dem Rollstuhl unterwegs und suche in Basel einen Ort für Live-Jazz.',
]);
export const DIAGNOSTIC_REFERENCE = Object.freeze({now:'2026-10-29T23:49:00.000Z',timezone:'Europe/Zurich' as const});
const allowedOrigins = new Set(['https://intelligence.backyrd.ch','http://127.0.0.1:3017']);

export type AdminDiagnosticInput = {readonly caseIndex:number} | {readonly query:string};
export function resolveAdminDiagnosticCase(input:AdminDiagnosticInput, now:Date=new Date()) {
  return 'caseIndex' in input
    ? {caseIndex:input.caseIndex,query:BASEL_DIAGNOSTIC_QUERIES[input.caseIndex]!,reference:DIAGNOSTIC_REFERENCE}
    : {caseIndex:-1,query:input.query,reference:{now:now.toISOString(),timezone:'Europe/Zurich' as const}};
}
export interface AdminDiagnosticPorts {
  authenticate(token:string,signal:AbortSignal):Promise<DecisionProductAuthenticatedActor|null>;
  isAdmin(token:string,signal:AbortSignal):Promise<boolean>;
  checkControl(signal:AbortSignal):Promise<void>;
  diagnose(input:AdminDiagnosticInput,actor:DecisionProductAuthenticatedActor,signal:AbortSignal):Promise<unknown>;
}

/** Admin diagnostics without request quotas or calendar expiry. Authentication,
 * Admin authorization, request validation and runtime control remain mandatory. */
export function createAdminDiagnosticHandler(ports:AdminDiagnosticPorts) {
  return async(request:Request):Promise<Response>=>{
    const origin=request.headers.get('origin');
    const headers:Record<string,string>={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
    const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
    if(origin&&!allowedOrigins.has(origin))return reply(403,{error:'origin_denied'});
    if(origin){headers['access-control-allow-origin']=origin;headers.vary='origin';headers['access-control-allow-headers']='authorization,apikey,content-type,x-client-info,x-region';headers['access-control-allow-methods']='POST, OPTIONS';}
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const authorization=request.headers.get('authorization')??'';
      if(!authorization.startsWith('Bearer '))return reply(401,{error:'authentication_required'});
      const token=authorization.slice(7).trim();
      const actor=await ports.authenticate(token,controller.signal);
      if(!actor)return reply(401,{error:'invalid_session'});
      if(!await ports.isAdmin(token,controller.signal))return reply(403,{error:'admin_required'});
      if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return reply(415,{error:'json_required'});
      const reader=request.body?.getReader();
      if(!reader)return reply(400,{error:'invalid_request'});
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return reply(413,{error:'request_too_large'});}chunks.push(part.value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let body:unknown;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'invalid_request'});}
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1)return reply(400,{error:'diagnostic_request_invalid'});
      let input:AdminDiagnosticInput;
      if('caseIndex' in body && typeof body.caseIndex==='number' && Number.isInteger(body.caseIndex) && body.caseIndex>=0 && body.caseIndex<BASEL_DIAGNOSTIC_QUERIES.length) input={caseIndex:body.caseIndex};
      else if('query' in body && typeof body.query==='string' && body.query.trim().length>0 && body.query.length<=2000) input={query:body.query};
      else return reply(400,{error:'diagnostic_request_invalid'});
      await ports.checkControl(controller.signal);
      const result=await ports.diagnose(input,actor,controller.signal);
      if(controller.signal.aborted)return reply(504,{error:'diagnostic_timeout'});
      return reply(200,result);
    }catch{return reply(controller.signal.aborted?504:503,{error:controller.signal.aborted?'diagnostic_timeout':'diagnostic_unavailable'});}
    finally{clearTimeout(timer);controller.abort();}
  };
}
