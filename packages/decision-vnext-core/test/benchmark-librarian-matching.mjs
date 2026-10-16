/** Synthetic CPU benchmark. No model, network or production data. Build first. */
import { performance } from 'node:perf_hooks';
import { request, meal, fact, budget, profile, offer, area, prop, binding, search } from './librarian-matching-fixtures.mjs';
const q=request([meal(),fact('romance','atmosphere.character','romantisch'),fact('water','location.waterbody','Rhein'),...budget(40)]);
const p=profile([offer('dinner','DINNER',['terrace'])],[area('terrace',[prop('atmosphere.character','romantisch'),prop('location.waterbody','Rhein')])]);
for(const size of [10,100,1000]){
 const catalog=Array.from({length:size},(_,i)=>binding(i+1,p));
 search(q,catalog); // Warmup is not measured.
 const samples=[];let result;
 for(let i=0;i<5;i++){const start=performance.now();result=search(q,catalog);samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);
 console.log(JSON.stringify({syntheticSpots:size,activeFacts:q.facts.length,repetitions:5,medianMs:Math.round(samples[2]),maximumMs:Math.round(samples[4]),returned:result.ranked.length,status:result.ranked[0].status,modelCalls:0}));
}
