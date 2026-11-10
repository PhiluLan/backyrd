#!/usr/bin/env node
// Deterministic, commissioned synthetic contrast pairs; no model self-approval.
import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const [source,output]=process.argv.slice(2);if(!output)throw Error('preference_arguments_required');
const dataset=JSON.parse(await readFile(resolve(source,'reviewed-backyrd.json')));
const train=dataset.cases.filter(r=>r.split==='TRAIN');const exported=(await readFile(resolve(source,'train.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
function spaced(value){if(Array.isArray(value))return '['+value.map(spaced).join(', ')+']';if(value!==null&&typeof value==='object')return '{'+Object.entries(value).map(([k,v])=>JSON.stringify(k)+': '+spaced(v)).join(', ')+'}';return JSON.stringify(value);}
function choice(node){if(!node)return null;if(node.kind==='ANY')return node;for(const c of node.children??[]){const found=choice(c);if(found)return found;}return null;}
const counts=new Map(),pairs=[];
for(const [index,row]of train.entries()){if(!row.id.startsWith('r4-train-'))continue;const theme=row.id.split('-')[2];if((counts.get(theme)??0)>=40)continue;
const original=JSON.parse(exported[index].messages[2].content);const rejected=structuredClone(original);const facts=rejected.meaning.facts;let reason;
const unused=facts.find(f=>f.modality==='NOT_REQUIRED'),drinks=facts.find(f=>f.key==='food.drink'&&f.value.text==='Getränke'),scope=facts.find(f=>f.key==='budget.scope');
if(unused){unused.modality='EXCLUDED';reason='Nichtbedarf fälschlich zum Verbot gemacht.';}
else if(drinks){drinks.value.text='coffee';reason='Allgemeine Getränke unzulässig auf Kaffee verengt.';}
else if(choice(rejected.meaning.logic)){const node=choice(rejected.meaning.logic);node.kind='ALL';delete node.strength;reason='Alternative fälschlich als gleichzeitige Pflicht aller Optionen dargestellt.';}
else if(scope){scope.value.scope=scope.value.scope==='GROUP_TOTAL'?'PER_PERSON':'GROUP_TOTAL';reason='Gesamtbudget und Preis pro Person vertauscht.';}
else if(rejected.meaning.bindings.some(b=>b.kind==='SEQUENCE')){rejected.meaning.bindings=rejected.meaning.bindings.filter(b=>b.kind!=='SEQUENCE');reason='Ausdrückliche Reihenfolge verloren.';}
else{const desired=facts.find(f=>f.modality==='REQUIRED');if(!desired)continue;desired.modality='EXCLUDED';reason='Ausdrücklich Gewünschtes fälschlich ausgeschlossen.';}
pairs.push({id:row.id,prompt:exported[index].messages.slice(0,2),chosen:[exported[index].messages[2]],rejected:[{role:'assistant',content:spaced(rejected)}],reason,sourceSplit:'TRAIN',reviewer:'commissioned-assistant-template-review',independentHumanGold:false});counts.set(theme,(counts.get(theme)??0)+1);}
if(pairs.length!==400||counts.size!==10)throw Error('preference_balance_invalid');await writeFile(resolve(output),pairs.map(JSON.stringify).join('\n')+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({pairs:pairs.length,themes:Object.fromEntries(counts),testUsed:false,trainingExecuted:false}));
