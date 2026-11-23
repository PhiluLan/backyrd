// Commissioned synthetic targets. These are authored examples, not model answers.
// Related variants always share a split; known November-23 cases are development.
import {F, age, day, phase} from './nuknuk-pilot-authoring.mjs';
const R=(k,v,s=['a1'])=>F(k,v,'REQUIRED',s);
const C=(k,v,s=['a1'],b='EXPLICIT')=>F(k,v,'CONTEXT',s,b);
const P=(k,v,s=['a1'])=>F(k,v,'PREFERRED',s);
const X=(k,v,s=['a1'])=>F(k,v,'EXCLUDED',s);
const E=(id,kind,label)=>({id,kind,label,members:[]});
const A=E('a1','ACTIVITY','Besuch');
const party=(label)=>({...E('g1','GROUP',label),members:['g2']});
const fact=(id,f)=>({id,...f});
const all=(...ids)=>({kind:'ALL',children:ids.map(factId=>({kind:'FACT',factId}))});
const ref={now:'2026-11-23T09:00:00Z',timezone:'Europe/Zurich'};
const tomorrow=R('time.date',day('2026-11-24'));
export function productTrainingCases(){
 const rows=[];
 function add(group,query,facts,extra={}){
  const {entities=[A],logic,bindings,weatherConditions,clarification,split='TRAIN',...meta}=extra;
  rows.push({id:`product-v7-${group}-${rows.filter(r=>r.scenarioGroup===group).length+1}`,
   scenarioGroup:group,split,task:'COMPACT_SEARCH_V7',query,reference:ref,
   expected:{meaning:{entities,facts:facts.map((f,i)=>fact('f'+(i+1),f)),
    ...(logic?{logic}:{}),...(bindings?{bindings}:{}),...(weatherConditions?{weatherConditions}:{} )},
    ...(clarification?{clarification}:{})},...meta});
 }
 const familyContext=[C('people.relationship','adult_accompanied',['p1'],'INFERRED')];
 // Person/group, accompaniment/recipient and child/adult are distinct controls.
 for(const [relative,label] of [['Tochter','Tochter'],['Sohn','Sohn']])for(const years of [4,8,17,25]){
  add('known-02-person-roles',`Ich suche einen Spielplatz für mich und mein Kind. ${relative==='Sohn'?'Mein Sohn':'Meine Tochter'} ist ${years} Jahre alt.`,[
   R('experience.activity','playground'),C('people.relationship',label,['p1']),C('people.age',age(years),['p1']),
   ...(years<18?familyContext:[])],{entities:[A,E('p1','PERSON',label)],
   review:'Genannte einzelne Person und ihr Alter; erwachsene Begleitung macht keinen Kinderkontext.'});
 }
 for(const [when,start,end] of [['Am kommenden Wochenende','2026-11-28','2026-11-29'],['Nächstes Wochenende','2026-11-28','2026-11-29']])
  for(const [place,mode,value] of [['möglichst draussen','PREFERRED','outdoor'],['unbedingt draussen','REQUIRED','outdoor'],['lieber drinnen','PREFERRED','indoor'],['nur drinnen','REQUIRED','indoor']]){
   add('known-03-weekend-family',`${when} mit meinen Kindern etwas unternehmen, ${place}.`,[
    R('experience.activity','offene Entdeckung'),F('offer.area',value,mode,['a1']),
    C('people.relationship','children',['g1']),C('people.relationship','adult_accompanied',['g1'],'INFERRED'),
    F('condition.children','children_activity','REQUIRED',['a1'],'INFERRED'),
    R('time.date_start',{date:start,operator:'GTE',timezone:'Europe/Zurich'}),
    R('time.date_end',{date:end,operator:'LTE',timezone:'Europe/Zurich'})],
    {entities:[A,E('g1','GROUP','Kinder')],review:'Ganzes Wochenende erhalten; Zahl und Alter der Kinder unbekannt.'});
  }
 for(const [diet,value] of [['vegetarisch','vegetarian'],['vegan','vegan']])for(const companions of ['Freunde','Kollegen','Geschwister','Nachbarn']){
  add('known-06-personal-diet',`Ich möchte ${diet} essen. Meine ${companions} kommen mit und dürfen dort auch Fleisch bestellen.`,[
   R('food.meal','meal'),R('food.diet',value,['p1']),C('people.relationship',companions,['g1'])],
   {entities:[A,E('p1','PERSON','Anfragende Person'),E('g1','GROUP',companions)],
    review:'Persönliche Ernährung und Begleitung erhalten; Fleisch ist nicht standortweit verboten.'});
 }
 // Observed subgroup weakness: explicit totals, counts and membership stay separate.
 for(const [total,count] of [[5,2],[7,3]])for(const [key,value,label] of [
  ['food.diet','vegan','vegane Optionen'],['food.drink','alkoholfreie Getränke','alkoholfreie Getränke'],
 ])for(const wording of [0,1]){
  const query=wording?`Wir sind ${total}; ${count} von uns brauchen ${label}. ${key==='food.diet'?'Wir möchten essen.':'Wir möchten etwas trinken.'}`
   :`Wir gehen mit ${total} Personen ${key==='food.diet'?'essen':'etwas trinken'}; ${count} davon brauchen ${label}.`;
  add('known-numeric-subgroups',query,[R(key==='food.diet'?'food.meal':'food.drink',key==='food.diet'?'meal':'drinks'),
   C('people.count',{amount:total,operator:'EQ',unit:'PEOPLE'},['g1']),C('people.count',{amount:count,operator:'EQ',unit:'PEOPLE'},['g2']),R(key,value,['g2'])],
   {entities:[A,party('Gesamtgruppe'),E('g2','GROUP','Teilgruppe')],review:'Bekannte Teilgruppen-Regression: Gesamtzahl und Teilgruppenzahl erhalten, Bedingung nur an Teilgruppe, keine Addition.'});
 }
 for(const [limit,operator] of [['unter','LT'],['höchstens','LTE'],['mindestens','GTE'],['mehr als','GT']])for(const soft of [false,true]){
  add('known-08-money-polarity',`Gemütlich essen, ${soft?'möglichst ':''}${limit} 30 Franken pro Person.`,[
   R('food.meal','meal'),P('atmosphere.character','gemütlich'),
   F('budget.maximum',{amount:30,operator,currency:'CHF'},soft?'PREFERRED':'REQUIRED',['a1']),
   C('budget.scope',{scope:'PER_PERSON'})],{review:'Richtung, strikte Grenze, Präferenz und Einheit getrennt erhalten.'});
 }
 for(const [activity,value] of [['Klettern','climbing'],['Bowling','bowling'],['Bouldern','bouldering'],['Minigolf','Minigolf']])for(const amount of [22,35]){
  add('known-10-scoped-money',`${activity} und danach essen. Fürs ${activity} maximal ${amount} Franken pro Person; das Essen geht extra.`,[
   R('experience.activity',value),R('food.meal','meal',['a2']),R('budget.maximum',{amount,operator:'LTE',currency:'CHF'}),
   C('budget.scope',{scope:'PER_PERSON'})],{entities:[A,E('a2','ACTIVITY','Essen')],
   bindings:[{kind:'SEQUENCE',factIds:['f1','f2']}],review:'Geldgrenze nur an erster Aktivität; keine Zahlungsart oder gemeinsamer Ort erfunden.'});
 }
 for(const [activity,value,refused] of [['schwimmen gehen','swimming','Sauna'],['Bowling spielen','bowling','Billard'],['Minigolf spielen','Minigolf','Karaoke'],['bouldern','bouldering','Yoga']])for(const venueBan of [false,true]){
  add('known-11-exclusion-scope',`Morgen Nachmittag ${activity}, ${venueBan?'kein Betrieb mit':refused==='Sauna'?'keine':'kein'} ${refused}.`,[
   R('experience.activity',value),tomorrow,R('time.day_phase',phase('AFTERNOON')),
   X(venueBan?'offer.kind':'experience.activity',refused)],{review:'Eigene Teilnahme ausschliessen versus ausdrücklich gesamte Einrichtung verbieten.'});
 }
 for(const time of ['22:30','23:00','23:15','00:30'])for(const inclusive of [false,true]){
  add('known-12-late-warm-food',`Nach meiner Spätschicht ${inclusive?'ab':'nach'} ${time} Uhr noch warm essen. Der Besuchstag ist offen.`,[
   R('food.meal','meal'),R('food.dish','warm'),R('time.clock_start',{time,operator:inclusive?'GTE':'GT',timezone:'Europe/Zurich'})],
   {review:'Zeitgrenze ohne erfundenes Datum; warme Speise ist keine Küchenrichtung und kein Öffnungsbeleg.'});
 }
 for(const wet of ['ins Kino gehen','ein Museum besuchen'])for(const dry of ['im Park spazieren','durch einen Garten spazieren'])for(const wording of [0,1]){
  const query=wording?`Bei Regen ${wet}; wenn es nicht regnet, ${dry}.`:`Wenn es regnet, ${wet}; sonst ${dry}.`;
  add('known-13-conditional-park',query,[R('experience.activity',wet.includes('Kino')?'cinema':'Museum besuchen'),
   R('experience.activity','walking',['a2']),R('offer.kind',dry.includes('Park')?'PARK':'GARDEN',['a2'])],{
   entities:[A,E('a2','ACTIVITY','Spaziergang')],weatherConditions:[{id:'w1',role:'CONDITIONAL',state:'RAIN',basis:'EXPLICIT',subjectIds:[],detail:null}],
   logic:{kind:'IF',conditionFactId:'w1',then:{kind:'FACT',factId:'f1'},else:all('f2','f3')},
   review:'Park/Garten im trockenen Zweig; keine Behauptung über aktuelles Wetter.'});
 }
 for(const companion of ['em Kolleg','minere Schwöster'])for(const outside of [true,false])for(const disco of [true,false]){
  add('known-16-swiss-german',`Morn mit ${companion} öppis go trinke, am liebschte ${outside?'dusse':'dinne'}${disco?', aber kei Disco':''}.`,[
   R('food.drink','drinks'),tomorrow,C('people.relationship',companion.includes('Kolleg')?'Kollege':'Schwester',['p1']),
   P('offer.area',outside?'outdoor':'indoor'),...(disco?[X('offer.kind','Disco')]:[])],
   {entities:[A,E('p1','PERSON',companion.includes('Kolleg')?'Kollege':'Schwester')],review:'Morn ist morgen, dusse ist draussen; Getränke bleiben allgemein.'});
 }
 for(const [recipient,label] of [['meinen Freund','Freund'],['meine Freundin','Freundin'],['meinen Bruder','Bruder'],['meine Schwester','Schwester']])for(const variant of [0,1]){
  add('known-20-open-direction',variant?`Für ${recipient} suche ich ein besonderes Erlebnis. Die Richtung weiss ich noch nicht.`:`Etwas Besonderes für ${recipient}. Ich weiss noch nicht, was.`,[
   R('experience.activity','offene Entdeckung'),P('experience.character','besonders'),C('people.relationship',label,['p1'])],{
   entities:[A,E('p1','PERSON',label)],clarification:{question:'Was würde der Person am ehesten Freude machen?',dimension:'EXPERIENCE_DIRECTION',options:['Etwas erleben','Essen und geniessen','Kultur entdecken']},
   review:'Empfänger und Präferenz erhalten; hilfreiche Richtung erfragen, keinen Geburtstag oder persönlichen Geschmack erfinden.'});
 }
 for(let n=0;n<8;n++){
  const from=3+n,to=from+1,indoor=n%2===0,answer=`Doch lieber ${indoor?'drinnen':'draussen'}, und wir sind ${to}. Morgen bleibt.`;
  const previous={logic:null,bindings:[],extensions:[],uncertainties:[],weatherConditions:[],entities:[A,E('g1','GROUP','Unsere Gruppe')],facts:[fact('f1',R('food.meal','meal')),fact('f2',R('offer.area',indoor?'outdoor':'indoor')),
   fact('f3',C('people.count',{amount:from,operator:'EQ',unit:'PEOPLE'},['g1'])),fact('f4',tomorrow)]};
  rows.push({id:`product-v7-known-19-dialogue-${n+1}`,scenarioGroup:'known-19-dialogue',split:'TRAIN',task:'DIALOGAKTUALISIERUNG_V3',reference:ref,
   query:`Morgen ${indoor?'draussen':'drinnen'} essen, wir sind ${from}.`,previousMeaning:previous,turns:[{question:null,answer}],
   expected:{changes:[{id:'f2',quote:`Doch lieber ${indoor?'drinnen':'draussen'}`,fact:fact('f2',R('offer.area',indoor?'indoor':'outdoor'))},
    {id:'f3',quote:`wir sind ${to}`,fact:fact('f3',C('people.count',{amount:to,operator:'EQ',unit:'PEOPLE'},['g1']))}]},
   review:'Zwei belegte atomare Änderungen; Datum und Essen unverändert, keine alte oder doppelte ID neu hinzufügen.'});
 }
 // Retention is TRAIN-only, never an additional independent benchmark.
 for(const [theme,queries,key,value] of [
  ['retention-coffee',['Einen Kaffee trinken.','Ich möchte Kaffee.','Kaffee bitte.','Wo kann ich Kaffee trinken?'],'food.drink','coffee'],
  ['retention-meal',['Essen gehen.','Ich möchte etwas essen.','Eine Mahlzeit finden.','Wo gibt es etwas zu essen?'],'food.meal','meal'],
  ['retention-culture',['Eine Ausstellung besuchen.','Ich möchte eine Ausstellung anschauen.','Wo kann ich eine Ausstellung sehen?','Eine Ausstellung wäre mein Ziel.'],'experience.activity','Ausstellung besuchen'],
  ['retention-outdoor',['Draussen spazieren.','Einen Spaziergang im Freien machen.','Ich möchte draussen spazieren gehen.','Unter freiem Himmel spazieren.'],'experience.activity','walking'],
  ['retention-games',['Billard spielen.','Ich will Billard spielen.','Wo kann ich Billard spielen?','Ich suche Billard.'],'experience.activity','Billard'],
  ['retention-sport',['Schwimmen gehen.','Ich möchte schwimmen.','Wo kann ich schwimmen gehen?','Ich suche eine Möglichkeit zum Schwimmen.'],'experience.activity','swimming'],
 ])for(const query of queries)add(theme,query,[R(key,value),...(theme==='retention-outdoor'?[R('offer.area','outdoor')]:[])],{review:'Einfachen Suchzweck erhalten; keine unnötige Rückfrage oder zusätzliche Tätigkeit.'});
 // These evaluation families were observed in the November-23 run. Original split
 // labels remain reproducible, but this cohort is now regression evidence, not a fresh holdout.
 for(const split of ['VALIDATION','TEST']){
  const test=split==='TEST';
  const prefix=test?'holdout':'development';
  const specs=test?[
   ['accessible-exhibit','Mit meinem Vater eine Ausstellung ansehen, stufenlos erreichbar.',[R('experience.activity','Ausstellung besuchen'),R('participation.accessibility','stufenlos'),C('people.relationship','Vater',['p1'])],{entities:[A,E('p1','PERSON','Vater')]}],
   ['tea-before-train','Tee trinken und höchstens 18 Minuten bis zur Abfahrt nutzen.',[R('food.drink','tea'),R('time.duration',{amount:18,operator:'LTE',unit:'MINUTES',measurementScope:'AVAILABLE_TOTAL',includes:[]})]],
   ['menu-subgroup','Zu viert essen, zwei von uns brauchen vegane Optionen.',[R('food.meal','meal'),C('people.count',{amount:4,operator:'EQ',unit:'PEOPLE'},['g1']),C('people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},['g2']),R('food.diet','vegan',['g2'])],{entities:[A,party('Alle'),E('g2','GROUP','Vegane Teilgruppe')]}],
   ['not-quiet','Billard spielen, ruhig muss es nicht sein.',[R('experience.activity','Billard'),F('atmosphere.character','ruhig','NOT_REQUIRED',['a1'])]],
   ['gift-museum','Ein Museumsbesuch als Geschenk für meine 70-jährige Mutter.',[R('offer.kind','MUSEUM'),C('people.relationship','Mutter',['p1']),C('people.age',age(70),['p1']),C('people.role','recipient',['p1']),C('experience.occasion','Geschenk')],{entities:[A,E('p1','PERSON','Mutter')]}],
   ['only-monday','Am Montag, 30. November 2026, frühstücken.',[R('food.meal','breakfast'),R('time.date',day('2026-11-30'))]],
   ['prefer-small-bill','Ein Abendessen, bevorzugt unter 42 Euro pro Person.',[R('food.meal','dinner'),P('budget.maximum',{amount:42,operator:'LT',currency:'EUR'}),C('budget.scope',{scope:'PER_PERSON'})]],
   ['same-site-two','Erst Minigolf und danach dort Kaffee trinken.',[R('experience.activity','Minigolf'),R('food.drink','coffee',['a2'])],{entities:[A,E('a2','ACTIVITY','Kaffee')],bindings:[{kind:'SEQUENCE',factIds:['f1','f2']},{kind:'SAME_PLACE',factIds:['f1','f2']}]}],
   ['lunch-or-cinema','Mittagessen oder ins Kino, nicht beides.',[R('food.meal','lunch'),R('experience.activity','cinema',['a2'])],{entities:[A,E('a2','ACTIVITY','Kino')],logic:{kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'f1'},{kind:'FACT',factId:'f2'}]}}],
   ['hotel-no-spa','Ein Hotel ohne Spa im gesamten Betrieb.',[R('offer.kind','HOTEL'),X('offer.kind','Spa')]],
   ['unknown-price','Ein günstiges Mittagessen; einen konkreten Betrag weiss ich noch nicht.',[R('food.meal','lunch'),P('budget.qualitative','günstig')]],
   ['french-companion','Boire un café demain avec ma soeur.',[R('food.drink','coffee'),tomorrow,C('people.relationship','Schwester',['p1'])],{entities:[A,E('p1','PERSON','Schwester')]}],
  ]:[
   ['accessible-library','Mit meiner Tante eine Bibliothek besuchen, ohne Treppen erreichbar.',[R('offer.kind','LIBRARY'),R('participation.accessibility','stufenlos'),C('people.relationship','Tante',['p1'])],{entities:[A,E('p1','PERSON','Tante')]}],
   ['breakfast-timebox','Frühstücken, ich habe insgesamt höchstens 35 Minuten Zeit.',[R('food.meal','breakfast'),R('time.duration',{amount:35,operator:'LTE',unit:'MINUTES',measurementScope:'AVAILABLE_TOTAL',includes:[]})]],
   ['alcohol-subgroup','Wir sind sechs und möchten etwas trinken; drei brauchen alkoholfreie Getränke.',[R('food.drink','drinks'),C('people.count',{amount:6,operator:'EQ',unit:'PEOPLE'},['g1']),C('people.count',{amount:3,operator:'EQ',unit:'PEOPLE'},['g2']),R('food.drink','alkoholfreie Getränke',['g2'])],{entities:[A,party('Alle'),E('g2','GROUP','Alkoholfreie Teilgruppe')]}],
   ['reservation-optional','Sushi essen, eine Reservation ist nicht nötig.',[R('food.dish','Sushi'),F('participation.booking','spontaneous','NOT_REQUIRED',['a1'])]],
   ['adult-recipient','Für meinen 32-jährigen Bruder einen Keramikkurs als Geschenk finden.',[R('experience.activity','ceramics_course'),C('people.relationship','Bruder',['p1']),C('people.age',age(32),['p1']),C('people.role','recipient',['p1']),C('experience.occasion','Geschenk')],{entities:[A,E('p1','PERSON','Bruder')]}],
   ['explicit-evening','Am Freitag, 27. November 2026, zu Abend essen.',[R('food.meal','dinner'),R('time.date',day('2026-11-27'))]],
   ['group-budget','Zu zweit brunchen, zusammen höchstens 65 Franken.',[R('food.meal','brunch'),R('budget.maximum',{amount:65,operator:'LTE',currency:'CHF'}),C('budget.scope',{scope:'GROUP_TOTAL'}),C('people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},['g1'])],{entities:[A,E('g1','GROUP','Wir beide')]}],
   ['separate-sites','Erst ins Museum, danach essen.',[R('offer.kind','MUSEUM'),R('food.meal','meal',['a2'])],{entities:[A,E('a2','ACTIVITY','Essen')],bindings:[{kind:'SEQUENCE',factIds:['f1','f2']}]}],
   ['two-dishes','Pizza oder Pasta essen und dazu einen Kaffee.',[R('food.dish','Pizza'),R('food.dish','Pasta'),R('food.drink','coffee')],{logic:{kind:'ALL',children:[{kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'f1'},{kind:'FACT',factId:'f2'}]},{kind:'FACT',factId:'f3'}]}}],
   ['venue-no-gambling','Eine Bar ohne Spielautomaten im ganzen Betrieb.',[R('offer.kind','BAR'),X('offer.kind','Spielautomaten')]],
   ['no-price-invention','Etwas essen, nicht zwingend günstig.',[R('food.meal','meal'),F('budget.qualitative','günstig','NOT_REQUIRED',['a1'])]],
   ['english-companion','Have a coffee tomorrow with my uncle.',[R('food.drink','coffee'),tomorrow,C('people.relationship','Onkel',['p1'])],{entities:[A,E('p1','PERSON','Onkel')]}],
  ];
  for(const [group,query,facts,extra] of specs){
   // This wording is a known November-23 family (founder case 14). Preserve it
   // as training retention, never as fresh development or holdout evidence.
   const known=group==='two-dishes';
   add(known?'known-14-dish-alternative':`${prefix}-${group}`,query,facts,{...extra,split:known?'TRAIN':split,
    review:known?'Bekannte Familie 14: Pizza/Pasta-Alternative mit Kaffee. Nur Retention, kein neuer Prüfbeleg.':'Beobachtete Regressionsfamilie. Korrigiertes Soll, kein neuer Blindtest und kein Spotwissen.'});
  }
  const dialogues=test?[
   ['two-offer-budget','Bowling und danach essen. Fürs Bowling höchstens 28 Franken pro Person.',[
    R('experience.activity','bowling'),R('food.meal','meal',['a2']),R('budget.maximum',{amount:28,operator:'LTE',currency:'CHF'}),C('budget.scope',{scope:'PER_PERSON'})],
    'Fürs Bowling sind nun höchstens 36 Franken pro Person okay. Das Essen bleibt extra.',[[3,R('budget.maximum',{amount:36,operator:'LTE',currency:'CHF'}),'höchstens 36 Franken pro Person']],{entities:[A,E('a2','ACTIVITY','Essen')],bindings:[{kind:'SEQUENCE',factIds:['f1','f2']}]}],
   ['cancel-area','Ich möchte draussen Kaffee trinken.',[R('food.drink','coffee'),R('offer.area','outdoor')],
    'Ob drinnen oder draussen ist mir jetzt egal.',[[2,null,'Ob drinnen oder draussen ist mir jetzt egal']]],
   ['explicit-reschedule','Am 3. Dezember 2026 Mittagessen.',[R('food.meal','lunch'),R('time.date',day('2026-12-03'))],
    'Bitte stattdessen am 7. Dezember 2026.',[[2,R('time.date',day('2026-12-07')),'stattdessen am 7. Dezember 2026']]],
   ['replace-drink','Morgen Nachmittag Tee trinken.',[R('food.drink','tea'),tomorrow,R('time.day_phase',phase('AFTERNOON'))],
    'Doch Kaffee statt Tee. Morgen bleibt.',[[1,R('food.drink','coffee'),'Kaffee statt Tee']]],
  ]:[
   ['duration-change','Eine Ausstellung besuchen, höchstens 60 Minuten.',[R('experience.activity','Ausstellung besuchen'),R('time.duration',{amount:60,operator:'LTE',unit:'MINUTES',measurementScope:'UNSPECIFIED',includes:[]})],
    'Ich habe nur noch höchstens 40 Minuten.',[[2,R('time.duration',{amount:40,operator:'LTE',unit:'MINUTES',measurementScope:'AVAILABLE_TOTAL',includes:[]}),'nur noch höchstens 40 Minuten']]],
   ['cancel-preference','Essen gehen, gerne gemütlich.',[R('food.meal','meal'),P('atmosphere.character','gemütlich')],
    'Gemütlich ist mir doch egal.',[[2,null,'Gemütlich ist mir doch egal']]],
   ['change-fixed-day','Am 1. Dezember 2026 frühstücken.',[R('food.meal','breakfast'),R('time.date',day('2026-12-01'))],
    'Wir verschieben es auf den 2. Dezember 2026.',[[2,R('time.date',day('2026-12-02')),'auf den 2. Dezember 2026']]],
   ['swap-dish','Morgen Pasta essen.',[R('food.dish','Pasta'),tomorrow],
    'Lieber Pizza statt Pasta. Morgen bleibt.',[[1,R('food.dish','Pizza'),'Pizza statt Pasta']]],
  ];
  for(const [group,query,facts,answer,changes,extra] of dialogues){
   const previous={entities:[A],facts:facts.map((f,i)=>fact('f'+(i+1),f)),logic:null,bindings:[],extensions:[],uncertainties:[],weatherConditions:[],...extra};
   rows.push({id:`product-v7-${prefix}-dialogue-${group}`,scenarioGroup:`${prefix}-dialogue-${group}`,split,task:'DIALOGAKTUALISIERUNG_V3',reference:ref,
    query,previousMeaning:previous,turns:[{question:null,answer}],expected:{changes:changes.map(([id,replacement,quote])=>({id:'f'+id,quote,fact:replacement?fact('f'+id,replacement):null}))},
    review:'Beobachtete Dialog-Regressionsfamilie: explizite Änderung oder Aufhebung, Rest erhalten. Kein Modelloutput als Ziel.'});
  }
 }
 return rows;
}
