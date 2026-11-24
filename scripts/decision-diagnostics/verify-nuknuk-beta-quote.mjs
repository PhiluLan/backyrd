import {readFile} from 'node:fs/promises';
import {admitBetaQuote} from './nuknuk-beta-training-plan.mjs';
const quote=JSON.parse(await readFile(process.argv[2]));
console.log(JSON.stringify(admitBetaQuote(quote,Date.now()/1000)));
