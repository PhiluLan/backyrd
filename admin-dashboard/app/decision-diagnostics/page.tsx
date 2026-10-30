'use client';

import {useState} from 'react';
import {supabase} from '@/lib/supabaseClient';

type Run={index:number;status:'running'|'complete'|'error';payload?:Record<string,unknown>;error?:string};
function diagnostic(value:unknown,index:number):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||!('contractVersion'in value)||value.contractVersion!=='backyrd.admin-decision-diagnostic@1.0'||!('caseIndex'in value)||value.caseIndex!==index||!('meaning'in value)||!('search'in value)||!('response'in value))throw Error('Die Antwort ist unvollständig. Der Test gilt nicht als abgeschlossen.');
 return value as Record<string,unknown>;
}
export default function DecisionDiagnostics(){
 const [runs,setRuns]=useState<Run[]>([]);const [busy,setBusy]=useState(false);
 async function start(){
  if(busy)return;setBusy(true);setRuns([]);
  for(let index=0;index<10;index++){
   setRuns(previous=>[...previous,{index,status:'running'}]);
   try{
    const {data,error}=await supabase.functions.invoke<unknown>('decision-admin-diagnostic',{body:{caseIndex:index},headers:{'x-region':'eu-central-2'}});
    if(error)throw Error('Der Server konnte diesen Test nicht abschliessen. Der Lauf wurde angehalten; bereits fertige Ergebnisse bleiben erhalten.');
    const payload=diagnostic(data,index);
    setRuns(previous=>previous.map(r=>r.index===index?{index,status:'complete',payload}:r));
   }catch(error){setRuns(previous=>previous.map(r=>r.index===index?{index,status:'error',error:error instanceof Error?error.message:'Der Test ist fehlgeschlagen.'}:r));break;}
  }
  setBusy(false);
 }
 function download(){
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),runs},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='backyrd-decision-diagnostic.json';link.click();URL.revokeObjectURL(url);
 }
 const completed=runs.filter(r=>r.status==='complete').length;
 return <div style={{maxWidth:980,margin:'32px auto',padding:24}}>
  <h1>Decision prüfen</h1>
  <p>Zehn festgelegte Basel-Anfragen. Hier siehst du, was die KI versteht, was die Suche prüft und welche Orte sie auswählt.</p>
  <p>Die Tests verändern keine Orte und werden nicht als deine persönlichen Interessen gelernt. Der Zeitbezug bleibt für den Vergleich auf dem 30. Oktober 2026. Dieser begrenzte Zugang läuft am 2. November aus.</p>
  <button disabled={busy||runs.length>0} onClick={()=>void start()} style={{minHeight:48,padding:'12px 24px',background:'#ff448c',color:'#111',borderRadius:18,fontWeight:700}}>{busy?'Tests laufen …':'Zehn Tests starten'}</button>
  {runs.length>0&&<button disabled={busy} onClick={download} style={{minHeight:48,marginLeft:16}}>Ergebnisse herunterladen</button>}
  <p role="status" aria-live="polite">{runs.length>0?`${completed} von 10 Tests abgeschlossen${busy?' – bitte diese Seite geöffnet lassen.':'.'}`:''}</p>
  {runs.map(run=><section key={run.index} style={{borderTop:'1px solid #403743',padding:'20px 0'}}><h2>Test {run.index+1}: {run.status==='running'?'Läuft …':run.status==='complete'?'Abgeschlossen':'Fehlgeschlagen'}</h2>{run.error&&<p role="alert">{run.error}</p>}{run.payload&&<><p>{String(run.payload.query)}</p><details><summary>KI-Auftrag, Suchprüfung und Ergebnisse ansehen</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(run.payload,null,2)}</pre></details></>}</section>)}
 </div>;
}
