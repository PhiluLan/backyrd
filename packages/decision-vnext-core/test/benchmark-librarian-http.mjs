/** CPU integration benchmark: model, database, auth and control are test doubles. */
import {performance} from 'node:perf_hooks';
import {exercise} from './librarian-active-route-fixtures.mjs';
import {request,meal,profile,binding} from './librarian-matching-fixtures.mjs';
for(const size of [10,100,1000]){
 const catalog=Array.from({length:size},(_,i)=>binding(i+1,profile()));
 const samples=[];let result;
 for(let i=0;i<6;i++){const start=performance.now();result=await exercise({text:'Etwas essen in Basel',meaning:request([meal()]),catalog});if(result.status!==200)throw Error(JSON.stringify(result.diagnostics));if(i>0)samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);
 console.log(JSON.stringify({syntheticSpots:size,medianMs:Math.round(samples[2]),maximumMs:Math.round(samples[4]),returned:result.body.candidates.length,modelCallsPerRequest:result.calls,catalogReadsPerRequest:result.reads,modelAndDatabaseMocked:true,realApiCalls:0}));
}
