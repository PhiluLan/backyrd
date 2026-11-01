import {cp,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyEdgeDeployClosure} from '../ci/verify-edge-deploy-closure.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const previewSlug='decision-internal-meaning-preview';
const packages=['decision-vnext-core','world-knowledge-core','user-intelligence-vnext-core'];
async function files(path){const rows=[];for(const entry of await readdir(path,{withFileTypes:true})){const p=resolve(path,entry.name);if(entry.isDirectory())rows.push(...await files(p));else if(entry.isFile())rows.push(p);}return rows.sort();}
export async function internalRuntimeHash(){
 const hash=createHash('sha256');
 for(const name of packages)for(const p of await files(resolve(root,'packages',name,'dist'))){hash.update(relative(root,p));hash.update('\0');hash.update(await readFile(p));hash.update('\0');}
 return hash.digest('hex');
}
export async function buildInternalPreview(output){
 const target=resolve(output);if(!target.startsWith('/tmp/')&&!target.startsWith('/private/tmp/'))throw Error('internal_preview_temporary_output_required');
 await mkdir(target,{recursive:true});
 for(const name of packages)await cp(resolve(root,'packages',name,'dist'),resolve(target,'packages',name,'dist'),{recursive:true});
 await cp(resolve(root,'packages/shared/src'),resolve(target,'packages/shared/src'),{recursive:true});
 await cp(resolve(root,'scripts/decision-diagnostics/internal-preview'),resolve(target,'supabase/functions',previewSlug),{recursive:true});
 const identity={mode:'INTERNAL_PREVIEW_CURRENT_BUILD',gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),coreBundleHash:await internalRuntimeHash()};
 await writeFile(resolve(target,'supabase/functions',previewSlug,'build-identity.json'),JSON.stringify(identity,null,2));
 await writeFile(resolve(target,'supabase/config.toml'),`project_id = "backyrd-internal-preview"\n[functions.${previewSlug}]\nenabled = true\nverify_jwt = true\nentrypoint = "./functions/${previewSlug}/index.ts"\n`);
 const closure=verifyEdgeDeployClosure(target,previewSlug);
 await writeFile(resolve(target,'internal-preview-manifest.json'),JSON.stringify({identity,closure,scope:{function:previewSlug,consumerFunctionsChanged:false,sql:false,authGrants:false,providerKeyReturned:false,authentication:'SERVER_SERVICE_ROLE_ONLY'}},null,2));
 return {identity,closure,output:target};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){buildInternalPreview(process.argv[2]??'').then(value=>console.log(JSON.stringify(value))).catch(()=>{console.error('internal_preview_build_failed');process.exitCode=1;});}
