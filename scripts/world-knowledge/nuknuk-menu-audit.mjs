#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditMenuImages} from '../../packages/spot-research-runtime/src/nuknuk-menu-media.mjs';
export {agreeingPricedRows} from '../../packages/spot-research-runtime/src/nuknuk-menu-media.mjs';

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [url,output]=process.argv.slice(2);
  if(!url||!output){console.error('usage: node nuknuk-menu-audit.mjs OFFICIAL_MENU_URL OUTPUT_JSON');process.exitCode=1;}
  else try {
    const result=await auditMenuImages(url);
    await writeFile(resolve(output),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({images:result.images.length,candidateRows:result.candidateRows,fetchFailures:result.fetchFailures?.length??0,output}));
  }catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
