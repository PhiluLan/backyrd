import {timingSafeEqual} from 'node:crypto';
import {createInternalMeaningPreviewHandler} from '../../../packages/decision-vnext-core/dist/internal-meaning-preview.js';
import identity from './build-identity.json' with {type:'json'};

const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const apiKey=Deno.env.get('OPENAI_API_KEY');
if(!key||!apiKey||identity.mode!=='INTERNAL_PREVIEW_CURRENT_BUILD')throw Error('internal_preview_configuration_missing');
const expected=new TextEncoder().encode(key);
Deno.serve(createInternalMeaningPreviewHandler({apiKey,codeIdentity:identity,authorize(token){
    const actual=new TextEncoder().encode(token);
    return actual.length===expected.length&&timingSafeEqual(actual,expected);
}}));
