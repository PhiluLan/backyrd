// Targeted, assistant-authored contrasts. Preparation only; no GPU authorization.
import {F, makeInterpretation} from './nuknuk-pilot-authoring.mjs';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';

const required=(key,value)=>F(key,value,'REQUIRED',[]);
const preferred=(key,value)=>F(key,value,'PREFERRED',[]);
const context=(key,value)=>F(key,value,'CONTEXT',[]);
const optional=(key,value)=>F(key,value,'NOT_REQUIRED',[]);
const excluded=(key,value)=>F(key,value,'EXCLUDED',[]);
const meal=()=>required('food.meal','dinner');
const activity=()=>required('experience.activity','Bouldern');
const fact=n=>({kind:'FACT',factId:`f${n}`});
const same=(...ns)=>({kind:'SAME_PLACE',factIds:ns.map(n=>`f${n}`)});
const amount=(n,modality='REQUIRED')=>F('budget.maximum',{amount:n,operator:'LTE',currency:'CHF'},modality,[]);
const scope=s=>context('budget.scope',{scope:s});
const row=(query,goal,facts,extra={})=>({query,goal,facts,...extra});

// Each row is written as a distinct contrast, not expanded over lexical lists.
// No exposed round-4 VALIDATION/TEST query or answer is copied into TRAIN.
const families={
 area:[
  row('Zum Abendessen lieber drinnen, laut darf es sein.','Innenbereich bevorzugen; Lautstärke ist kein Ausschluss.',[meal(),preferred('offer.area','indoor')]),
  row('Abendessen draussen und gemütlich, das wäre schön.','Outdoorbereich und Gemütlichkeit separat bevorzugen.',[meal(),preferred('offer.area','outdoor'),preferred('atmosphere.character','cozy')]),
  row('Abendessen unbedingt drinnen; auf Ruhe lege ich keinen Wert.','Indoorpflicht; Ruhe weder voraussetzen noch ausschliessen.',[meal(),required('offer.area','indoor'),optional('atmosphere.noise','quiet')]),
  row('Abendessen muss ruhig sein, ob unter freiem Himmel oder im Haus ist egal.','Ruhe verpflichtend; kein Bereich erforderlich.',[meal(),required('atmosphere.noise','quiet'),optional('offer.area','indoor'),optional('offer.area','outdoor')]),
  row('Abendessen, bei dem wir uns gut unterhalten können; es muss nicht still sein.','Gesprächsmöglichkeit verlangen, keine Stillepflicht.',[meal(),required('atmosphere.conversation','conversation_possible'),optional('atmosphere.noise','quiet')]),
  row('Abendessen gemütlich, auch wenn Musik läuft.','Gemütlichkeit bevorzugen; Musik nicht verbieten.',[meal(),preferred('atmosphere.character','cozy')]),
  row('Dinner indoors would be nice; a quiet room is not necessary.','Innenbereich bevorzugen und Ruhe nicht verlangen.',[meal(),preferred('offer.area','indoor'),optional('atmosphere.noise','quiet')]),
  row('Bouldern lieber drinnen. Essen, Gemütlichkeit und Ruhe sind keine Voraussetzungen.','Nur Indoorwunsch; keine neuen Atmosphären- oder Essenspflichten.',[activity(),preferred('offer.area','indoor'),optional('food.meal','meal'),optional('atmosphere.character','cozy'),optional('atmosphere.noise','quiet')]),
 ],
 food_permission:[
  row('Bouldern und meine mitgebrachte Brotbox dort essen dürfen.','Bouldern mit erlaubtem eigenem Essen, kein Lieferdienst.',[activity(),required('participation.permission','eigenes Essen erlaubt')]),
  row('Bouldern und eine Mahlzeit vor Ort kaufen können.','Bouldern mit verfügbarem Essen, keine Mitbringpflicht.',[activity(),required('food.meal','meal')],{bindings:[same(1,2)]}),
  row('Zum Abendessen wollen wir Essen bestellen und liefern lassen.','Abendessen mit ausdrücklich verlangtem Lieferdienst.',[meal(),required('food.delivery','Lieferdienst')]),
  row('Bouldern ohne Verpflegungsangebot ist okay, wir brauchen nur die Erlaubnis für eigene Sandwiches.','Eigenes Essen erlauben; angebotene Mahlzeiten nicht verlangen.',[activity(),required('participation.permission','eigenes Essen erlaubt'),optional('food.meal','meal')]),
  row('Bouldern; eigene Getränke müssen erlaubt sein, Essen bringen wir keines mit.','Nur Mitbringen von Getränken verlangen, keine Speisenerlaubnis ableiten.',[activity(),required('participation.permission','eigene Getränke erlaubt')]),
  row('Bouldern, Mitbringen von Speisen ist uns egal; Snacks kaufen möchten wir dort.','Snacks vor Ort, keine Pflicht für eigene Speisen.',[activity(),required('food.meal','snacks'),optional('participation.permission','eigenes Essen erlaubt')],{bindings:[same(1,2)]}),
  row('Bouldern where we can eat our packed lunch, not order delivery.','Mitgebrachtes Essen erlauben, Lieferdienst ausschliessen.',[activity(),required('participation.permission','eigenes Essen erlaubt'),excluded('food.delivery','Lieferdienst')]),
  row('Bouldern, danach essen wir unsere Brotbox woanders.','Bouldern suchen; keine Erlaubnis für die Brotbox am Aktivitätsort verlangen.',[activity()]),
 ],
 dog:[
  row('Bouldern und meinen Hund mitnehmen dürfen, keine Tieraktivität gesucht.','Hundezugang verlangen, keine Tieraktivität.',[activity(),context('people.pet','Hund'),required('participation.permission','Hunde erlaubt'),excluded('experience.activity','animals')]),
  row('Tiere beobachten, meinen eigenen Hund lasse ich zu Hause.','Tiererlebnis suchen, keinen Hundezugang verlangen.',[required('experience.activity','animals')]),
  row('Abendessen im Innenraum, unser Hund muss dabei sein dürfen.','Indoor und Hundezugang für diesen Innenbereich verlangen.',[meal(),required('offer.area','indoor'),context('people.pet','Hund'),required('participation.permission','Hunde drinnen erlaubt')]),
  row('Abendessen auf der Terrasse mit erlaubtem Hund; drinnen muss er nicht zugelassen sein.','Hundezugang nur für Terrasse verlangen.',[meal(),required('offer.area','Terrasse'),context('people.pet','Hund'),required('participation.permission','Hunde auf der Terrasse erlaubt')]),
  row('Ein Tiererlebnis und mein Hund darf mit; beides ist Pflicht.','Tieraktivität und Hundezugang getrennt erhalten.',[required('experience.activity','animals'),context('people.pet','Hund'),required('participation.permission','Hunde erlaubt')]),
  row('Dinner with my dog welcome; animal watching is not necessary.','Hundezugang zum Essen, Tierbeobachtung nicht voraussetzen.',[meal(),context('people.pet','Hund'),required('participation.permission','Hunde erlaubt'),optional('experience.activity','animals')]),
  row('Abendessen, unser Hund kommt diesmal nicht mit.','Keine Hundezugangspflicht aus nicht teilnehmendem Hund ableiten.',[meal()]),
  row('Bouldern, Hunde dürfen vorhanden sein, ich bringe aber keinen mit.','Bouldern ohne Hundezugangspflicht und ohne Hundeverbot.',[activity()]),
 ],
 booking:[
  row('Abendessen ohne vorher reservieren zu müssen.','Keine Reservationspflicht; keinen freien Tisch behaupten.',[meal(),required('participation.booking','spontaneous')]),
  row('Abendessen, eine nötige Reservation wäre für uns in Ordnung.','Keine Reservationsfreiheit voraussetzen.',[meal(),optional('participation.booking','spontaneous')]),
  row('Abendessen nur in einem Betrieb, der eine Reservation verlangt.','Ausdrücklich Reservationspflicht suchen.',[meal(),required('participation.booking','Reservation erforderlich')]),
  row('Zum Abendessen wäre es mir lieber, nicht reservieren zu müssen.','Reservationsfreiheit bevorzugen statt zur Pflicht machen.',[meal(),preferred('participation.booking','spontaneous')]),
  row('Dinner, no mandatory reservation, but do not promise an available table.','Keine Reservationspflicht, keine erfundene Verfügbarkeitsgarantie.',[meal(),required('participation.booking','spontaneous')]),
  row('Bouldern ohne Buchungspflicht, einen Eintritt dürfen wir bezahlen.','Keine Buchungspflicht; keine Kostenfreiheit erfinden.',[activity(),required('participation.booking','spontaneous')]),
  row('Abendessen: spontan ist nicht nötig, reservieren können wir vorher.','Spontaneität nicht voraussetzen; Reservation nicht erzwingen.',[meal(),optional('participation.booking','spontaneous')]),
  row('Abendessen ohne Tischreservierung; das heisst nicht, dass wir allein dort sein müssen.','Reservationsfreiheit, keine private Feier oder Exklusivnutzung.',[meal(),required('participation.booking','spontaneous')]),
 ],
 occasion:[
  row('Zum Hochzeitstag Abendessen, wir suchen keine organisierte Jubiläumsveranstaltung.','Hochzeitstag als Anlass, Abendessen als Angebot.',[meal(),context('experience.occasion','Hochzeitstag')]),
  row('Eine organisierte Geburtstagsveranstaltung besuchen, nicht nur normal essen.','Ausdrücklich eine Veranstaltung als Aktivität suchen.',[required('experience.activity','Geburtstagsveranstaltung')]),
  row('Abendessen zum Geburtstag meines Mannes, lieber vertraut als luxuriös.','Geburtstag und Beziehung erhalten; keinen Luxus erfinden.',[meal(),context('experience.occasion','Geburtstag'),F('people.relationship','Mann','CONTEXT',['p1']),preferred('experience.character','vertraut')]),
  row('Abendessen etwas Besonderes, aber nicht zwingend teuer.','Besonderheit als Wunsch, hohe Preise nicht verlangen.',[meal(),preferred('experience.character','besonders'),optional('budget.qualitative','teuer')]),
  row('Besonders wichtig beim Abendessen ist die vegane Option.','Besonders verstärkt vegane Pflicht, kein besonderes Event.',[meal(),required('food.diet','vegan')]),
  row('Einzigartig muss das Abendessen nicht sein, Hauptsache ruhig.','Einzigartigkeit nicht nötig; Ruhe verpflichtend.',[meal(),optional('experience.character','einzigartig'),required('atmosphere.noise','quiet')]),
  row('Birthday dinner for my partner; I have not told you their favourite cuisine.','Anlass und Beziehung, keine Küche oder Vorliebe erfinden.',[meal(),context('experience.occasion','Geburtstag'),F('people.relationship','Partner','CONTEXT',['p1'])]),
  row('Abendessen ganz normal, wir feiern heute keinen besonderen Anlass.','Normales Abendessen ohne erfundenen Feierauftrag.',[meal()]),
 ],
 composition:[
  row('Zuerst Bouldern, danach Pizza essen, beides im gleichen Betrieb.','Reihenfolge und gemeinsamer Ort.',[activity(),required('food.dish','Pizza')],{sequence:[1,2],bindings:[same(1,2)]}),
  row('Pizza essen und Bouldern im gleichen Betrieb, Reihenfolge ist egal.','Beides am selben Ort, keine Reihenfolge erfinden.',[required('food.dish','Pizza'),activity()],{bindings:[same(1,2)]}),
  row('Entweder Bouldern oder Pizza essen, eines reicht.','Echte Alternative statt UND.',[activity(),required('food.dish','Pizza')],{choice:[1,2]}),
  row('Bouldern und Pizza essen, keines ersetzt das andere.','Beide Wünsche verpflichtend.',[activity(),required('food.dish','Pizza')],{logic:{kind:'ALL',children:[fact(1),fact(2)]}}),
  row('Bouldern, anschliessend Pizza in einem anderen Betrieb.','Reihenfolge ohne SAME_PLACE.',[activity(),required('food.dish','Pizza')],{sequence:[1,2]}),
  row('Bouldern mit Snacks oder Abendessen direkt vor Ort.','Aktivität mit alternativen Speisenangeboten am selben Ort.',[activity(),required('food.meal','snacks'),meal()],{logic:{kind:'ALL',children:[fact(1),{kind:'ANY',strength:'REQUIRED',children:[fact(2),fact(3)]}]},bindings:[same(1,2,3)]}),
  row('Erst Pizza essen, dann Bouldern im selben Haus.','Umgekehrte Reihenfolge erhalten.',[required('food.dish','Pizza'),activity()],{sequence:[1,2],bindings:[same(1,2)]}),
  row('Bouldern muss sein. Ob wir dort essen können ist keine Voraussetzung.','Aktivität verpflichtend, Essen optional.',[activity(),optional('food.meal','meal')]),
 ],
 budget:[
  row('Abendessen für drei, maximal 90 Franken insgesamt.','Drei Personen und Gesamtbudget.',[meal(),context('people.count',{amount:3,operator:'EQ',unit:'PEOPLE'}),amount(90),scope('GROUP_TOTAL')]),
  row('Abendessen für drei, maximal 90 Franken je Person.','Drei Personen, Pro-Person-Grenze statt Gesamtpreis.',[meal(),context('people.count',{amount:3,operator:'EQ',unit:'PEOPLE'}),amount(90),scope('PER_PERSON')]),
  row('Abendessen, möglichst höchstens 40 Franken pro Kopf.','Bevorzugte Grenze, keine harte Pflicht.',[meal(),amount(40,'PREFERRED'),scope('PER_PERSON')]),
  row('Abendessen, höchstens 40 Franken pro Kopf ist zwingend.','Harte Pro-Person-Grenze.',[meal(),amount(40),scope('PER_PERSON')]),
  row('Bouldern bis 25 Franken pro Person für die Aktivität; Getränke zusätzlich.','Budget umfasst nur Aktivität, keine Getränkepflicht.',[activity(),amount(25),scope('PER_PERSON'),context('budget.coverage','nur Aktivität; Getränke separat')]),
  row('Abendessen nicht teuer; einen Betrag habe ich nicht festgelegt.','Qualitativer Preiswunsch ohne erfundene Zahl.',[meal(),required('budget.qualitative','nicht teuer')]),
  row('Dinner for two, CHF 70 total is a preference, not a strict ceiling.','Bevorzugtes Gesamtbudget für zwei.',[meal(),context('people.count',{amount:2,operator:'EQ',unit:'PEOPLE'}),amount(70,'PREFERRED'),scope('GROUP_TOTAL')]),
  row('Abendessen für meinen Vater und mich, insgesamt höchstens 80 Franken.','Zwei Personen ohne erfundenes Alter und Gesamtbudget.',[meal(),F('people.relationship','Vater','CONTEXT',['p1']),context('people.count',{amount:2,operator:'EQ',unit:'PEOPLE'}),amount(80),scope('GROUP_TOTAL')]),
 ],
 revision:[
  row('Pizza war die erste Idee; stattdessen wollen wir jetzt Bouldern.','Nur aktueller Aktivitätswunsch, Pizza nicht verbieten.',[activity()]),
  row('Bouldern drinnen war geplant, jetzt doch draussen.','Geänderten Bereich verwenden.',[activity(),required('offer.area','outdoor')]),
  row('Bouldern lieber ruhig? Nein, Ruhe ist egal, drinnen bleibt ein Wunsch.','Widerrufene Ruhe nicht als Pflicht behalten.',[activity(),preferred('offer.area','indoor'),optional('atmosphere.noise','quiet')]),
  row('Abendessen: wir reservieren doch nicht, es darf keine Pflicht dazu geben.','Aktuelle Reservationsfreiheit erhalten.',[meal(),required('participation.booking','spontaneous')]),
  row('Erst hiess es Abendessen für vier, nun kommen nur zwei.','Korrigierte Anzahl statt beider Gruppengrössen.',[meal(),context('people.count',{amount:2,operator:'EQ',unit:'PEOPLE'})]),
  row('Bouldern und Essen war der Plan. Jetzt nur Bouldern, Essen ist egal.','Aktivität erhalten und Essenspflicht zurücknehmen.',[activity(),optional('food.meal','meal')]),
  row('Dinner outdoors was the idea; actually indoors is mandatory now.','Indoorpflicht ersetzt alten Outdoorwunsch.',[meal(),required('offer.area','indoor')]),
  row('Abendessen mit Hund war geplant. Er bleibt zu Hause, aber drinnen wollen wir sitzen.','Indoorpflicht ohne widerrufene Hundezugangspflicht.',[meal(),required('offer.area','indoor')]),
 ],
};

export function round5Specs(){
 return Object.entries(families).flatMap(([theme,rows])=>rows.map((spec,index)=>({
  ...spec,id:`r5-train-${theme}-${index+1}`,scenarioGroup:`r5-train-${theme}`,split:'TRAIN',
 })));
}

// Corrections apply to a NEW child corpus only. Frozen round-4 files are inputs.
// Exposed validation/test rows remain historical evidence, never promoted.
export function cleanRound5Training(source){
 const corrections=[],excluded=[],cases=[];
 for(const original of source.cases){
  if(original.split!=='TRAIN'){excluded.push({id:original.id,reason:'EXPOSED_NON_TRAIN_PARTITION'});continue;}
  const row=structuredClone(original);
  if(/^r4-train-intent-3-/.test(row.id)){
   const f=row.content.target.meaning.facts.find(f=>f.key==='atmosphere.noise');
   if(!f||f.value.text!=='quiet')throw Error(`round5_correction_parent_mismatch:${row.id}`);
   f.key='atmosphere.conversation';f.value={text:'conversation_possible'};
   row.content.target.moment.goal.statement=row.content.target.moment.goal.statement.replace('funktional nötiger Gesprächsruhe','funktional nötiger Gesprächsmöglichkeit');
   corrections.push({id:row.id,reason:'CONVERSATION_IS_NOT_QUIET',before:original.contentHash});
   // These old reviews cannot approve changed content. The bundle attributes
   // a new commissioned review to the corrected child record.
   row.reviews=[];row.contentHash=contentHash(row.content);
  }
  cases.push(row);
 }
 const groups=new Set(cases.map(row=>row.scenarioGroup));
 return {dataset:{...source,cases,splitPlan:source.splitPlan.filter(g=>groups.has(g.scenarioGroup))},corrections,excluded};
}

export function validateRound5Specs(){
 const specs=round5Specs(),queries=new Set();
 for(const spec of specs){
  if(queries.has(spec.query))throw Error('round5_duplicate_query');
  queries.add(spec.query);makeInterpretation(spec,spec);
 }
 return specs;
}
