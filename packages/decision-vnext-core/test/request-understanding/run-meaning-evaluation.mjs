import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {evaluateMeaningCorpus} from './meaning-evaluation.mjs';
const args=process.argv.slice(2),outputIndex=args.indexOf('--output'),corpusIndex=args.indexOf('--corpus');
if(!args.includes('--live')||outputIndex<0||!args[outputIndex+1]||!process.env.OPENAI_API_KEY) {
  console.error('Use --live --output <ignored-local-report.json> with OPENAI_API_KEY in the server process environment.');
  process.exit(2);
}
if(corpusIndex>=0&&!args[corpusIndex+1]){console.error('Missing --corpus path.');process.exit(2);}
const corpusPath=corpusIndex>=0?resolve(args[corpusIndex+1]):new URL('./meaning-corpus.json',import.meta.url);
const corpus=JSON.parse(await readFile(corpusPath,'utf8'));
const report=await evaluateMeaningCorpus({corpus,apiKey:process.env.OPENAI_API_KEY,pipeline:args.includes("--pipeline")});
// Exclusive output creation prevents overwriting earlier evidence. Reports
// contain approved synthetic fixtures only; never use production requests here.
await writeFile(resolve(args[outputIndex+1]),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({cases:report.results.length,providerCalls:report.providerCalls,
  validContracts:report.results.filter(c=>c.status==='VALID_CONTRACT').length,
  errors:report.results.filter(c=>c.status==='ERROR').length,semanticReview:report.semanticReview,stopReason:report.stopReason}));
