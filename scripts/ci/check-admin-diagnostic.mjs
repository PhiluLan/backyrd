// Deno does not infer sibling .d.ts files for relative generated JS imports.
// Use declaration-only mappings for this check, never for runtime deployment.
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const dir=await mkdtemp(join(tmpdir(),'backyrd-diagnostic-types-'));
try{
 const imports={};
 for(const pkg of ['decision-vnext-core','world-knowledge-core','user-intelligence-vnext-core']){
  const dist=join(root,'packages',pkg,'dist');
  for(const name of await readdir(dist))if(name.endsWith('.js')){
   const declaration=join(dist,name.replace(/\.js$/,'.d.ts'));
   try{await readFile(declaration);imports[pathToFileURL(join(dist,name)).href]=pathToFileURL(declaration).href;}catch{/* Only declaration-bearing compiled modules need a type map. */}
  }
 }
 for(const pkg of ['world-knowledge-core','user-intelligence-vnext-core'])imports['@backyrd/'+pkg]=pathToFileURL(join(root,'packages',pkg,'dist/server-runtime.d.ts')).href;
 const config=join(dir,'deno.json');await writeFile(config,JSON.stringify({imports,compilerOptions:{strict:true}}));
 execFileSync('npm',['exec','--yes','--package=deno@2.5.6','--','deno','check','--config',config,join(root,'supabase/functions/decision-admin-diagnostic/index.ts')],{cwd:root,stdio:'inherit'});
}finally{await rm(dir,{recursive:true,force:true});}
