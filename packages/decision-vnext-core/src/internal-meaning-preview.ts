import {createDecisionProductLunaProvider} from './product-luna-provider.js';
import type {LunaMeaningOutput} from './product-luna-librarian.js';
import type {LunaMeaningIssue} from './product-luna-meaning-contract.js';
import {contentHash} from './canonical.js';

export function createInternalMeaningPreviewHandler(input:{
    readonly authorize:(token:string)=>boolean;
    readonly apiKey:string;
    readonly codeIdentity:Readonly<Record<string,string>>;
    readonly fetchImpl?:typeof fetch;
    readonly now?:()=>Date;
}) {
    return async(request:Request):Promise<Response>=>{
        const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};
        const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
        // This is a server-to-server developer tool, never a browser API.
        if(request.headers.has('origin'))return reply(403,{error:'server_operator_required'});
        if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
        const authorization=request.headers.get('authorization')??'';
        if(!authorization.startsWith('Bearer ')||!input.authorize(authorization.slice(7)))return reply(403,{error:'server_operator_required'});
        if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:'json_required'});
        const reader=request.body?.getReader();if(!reader)return reply(400,{error:'invalid_request'});
        const chunks:Uint8Array[]=[];let size=0;
        while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return reply(413,{error:'request_too_large'});}chunks.push(part.value);}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        let value:unknown;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'invalid_request'});}
        if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1
            ||!('query' in value)||typeof value.query!=='string'||!value.query.trim()||value.query.length>2000)return reply(400,{error:'invalid_request'});
        const reference={now:(input.now?.()??new Date()).toISOString(),timezone:'Europe/Zurich' as const};
        const id=crypto.randomUUID();
        const productRequest={contractVersion:'backyrd.decision-vnext.product-request@1.0' as const,requestId:id,idempotencyKey:id,naturalLanguage:value.query,explicit:{targetCity:'Basel',targetCityRole:'SEARCH_CONTEXT' as const},alternativeRequested:false,previouslyPresentedCandidateIds:[],rejectedCandidateIds:[]};
        const actor={userId:crypto.randomUUID(),subjectBindingHash:contentHash('INTERNAL_SERVICE_OPERATOR_NOT_APP_USER'),authenticationContextHash:contentHash('SERVER_SERVICE_AUTHORIZATION'),sessionBindingHash:contentHash(id),sessionId:crypto.randomUUID()};
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);const started=performance.now();
        let modelCalls=0;const providerResponses:{readonly status:number}[]=[];const usages:unknown[]=[];const translationAttempts:{readonly output:LunaMeaningOutput;readonly issues:readonly LunaMeaningIssue[]}[]=[];
        try{
            let usage:unknown=null;
            const provider=createDecisionProductLunaProvider({apiKey:input.apiKey,onProviderResponse:attempt=>providerResponses.push(attempt),onTranslationAttempt:attempt=>translationAttempts.push(attempt),now:()=>new Date(reference.now),fetchImpl:async(url,options)=>{
                modelCalls++;if(modelCalls>3)throw Error('internal_model_call_limit');
                if(url!=='https://api.openai.com/v1/responses')throw Error('internal_provider_destination_invalid');
                const response=await (input.fetchImpl??fetch)(url,options);
                if(response.ok){const payload:unknown=await response.clone().json();if(payload&&typeof payload==='object'&&'usage'in payload){usage=payload.usage;usages.push(usage);}}
                return response;
            }});
            const meaning=await provider(productRequest,actor,controller.signal);
            if(controller.signal.aborted)return reply(504,{error:'internal_model_timeout'});
            return reply(200,{contractVersion:'backyrd.internal-meaning-preview@1',query:value.query,reference,meaning,usage,usages,modelCalls,translationAttempts,providerResponses,modelMs:performance.now()-started,codeIdentity:input.codeIdentity,
                boundaries:{providerKeyExposed:false,productionSearchExecuted:false,spotDataChanged:false,learningPersisted:false}});
        }catch(error){return reply(controller.signal.aborted?504:503,{error:controller.signal.aborted?'internal_model_timeout':error instanceof Error&&error.message==='product_luna_understanding_unresolved'?'internal_understanding_unresolved':'internal_model_unavailable',modelCalls,translationAttempts,providerResponses,failureCode:error instanceof Error&&/^product_luna_[a-z_]+$/.test(error.message)?error.message:'internal_provider_failure',codeIdentity:input.codeIdentity});}
        finally{clearTimeout(timer);controller.abort();}
    };
}
