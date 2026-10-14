import { createDiscoveryPreparationProvider } from "./discovery-preparation.js";
/** The server loader must authorize the current actor, consume the preparation
 * budget, and select only a PUBLIC, confirmed canonical source claim whose
 * digest equals sourceHash. Request bodies never supply the upstream text. */
export function createDiscoveryPreparationHttpHandler(options:{apiKey?:string;loadPublicMaterial:(token:string,spotId:string,sourceHash:string,signal:AbortSignal)=>Promise<string|null>;fetchImpl?:typeof fetch}){
  return async(request:Request):Promise<Response>=>{
    if(request.method!=="POST")return Response.json({error:"method_not_allowed"},{status:405});
    const token=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if(!token)return Response.json({error:"authentication_required"},{status:401});
    let input:unknown;try{const body=await request.text();if(new TextEncoder().encode(body).length>2000)throw new Error();input=JSON.parse(body);}catch{return Response.json({error:"invalid_request"},{status:400});}
    if(!input||typeof input!=="object"||Array.isArray(input))return Response.json({error:"invalid_request"},{status:400});
    const row=input as Record<string,unknown>;
    if(Object.keys(row).sort().join()!==["consentToOpenAI","sourceHash","spotId"].sort().join()||typeof row.spotId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.spotId)||typeof row.sourceHash!=="string"||!/^[0-9a-f]{64}$/.test(row.sourceHash))return Response.json({error:"invalid_request"},{status:400});
    if(row.consentToOpenAI!==true)return Response.json({error:"public_material_consent_required"},{status:400});
    const abort=new AbortController(),cancel=()=>abort.abort();request.signal.addEventListener("abort",cancel,{once:true});const timer=setTimeout(cancel,25000);
    try{
      if(request.signal.aborted)throw new Error("aborted");
      const description=await options.loadPublicMaterial(token,row.spotId,row.sourceHash,abort.signal);
      if(description===null)return Response.json({error:"public_source_scope_or_budget_denied"},{status:403});
      if(!options.apiKey)return Response.json({error:"preparation_unavailable"},{status:503});
      const draft=await createDiscoveryPreparationProvider({apiKey:options.apiKey,...(options.fetchImpl?{fetchImpl:options.fetchImpl}:{})})({description,publicMaterial:true,consentToOpenAI:true},abort.signal);
      if(abort.signal.aborted)throw new Error("aborted");
      return Response.json({draft,sourceHash:row.sourceHash,requiresHumanReview:true},{headers:{"cache-control":"no-store"}});
    }catch(error){if(error instanceof Error && error.message==="discovery_preparation_rate_limited")return Response.json({error:"preparation_rate_limited"},{status:429,headers:{"retry-after":"60","cache-control":"no-store"}});return Response.json({error:abort.signal.aborted?"preparation_timeout":"preparation_failed"},{status:abort.signal.aborted?504:503});}
    finally{clearTimeout(timer);request.signal.removeEventListener("abort",cancel);}
  };
}
