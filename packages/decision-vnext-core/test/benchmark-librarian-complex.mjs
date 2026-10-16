/** Synthetic, CPU-only regression benchmark. No model/network/production data. */
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {exercise} from './librarian-active-route-fixtures.mjs';
import {request,fact,profile,offer,area,prop,price,binding,date,evening} from './librarian-matching-fixtures.mjs';
const areas=Array.from({length:6},(_,i)=>area('room'+i,[prop('offer.feature','Schliessfächer'),prop('atmosphere.character','lebendig'),prop('participation.accessibility','Zugang mit Stufen')]));
const offers=Array.from({length:10},(_,i)=>offer('offer'+i,i%2?'MOVEMENT_PLAY':'BOULDERING',areas.map(a=>a.id),[prop('experience.activity','Klettern'),prop('experience.activity','Bewegungsspiel'),prop('participation.minimum_age',i%2?1:14),prop('sport.equipment','Sportkleidung'),prop('offer.feature','Schliessfächer')],[price(8,{includes:'Eintritt'})]));
const shape=profile(offers,areas,'SPORT');
const facts=[fact('climb','experience.activity','Klettern'),fact('move','experience.activity','Bewegungsspiel','REQUIRED',['a2']),fact('inside','offer.area','drinnen'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])];
export {shape,facts};
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) for(const size of [10,100,300]){
 const catalog=Array.from({length:size},(_,i)=>{const b=binding(i+1,shape);b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['CLIMBING_GYM'];return b;});
 const start=performance.now(),cpu=process.cpuUsage();
 const result=await exercise({text:'Synthetischer Kinder-Sportwunsch',meaning:request(facts),catalog});
 const used=process.cpuUsage(cpu);
 console.log(JSON.stringify({size,wallMs:Math.round(performance.now()-start),cpuMs:Math.round((used.user+used.system)/1000),status:result.status,diagnostics:result.diagnostics,modelAndDatabaseMocked:true}));
}
