// Commissioned synthetic contrasts, authored targets, never generated answers.
// Freeze this cohort before training; these are not independent human gold.
import {F,day,age} from './nuknuk-pilot-authoring.mjs';
const req=(key,value,subjects=[])=>F(key,value,'REQUIRED',subjects);
const ctx=(key,value,subjects=[])=>F(key,value,'CONTEXT',subjects);
const opt=(key,value)=>F(key,value,'NOT_REQUIRED',[]);
const excluded=(key,value)=>F(key,value,'EXCLUDED',[]);
const pref=(key,value)=>F(key,value,'PREFERRED',[]);
const refs=['2026-11-09T12:00:00Z','2026-11-15T23:30:00Z','2026-12-31T23:30:00Z','2027-03-27T23:30:00Z'].map(now=>({now,timezone:'Europe/Zurich'}));
const train=[];
function add(theme,query,goal,facts,extra={}){
 train.push({id:`r3-train-${theme}-${train.filter(r=>r.scenarioGroup===`r3-train-${theme}`).length+1}`,scenarioGroup:`r3-train-${theme}`,split:'TRAIN',query,goal,facts,reference:refs[train.length%refs.length],...extra});
}
for(const activity of ['Dart spielen','Kegeln','Bowlen','Boule spielen']){
 for(const [clause,mode] of [['Abendessen brauche ich nicht','NOT_REQUIRED'],['Abendessen ist ausgeschlossen','EXCLUDED'],['Abendessen muss vor Ort möglich sein','REQUIRED'],['Abendessen wäre schön','PREFERRED']]){
  add('polarity',`${activity}; ${clause}. Getränke müssen vorhanden sein.`,`${activity} mit Getränken finden; Abendessen ist ${mode==='NOT_REQUIRED'?'nicht erforderlich':mode==='EXCLUDED'?'ausgeschlossen':mode==='REQUIRED'?'vor Ort erforderlich':'bevorzugt'}.`,[req('experience.activity',activity),req('food.drink','Getränke'),F('food.meal','dinner',mode,[])],mode==='REQUIRED'?{bindings:[{kind:'SAME_PLACE',factIds:['f1','f3']}]}:{});
 }
}
for(const activity of ['Schach spielen','Karaoke','Kegeln','Minigolf'])for(const [drink,value] of [['Getränke','Getränke'],['Bier','beer'],['Kaffee','coffee'],['alkoholfreie Getränke','alkoholfreie Getränke']]){
 add('specificity',`${activity}, dazu ${drink}.`,`${activity} mit ${drink} suchen, ohne eine andere Getränkeart zu erfinden.`,[req('experience.activity',activity),req('food.drink',value)]);
}
const links=[
 ['ein Museum besuchen','zu Mittag essen','experience.activity','Museum besuchen','food.meal','lunch'],
 ['Keramik bemalen','Kaffee trinken','experience.activity','Keramik bemalen','food.drink','coffee'],
 ['bouldern','zu Abend essen','experience.activity','bouldering','food.meal','dinner'],
 ['brunchen','Minigolf spielen','food.meal','brunch','experience.activity','Minigolf'],
];
for(const [a,b,ak,av,bk,bv] of links)for(const mode of ['AND','OR','OTHER','SAME']){
 const query=mode==='AND'?`${a} und ${b}.`:mode==='OR'?`${a} oder ${b}.`:mode==='OTHER'?`Zuerst ${a}, danach ${b} an einem anderen Ort.`:`Zuerst ${a}, danach dort ${b}.`;
 const extra=mode==='OR'?{logic:{kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'f1'},{kind:'FACT',factId:'f2'}]}}:mode==='AND'?{}:{sequence:[1,2],...(mode==='SAME'?{bindings:[{kind:'SAME_PLACE',factIds:['f1','f2']}]}:{})};
 add('relations',query,mode==='OR'?`${a} oder ${b} als Alternativen erhalten.`:mode==='AND'?`${a} und ${b}, ohne erfundene Reihenfolge.`:`${a} vor ${b}; ${mode==='OTHER'?'verschiedene Orte':'derselbe Ort'}.`,[req(ak,av,['a1']),req(bk,bv,['a2'])],extra);
}
for(const dish of ['Samosa','Falafel','Burrito','Pinsa'])for(const mode of ['LT','LTE','NO_AMOUNT','GROUP']){
 const condition=mode==='LT'?'unter 19 Franken':mode==='LTE'?'höchstens 19 Franken':mode==='NO_AMOUNT'?'nicht unbedingt teuer':'möglichst unter 19 Franken für uns beide zusammen';
 const facts=[req('food.dish',dish)];
 if(mode==='NO_AMOUNT')facts.push(opt('experience.character','teuer'));
 else facts.push(F('budget.maximum',{amount:19,operator:mode==='LTE'?'LTE':'LT',currency:'CHF'},mode==='GROUP'?'PREFERRED':'REQUIRED',[]));
 if(mode==='GROUP')facts.push(ctx('budget.scope',{scope:'GROUP_TOTAL'}),ctx('people.count',{amount:2,operator:'EQ',unit:'PEOPLE'}));
 add('budget',`${dish} essen, ${condition}.`,`${dish} mit der genannten Preisbedingung suchen: ${condition}; keinen weiteren Betrag ergänzen.`,facts);
}
for(const [phrase,label] of [['meinem Bruder','Bruder'],['meiner Schwester','Schwester'],['meiner Freundin','Freundin'],['meinem Onkel','Onkel']])for(const mode of ['PLAIN','VEGAN','VEGETARIAN','AGE']){
 const detail=mode==='PLAIN'?'':mode==='AGE'?' Diese Begleitperson ist 46 Jahre alt.':` Für diese Begleitperson ist eine ${mode==='VEGAN'?'vegane':'vegetarische'} Essensoption nötig.`;
 const facts=[req('food.meal','meal'),ctx('people.relationship',label,['p1'])];
 if(mode==='AGE')facts.push(ctx('people.age',age(46),['p1']));
 if(mode==='VEGAN'||mode==='VEGETARIAN')facts.push(req('food.diet',mode==='VEGAN'?'vegan':'vegetarian',['p1']));
 add('companions',`Mit ${phrase} essen gehen.${detail}`,`Mit ${phrase} essen gehen; diese Begleitung erhalten, keine vom Anbieter gestellte Person verlangen.${detail}`,facts,{labels:{p1:label}});
}
function calendar(reference){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:reference.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(reference.now));
 const part=n=>parts.find(p=>p.type===n).value;
 const today=`${part('year')}-${part('month')}-${part('day')}`;
 const tomorrow=new Date(`${today}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 return {today,tomorrow:tomorrow.toISOString().slice(0,10)};
}
for(const reference of refs)for(const mode of ['OPEN','TODAY','TOMORROW','CLOCK']){
 const {today,tomorrow}=calendar(reference);
 const query=mode==='OPEN'?'Pho essen, der Besuchstag ist noch offen.':mode==='CLOCK'?'Nach 23:15 Pho essen, der Tag ist offen.':`${mode==='TODAY'?'Heute':'Morgen'} Pho essen.`;
 const facts=[req('food.dish','Pho')];
 if(mode==='TODAY'||mode==='TOMORROW')facts.push(req('time.date',day(mode==='TODAY'?today:tomorrow)));
 if(mode==='CLOCK')facts.push(req('time.clock_start',{time:'23:15',operator:'GT',timezone:'Europe/Zurich'}));
 add('reference',query,mode==='OPEN'?'Pho ohne erfundenen Besuchstag suchen.':mode==='CLOCK'?'Pho nach 23:15 ohne festgelegten Besuchstag suchen.':`Pho am ${mode==='TODAY'?today:tomorrow} suchen.`,facts,{reference});
}
export const round3Train=Object.freeze(train);
const branch=(a,b)=>({kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:`f${a}`},{kind:'FACT',factId:`f${b}`}]});
const clock=(time,operator='GT')=>req('time.clock_start',{time,operator,timezone:'Europe/Zurich'});
const specs=(split,rows)=>rows.map((row,i)=>({id:`r3-${split==='TEST'?'fresh':'dev'}-${i+1}`,scenarioGroup:`r3-${split==='TEST'?'fresh':'dev'}-${i+1}`,split,query:row[0],goal:row[1],facts:row[2],reference:refs[i%refs.length],...row[3]}));
export const round3Development=Object.freeze(specs('VALIDATION',[
 ['Ich möchte Billard spielen, einen Kaffee brauche ich nicht.','Billard suchen; Kaffee nicht verlangen und nicht verbieten.',[req('experience.activity','Billard'),opt('food.drink','coffee')]],
 ['Bowling, aber keinesfalls Bier trinken.','Bowling suchen und Bier ausschliessen.',[req('experience.activity','bowling'),excluded('food.drink','beer')]],
 ['Getränke und Tischfussball, die Getränkeart ist mir egal.','Tischfussball mit allgemeinen Getränken, ohne eine Sorte zu erzwingen.',[req('food.drink','Getränke'),req('experience.activity','Tischfussball')]],
 ['Tacos essen, gerne ein ungewöhnlicher Ort.','Tacos suchen, ungewöhnlichen Ort als Wunsch erhalten; keinen Besuchstag erfinden.',[req('food.dish','Tacos'),pref('experience.character','ungewöhnlich')]],
 ['Erst fotografieren, danach an einem anderen Ort frühstücken.','Fotografieren vor Frühstück, ohne gemeinsamen Ort zu verlangen.',[req('experience.activity','fotografieren',['a1']),req('food.meal','breakfast',['a2'])],{sequence:[1,2]}],
 ['Ein Omelett oder ein Müsli, dazu zwingend Tee.','Omelett oder Müsli als Alternative, Tee zusätzlich erforderlich.',[req('food.dish','Omelett'),req('food.dish','Müsli'),req('food.drink','Tee')],{logic:branch(1,2)}],
 ['Hummus für unter 14 Franken.','Hummus strikt unter CHF 14 suchen.',[req('food.dish','Hummus'),req('budget.maximum',{amount:14,operator:'LT',currency:'CHF'})]],
 ['Mit meinem Kollegen eine Ausstellung besuchen.','Ausstellungsbesuch mit verbindlich genannter Begleitung, keine Anbieter-Partnerleistung.',[req('experience.activity','Ausstellung besuchen'),ctx('people.relationship','Kollege',['p1'])],{labels:{p1:'Kollege'}}],
 ['Nach 21:20 noch etwas essen, Tag noch unklar.','Essen nach 21:20 ohne festgelegtes Datum suchen.',[req('food.meal','meal'),clock('21:20')]],
 ['Morgen einen Cappuccino trinken.','Cappuccino am lokalen morgigen Kalendertag suchen.',[req('food.drink','Cappuccino'),req('time.date',day('2026-11-17'))]],
 ['Mit meinem Vater essen gehen; nur er braucht eine glutenfreie Option.','Essen mit Vater und glutenfreier Option nur für ihn.',[req('food.meal','meal'),ctx('people.relationship','Vater',['p1']),req('food.diet','glutenfree',['p1'])],{labels:{p1:'Vater'}}],
 ['Erst Billard, danach dort einen Espresso.','Billard vor Espresso am selben Ort suchen.',[req('experience.activity','Billard',['a1']),req('food.drink','Espresso',['a2'])],{sequence:[1,2],bindings:[{kind:'SAME_PLACE',factIds:['f1','f2']}]}],
]));
export const round3FreshTest=Object.freeze(specs('TEST',[
 ['Zum Tischtennis mit meiner Schwester, Essen ist nicht erforderlich, Getränke schon.','Tischtennis mit Schwester und Getränken, Essen nicht voraussetzen oder verbieten.',[req('experience.activity','table_tennis'),ctx('people.relationship','Schwester',['p1']),opt('food.meal','meal'),req('food.drink','Getränke')],{labels:{p1:'Schwester'}}],
 ['Kartenspielen mit meinem Onkel, bitte kein Alkohol.','Kartenspielen mit Onkel, Alkohol ausschliessen.',[req('experience.activity','Kartenspielen'),ctx('people.relationship','Onkel',['p1']),excluded('food.drink','Alkohol')],{labels:{p1:'Onkel'}}],
 ['Nach einem Fotokurs will ich etwas trinken, die Sorte ist egal.','Nach Fotokurs allgemeine Getränke suchen, keine Sorte erfinden.',[req('food.drink','Getränke')]],
 ['Dim Sum mit meiner Cousine, zur Feier ihrer Beförderung etwas Besonderes, nicht automatisch teuer.','Dim Sum mit Cousine zum Beförderungsanlass suchen; Besonderheit erhalten, keinen Luxus oder Betrag erfinden.',[req('food.dish','Dim Sum'),ctx('people.relationship','Cousine',['p1']),ctx('experience.occasion','Beförderung'),ctx('experience.character','besonders'),opt('experience.character','teuer')],{labels:{p1:'Cousine'}}],
 ['Zuerst einen Kletterkurs, danach woanders eine Suppe essen.','Kletterkurs vor Suppe an einer weiteren Station, kein SAME_PLACE.',[req('experience.activity','Kletterkurs',['a1']),req('food.dish','Suppe',['a2'])],{sequence:[1,2]}],
 ['Quiche oder Pasta, dazu muss es Mineralwasser geben.','Quiche oder Pasta als Alternative mit zusätzlicher Mineralwasserpflicht.',[req('food.dish','Quiche'),req('food.dish','Pasta'),req('food.drink','Mineralwasser')],{logic:branch(1,2)}],
 ['Ein Sandwich unter 11 Franken, keine Sitzplätze nötig.','Sandwich strikt unter CHF 11, Sitzplätze weder verlangen noch verbieten.',[req('food.dish','Sandwich'),req('budget.maximum',{amount:11,operator:'LT',currency:'CHF'}),opt('offer.feature','Sitzplätze')]],
 ['Ein Gericht für uns beide zusammen höchstens 32 Franken.','Gericht mit Gesamtbudget für zwei höchstens CHF 32.',[req('food.meal','meal'),req('budget.maximum',{amount:32,operator:'LTE',currency:'CHF'}),ctx('budget.scope',{scope:'GROUP_TOTAL'}),ctx('people.count',{amount:2,operator:'EQ',unit:'PEOPLE'})]],
 ['Nach meinem Training um 20:10 möchte ich Gnocchi essen; den Tag weiss ich noch nicht.','Gnocchi nach 20:10 ohne erfundenes Datum suchen.',[req('food.dish','Gnocchi'),clock('20:10')]],
 ['Morgen mit meiner Nachbarin einen Tee trinken.','Mit Nachbarin Tee am lokalen morgigen Kalendertag suchen.',[req('food.drink','Tee'),ctx('people.relationship','Nachbarin',['p1']),req('time.date',day('2026-11-17'))],{labels:{p1:'Nachbarin'}}],
 ['Mit meinem Bruder frühstücken, nur er braucht eine vegetarische Option.','Frühstück mit vegetarischer Option für Bruder, nicht für alle erzwingen.',[req('food.meal','breakfast'),ctx('people.relationship','Bruder',['p1']),req('food.diet','vegetarian',['p1'])],{labels:{p1:'Bruder'}}],
 ['Zuerst Kerzen gestalten, danach dort einen Kakao trinken.','Kerzengestalten vor Kakao am selben Ort, gültige Reihenfolgereferenzen.',[req('experience.activity','Kerzen gestalten',['a1']),req('food.drink','Kakao',['a2'])],{sequence:[1,2],bindings:[{kind:'SAME_PLACE',factIds:['f1','f2']}]}],
]));
