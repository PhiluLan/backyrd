// Reviewed offline calendar authoring, never a parser for production requests.
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
const instants=['2026-12-31T22:30:00Z','2026-12-31T23:30:00Z','2028-02-28T09:00:00Z','2028-02-29T09:00:00Z','2026-03-28T23:30:00Z','2026-10-24T22:30:00Z','2026-11-11T23:30:00Z','2027-01-30T09:00:00Z','2027-04-29T08:00:00Z','2027-06-15T08:00:00Z','2027-08-31T08:00:00Z','2027-09-03T08:00:00Z'];
const offsets={
 'solid-care-6':0,'solid-code-switch-5':1,'solid-meal-times-1':1,'solid-meal-times-6':0,'solid-heat-and-cold-6':0,'solid-regional-targets-4':0,
 'solid-dates-1':2,'solid-dates-2':0,'solid-dates-5':1,'solid-dates-8':0,'solid-booking-access-5':0,'solid-self-correction-4':2,'solid-sport-effort-2':0,'solid-open-and-boundaries-1':0,
 'solid-dev-tradeoff-language-6':0,'solid-dev-distance-budget-5':0,'solid-dev-revisions-meaning-3':0,'solid-dev-uncertainty-safety-6':1,
 'solid-test-budget-and-calendar-1':2,'solid-test-budget-and-calendar-5':1,'solid-test-budget-and-calendar-8':0,'solid-test-weather-and-priority-5':0,'solid-test-conversation-repair-4':0,
};
const weekdays={'solid-meal-times-4':6,'solid-dates-3':0,'solid-test-budget-and-calendar-2':0};
export function localDay(now){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
export function plusDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function varyReference(spec){
 const reference={now:instants[parseInt(contentHash(spec.id).slice(0,8),16)%instants.length],timezone:'Europe/Zurich'};
 const today=localDay(reference.now),dayOfWeek=new Date(today+'T12:00:00Z').getUTCDay();
 let resolved=null;
 if(Object.hasOwn(offsets,spec.id))resolved=plusDays(today,offsets[spec.id]);
 else if(Object.hasOwn(weekdays,spec.id)){let delta=(weekdays[spec.id]-dayOfWeek+7)%7;if(spec.id==='solid-test-budget-and-calendar-2'&&delta===0)delta=7;resolved=plusDays(today,delta);}
 else if(spec.facts.some(f=>f.key==='time.date')&&spec.id!=='solid-dates-6')throw Error('unreviewed_calendar_rebase:'+spec.id);
 const facts=spec.facts.map(f=>f.key==='time.date'&&resolved?{...f,value:{...f.value,date:resolved}}:spec.id==='solid-dates-8'&&f.key==='time.clock_start'?{...f,value:{...f.value,time:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(reference.now))}}:f);
 return {...spec,reference,facts};
}
