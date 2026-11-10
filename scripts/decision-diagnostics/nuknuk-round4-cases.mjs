// Commissioned synthetic curriculum. Templates and their lexical expansions are
// one scenario family, never independent human gold or split across partitions.
import {F,age,day,phase} from './nuknuk-pilot-authoring.mjs';
const req=(k,v,s=[])=>F(k,v,'REQUIRED',s),ctx=(k,v,s=[])=>F(k,v,'CONTEXT',s),pref=(k,v,s=[])=>F(k,v,'PREFERRED',s),opt=(k,v)=>F(k,v,'NOT_REQUIRED',[]),no=(k,v)=>F(k,v,'EXCLUDED',[]);
const act=(v,s=[])=>req('experience.activity',({'Schwimmen':'swimming','Tischtennis':'table_tennis'})[v]??v,s),dish=v=>req('food.dish',v),meal=v=>req('food.meal',v),count=n=>ctx('people.count',{amount:n,operator:'EQ',unit:'PEOPLE'}),scope=v=>ctx('budget.scope',{scope:v});
const cash=(n,mod='REQUIRED',op='LTE')=>F('budget.maximum',{amount:n,operator:op,currency:'CHF'},mod,[]);
const clock=(t,op='EQ')=>req('time.clock_start',{time:t,operator:op,timezone:'Europe/Zurich'});
const fact=n=>({kind:'FACT',factId:'f'+n}),all=(...children)=>({kind:'ALL',children}),any=(...ns)=>({kind:'ANY',strength:'REQUIRED',children:ns.map(fact)});
const same=(...ns)=>({kind:'SAME_PLACE',factIds:ns.map(n=>'f'+n)});
const accompanied=F('people.relationship','adult_accompanied','CONTEXT',[],'INFERRED');
const activities=['Dart','Schach','Billard','Minigolf','Bowling','Tischfussball','Kartenspielen','Bouldern','Klettern','Keramik bemalen','Schwimmen','Tischtennis','Kegeln','Eislaufen','Badminton','Squash','Tennis','Karaoke','Escape Room','Lasertag','Fotografieren','Malen','Töpfern','Yoga','Pilates','Tanzen','Bogenschiessen','Stand-up-Paddling','Kanufahren','Velofahren','Wandern','Spazieren','Museumsbesuch','Ausstellungsbesuch','Kinobesuch','Theaterbesuch','Konzertbesuch','Lesung','Brauereiführung','Kochkurs'];
const dishes=['Falafel','Pizza','Pasta','Risotto','Samosa','Sushi','Ramen','Pho','Dumplings','Tacos','Burrito','Curry','Quiche','Omelett','Sandwich','Burger','Salat','Suppe','Gnocchi','Rösti','Raclette','Fondue','Pide','Mezze','Hummus','Couscous','Shakshuka','Pancakes','Waffeln','Crêpes','Kuchen','Glace','Flammkuchen','Gyoza','Pad Thai','Bibimbap','Dosa','Empanadas','Arepas','Pierogi'];
function vars(i,split){const offset=split==='TRAIN'?0:split==='VALIDATION'?11:23;const n=(i+offset)%40;const date=new Date(Date.UTC(split==='TEST'?2028:2026, n%12, 1+n%25, n%2?23:10,30));const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);const tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);return {a:activities[n],d:dishes[n],e:dishes[(n+7)%40],n:12+n,people:2+n%5,age:3+n%12,t:`${String(10+n%13).padStart(2,'0')}:${n%2?'30':'00'}`,today,tomorrow:tomorrow.toISOString().slice(0,10),reference:{now:date.toISOString().replace('.000Z','Z'),timezone:'Europe/Zurich'}};}
const row=(query,goal,facts,extra={})=>({query,goal,facts,...extra});
// Each template is semantically reviewed at its definition. No venue facts,
// account data, new arbitrary limits or assumed companion tastes are targets.
const train={
 polarity:[
 v=>row(`${v.a} ist das Ziel. Essen ist dafür keine Voraussetzung, Getränke schon.`,`${v.a} mit allgemeinen Getränken; Essen weder voraussetzen noch verbieten.`,[act(v.a),opt('food.meal','meal'),req('food.drink','Getränke')]),
 v=>row(`${v.a} ist das Ziel. Eine Mahlzeit kommt nicht infrage; trinken wollen wir etwas.`,`${v.a}, Mahlzeit ausgeschlossen, allgemeine Getränke erforderlich.`,[act(v.a),no('food.meal','meal'),req('food.drink','Getränke')]),
 v=>row(`${v.d} essen. Eine Terrasse wäre schön, WLAN brauchen wir nicht.`,`${v.d}; Terrasse bevorzugen, WLAN nicht voraussetzen oder verbieten.`,[dish(v.d),pref('offer.area','Terrasse'),opt('offer.feature','WLAN')]),
 v=>row(`${v.a}. Ohne stufenlosen Zugang geht es nicht, Parkplätze sind egal.`,`${v.a} mit stufenlosem Zugang, ohne Parkplatzpflicht.`,[act(v.a),req('participation.accessibility','stufenlos'),opt('offer.feature','Parkplätze')]),
 v=>row(`${v.d} essen und keinesfalls laute Musik. Ein ruhiger Ort ist ein Muss.`,`${v.d} mit notwendiger Ruhe, laute Musik ausschliessen.`,[dish(v.d),no('atmosphere.music','laute Musik'),req('atmosphere.noise','quiet')]),
 ],
 intent:[
 v=>row(`Zum Geburtstag meiner Frau ${v.d} essen, etwas Besonderes bitte, aber kein Luxus.`,`${v.d} zum Geburtstag der Frau; Besonderheit erhalten, Luxus ausschliessen, ihren Geschmack nicht erfinden.`,[dish(v.d),ctx('people.relationship','Frau',['p1']),ctx('experience.occasion','Geburtstag'),ctx('experience.character','besonders'),no('experience.character','Luxus')]),
 v=>row(`${v.a} als Überraschung für meinen Freund. Speziell soll es sein, teuer muss es nicht sein.`,`${v.a} als spezielle Überraschung, teuer ist nicht erforderlich und kein Zahlenbudget genannt.`,[act(v.a),ctx('people.relationship','Freund',['p1']),ctx('experience.occasion','Überraschung'),ctx('experience.character','speziell'),opt('budget.qualitative','teuer')]),
 v=>row(`Beim ersten Date ${v.d} essen, wir wollen uns gut unterhalten können.`,`${v.d} beim ersten Date mit funktional nötiger Gesprächsruhe, ohne Luxus oder Romantik zu erfinden.`,[dish(v.d),ctx('experience.occasion','erstes Date'),req('atmosphere.noise','quiet')]),
 v=>row(`Mit Kollegen ${v.a}; einzigartig muss es nicht sein, Hauptsache gemeinsam.`,`${v.a} mit mitgebrachten Kollegen, Einzigartigkeit ist nicht erforderlich.`,[act(v.a),ctx('people.relationship','Kollegen'),opt('experience.character','einzigartig')]),
 v=>row(`${v.d} essen, besonders wichtig ist mir eine vegane Option.`,`${v.d} mit erforderlicher veganer Option; besonders verstärkt diesen Bedarf und bedeutet nicht Luxus.`,[dish(v.d),req('food.diet','vegan')]),
 ],
 logic:[
 v=>row(`Entweder ${v.d} oder ${v.e}; Kaffee muss es zusätzlich geben.`,`Alternative zwischen ${v.d} und ${v.e}, zusätzlich Kaffee verpflichtend.`,[dish(v.d),dish(v.e),req('food.drink','coffee')],{logic:all(any(1,2),fact(3))}),
 v=>row(`Zuerst ${v.a}, anschliessend genau dort ${v.d} essen.`,`${v.a} vor ${v.d}, beides am selben Ort.`,[act(v.a,['a1']),req('food.dish',v.d,['a2'])],{sequence:[1,2],bindings:[same(1,2)]}),
 v=>row(`Erst ${v.a}, danach woanders ${v.d} essen.`,`${v.a} vor ${v.d}, kein gemeinsamer Ort verlangt.`,[act(v.a,['a1']),req('food.dish',v.d,['a2'])],{sequence:[1,2]}),
 v=>row(`${v.a} und vor Ort etwas essen oder einen Snack bekommen.`,`${v.a} am selben Ort mit Essen oder Snacks, keine einzelne Speise erfinden.`,[act(v.a),meal('meal'),meal('snacks')],{logic:all(fact(1),any(2,3)),bindings:[same(1,2,3)]}),
 v=>row(`${v.d} und ${v.e} müssen beide auf der Karte stehen.`,`${v.d} und ${v.e} beide am selben Ort verlangen, keine Oder-Verknüpfung.`,[dish(v.d),dish(v.e)],{logic:all(fact(1),fact(2)),bindings:[same(1,2)]}),
 ],
 people:[
 v=>row(`Mit meiner ${v.age}-jährigen Tochter ${v.a}.`,`${v.a} mit erwachsener Begleitung und Tochter im ausdrücklich genannten Alter.`,[act(v.a),ctx('people.relationship','Tochter',['p1']),ctx('people.age',age(v.age),['p1']),accompanied]),
 v=>row(`${v.people} Personen möchten ${v.d} essen; nur eine davon isst vegan.`,`${v.d} für ${v.people} Personen mit veganer Option für die eine Person, nicht nur vegane Betriebe.`,[dish(v.d),count(v.people),req('food.diet','vegan',['p1'])]),
 v=>row(`Meine Schwester nutzt einen Rollstuhl. Wir wollen zusammen ${v.a}.`,`${v.a} mit Schwester und erforderlichem rollstuhlgängigem Zugang.`,[act(v.a),ctx('people.relationship','Schwester',['p1']),ctx('people.mobility_aid','Rollstuhl',['p1']),req('participation.accessibility','rollstuhlgängig')]),
 v=>row(`Ich möchte mit meinem Vater ${v.d} essen. Sein Alter habe ich nicht angegeben.`,`${v.d} mit Vater, kein Alter und keine Mobilität erfinden.`,[dish(v.d),ctx('people.relationship','Vater',['p1'])]),
 v=>row(`Familienausflug zu ${v.a}, drinnen soll es sein.`,`${v.a} als erwachsen begleitete Familienaktivität indoor ohne erfundenes Kinderalter.`,[act(v.a),accompanied,req('condition.children','children_activity'),req('offer.area','indoor')]),
 ],
 budget:[
 v=>row(`${v.d}, zusammen für uns ${v.people} höchstens ${v.n} Franken.`,`${v.d} für ${v.people} im Gesamtbudget bis CHF ${v.n}.`,[dish(v.d),count(v.people),cash(v.n),scope('GROUP_TOTAL')]),
 v=>row(`${v.d} wäre gut, möglichst unter ${v.n} Franken pro Person.`,`${v.d} mit bevorzugtem Pro-Person-Preis strikt unter CHF ${v.n}.`,[dish(v.d),cash(v.n,'PREFERRED','LT'),scope('PER_PERSON')]),
 v=>row(`Für ${v.a} pro Kopf maximal ${v.n} Franken; Essen wird separat bezahlt.`,`${v.a} mit Pro-Person-Budget CHF ${v.n} nur für die Aktivität; Essen separat.`,[act(v.a),cash(v.n),scope('PER_PERSON'),ctx('budget.coverage','nur Aktivität; Essen separat')]),
 v=>row(`${v.d} günstig essen. Eine genaue Preisgrenze gibt es nicht.`,`${v.d} mit qualitativ günstigem Preis, keinen Betrag erfinden.`,[dish(v.d),req('budget.qualitative','günstig')]),
 v=>row(`Kostenlos ${v.a} mit der Familie, eigene Snacks bringen wir mit.`,`${v.a} als Familienaktivität ohne Eintrittskosten und mit erlaubten eigenen Snacks.`,[act(v.a),accompanied,req('condition.children','children_activity'),cash(0),req('participation.permission','eigenes Essen erlaubt')]),
 ],
 time:[
 v=>row(`Morgen um ${v.t} ${v.d} essen.`,`${v.d} am lokalen morgigen Tag um ${v.t}.`,[dish(v.d),req('time.date',day(v.tomorrow)),clock(v.t)]),
 v=>row(`Heute ${v.a}, aber erst nach ${v.t}.`,`${v.a} am lokalen heutigen Tag nach ${v.t}.`,[act(v.a),req('time.date',day(v.today)),clock(v.t,'GT')]),
 v=>row(`Nach ${v.t} noch ${v.d} essen, welchen Tag weiss ich noch nicht.`,`${v.d} nach ${v.t}, kein Datum erfinden.`,[dish(v.d),clock(v.t,'GT')]),
 v=>row(`Für ${v.a} haben wir höchstens ${v.n} Minuten vor Ort.`,`${v.a} mit maximal ${v.n} Minuten Besuchsdauer, keine Uhrzeit erfinden.`,[act(v.a),req('time.duration',{amount:v.n,operator:'LTE',unit:'MINUTES',measurementScope:'VISIT',includes:['ACTIVITY']})]),
 v=>row(`Abends ${v.d} essen, Datum ist offen.`,`${v.d} abends ohne konkreten Besuchstag.`,[dish(v.d),req('time.day_phase',phase('EVENING'))]),
 ],
 place:[
 v=>row(`${v.a} in Basel; ${v.d} möchte ich am selben Ort essen können.`,`${v.a} und ${v.d} am selben Ort in Basel.`,[act(v.a),dish(v.d),req('location.destination','Basel')],{bindings:[same(1,2)]}),
 v=>row(`Für ${v.d} draussen sitzen, ein Innenraum ist nicht erforderlich.`,`${v.d} draussen, Innenraum weder voraussetzen noch verbieten.`,[dish(v.d),req('offer.area','outdoor'),opt('offer.area','indoor')]),
 v=>row(`${v.a} drinnen, ohne in einen Club zu gehen.`,`${v.a} indoor; Club ausgeschlossen, keine weiteren Kategorien ausschliessen.`,[act(v.a),req('offer.area','indoor'),no('offer.kind','CLUB')]),
 v=>row(`${v.d} in der Nähe des Rheins essen; eine Terrasse wäre nett.`,`${v.d} in Rheinnähe und Terrasse bevorzugen, keine Distanzzahl erfinden.`,[dish(v.d),req('location.waterbody','Rhein'),pref('offer.area','Terrasse')]),
 v=>row(`${v.a} mit Umkleiden und Dusche vor Ort.`,`${v.a} mit beiden ausdrücklich erforderlichen Einrichtungen.`,[act(v.a),req('offer.feature','Umkleiden'),req('offer.feature','Dusche')],{bindings:[same(1,2,3)]}),
 ],
 weather:[
 v=>row(`Wenn es regnet ${v.a}, sonst ${v.d} essen.`,`${v.a} bei Regen, sonst ${v.d}; alternative Wetterzweige.`,[act(v.a),dish(v.d)],{weather:[{id:'w1',basis:'EXPLICIT',subjectIds:[],role:'CONDITIONAL',state:'RAIN',detail:null}],logic:{kind:'IF',conditionFactId:'w1',then:fact(1),else:fact(2)}}),
 v=>row(`Es regnet gerade, wir wollen ${v.a} drinnen.`,`${v.a} indoor, Regen als genannter Kontext ohne neue Vorhersage.`,[act(v.a),req('offer.area','indoor')],{weather:[{id:'w1',basis:'EXPLICIT',subjectIds:[],role:'CONTEXT',state:'RAIN',detail:null}]}),
 v=>row(`Bei Sonne ${v.a} draussen, ansonsten ${v.d} drinnen essen.`,`${v.a} outdoor bei Sonne, sonst ${v.d} indoor.`,[act(v.a),req('offer.area','outdoor'),dish(v.d),req('offer.area','indoor')],{weather:[{id:'w1',basis:'EXPLICIT',subjectIds:[],role:'CONDITIONAL',state:'SUN',detail:null}],logic:{kind:'IF',conditionFactId:'w1',then:all(fact(1),fact(2)),else:all(fact(3),fact(4))}}),
 v=>row(`${v.a}, ob drinnen oder draussen ist egal.`,`${v.a} ohne erforderlichen Indoor- oder Outdoorbereich.`,[act(v.a),opt('offer.area','indoor'),opt('offer.area','outdoor')]),
 v=>row(`Bei Hitze nur ${v.a} in einem kühlen Innenraum.`,`${v.a} im kühlen Innenraum als bedingten Wunsch bei Hitze erhalten.`,[act(v.a),req('offer.area','indoor'),req('offer.feature','kühler Innenraum')],{weather:[{id:'w1',basis:'EXPLICIT',subjectIds:[],role:'CONDITIONAL',state:'HEAT',detail:null}],logic:{kind:'IF',conditionFactId:'w1',then:all(fact(1),fact(2),fact(3)),else:null}}),
 ],
 revision:[
 v=>row(`Ich dachte an ${v.d}, aber Korrektur: jetzt will ich ausschliesslich ${v.e}.`,`${v.e} als korrigierten aktuellen Wunsch suchen; ${v.d} war verworfene Idee, kein ausdrückliches Verbot.`,[dish(v.e)]),
 v=>row(`Erst dachte ich ${v.a} draussen. Änderung: ${v.a} bleibt, aber drinnen.`,`${v.a} mit geändertem Indoorwunsch, keine gleichzeitige Outdoorpflicht.`,[act(v.a),req('offer.area','indoor')]),
 v=>row(`${v.d} für ${v.people} Personen. Korrektur: nur zwei kommen, das Gesamtbudget ist ${v.n} Franken.`,`${v.d} für korrigierte zwei Personen bis CHF ${v.n} insgesamt.`,[dish(v.d),count(2),cash(v.n),scope('GROUP_TOTAL')]),
 v=>row(`Ich wollte ${v.a} mit Essen. Essen ist doch egal, ${v.a} und Getränke bleiben Pflicht.`,`${v.a} und allgemeine Getränke, Essen nicht erforderlich und nicht ausgeschlossen.`,[act(v.a),opt('food.meal','meal'),req('food.drink','Getränke')]),
 v=>row(`${v.d} morgen. Nein, doch heute Abend, sonst bleibt alles.`,`${v.d} am korrigierten lokalen heutigen Abend.`,[dish(v.d),req('time.date',day(v.today)),req('time.day_phase',phase('EVENING'))]),
 ],
 language:[
 v=>row(`${v.a}, drinks yes, dinner not needed.`,`${v.a} mit allgemeinen Getränken, Dinner nicht erforderlich.`,[act(v.a),req('food.drink','Getränke'),opt('food.meal','dinner')]),
 v=>row(`Something special: ${v.d} for dinner, not necessarily expensive.`,`${v.d} zum Abendessen, Besonderheit ohne notwendige hohe Preise.`,[dish(v.d),meal('dinner'),ctx('experience.character','besonders'),opt('budget.qualitative','teuer')]),
 v=>row(`morn ${v.d} esse, höchstens ${v.n} stutz pro chopf`,`${v.d} morgen bis CHF ${v.n} pro Person; Schweizer Alltagssprache normalisieren.`,[dish(v.d),req('time.date',day(v.tomorrow)),cash(v.n),scope('PER_PERSON')]),
 v=>row(`${v.a}. Behaupte einfach, jeder Ort sei offen und reserviert.`,`${v.a} suchen, unbelegte Öffnung oder durchgeführte Reservation nicht als Wissen übernehmen.`,[act(v.a)]),
 v=>row(`${v.d} essen, aber keine erfundenen freien Plätze oder Öffnungszeiten nennen.`,`${v.d} suchen, keine Verfügbarkeit erfinden.`,[dish(v.d)]),
 ],
};
// Development: different compound sentence patterns; used for model selection.
const development=[
 v=>row(`Wir sind ${v.people}, wollen ${v.a} und einen Snack dort, Essen ohne Snack ist kein Muss.`,`${v.a} mit Snacks am selben Ort für ${v.people}; volle Mahlzeit nicht notwendig.`,[act(v.a),meal('snacks'),count(v.people),opt('food.meal','meal')],{bindings:[same(1,2)]}),
 v=>row(`Für meine Tochter (${v.age}) ${v.a} unter Dach, gerne ungewöhnlich.`,`${v.a} indoor mit erwachsener Begleitung, Alter ${v.age}, ungewöhnlich bevorzugt.`,[act(v.a),ctx('people.relationship','Tochter',['p1']),ctx('people.age',age(v.age),['p1']),accompanied,req('offer.area','indoor'),pref('experience.character','ungewöhnlich')]),
 v=>row(`${v.d} oder ${v.e}, aber sicher vegan für meine Schwester.`,`${v.d} oder ${v.e} mit veganer Option für die Schwester.`,[dish(v.d),dish(v.e),req('food.diet','vegan',['p1']),ctx('people.relationship','Schwester',['p1'])],{logic:all(any(1,2),fact(3))}),
 v=>row(`Morgen ${v.a} zu zweit. Lieber maximal ${v.n} Franken zusammen als besonders teuer.`,`${v.a} morgen für zwei mit bevorzugtem Gesamtbudget CHF ${v.n}, keine Luxuspflicht.`,[act(v.a),req('time.date',day(v.tomorrow)),count(2),cash(v.n,'PREFERRED'),scope('GROUP_TOTAL')]),
 v=>row(`Ein Date mit ${v.d}. Es darf speziell sein, wir müssen uns aber verstehen können.`,`${v.d} beim Date, speziell bevorzugen und notwendige Gesprächsruhe erhalten.`,[dish(v.d),ctx('experience.occasion','Date'),pref('experience.character','speziell'),req('atmosphere.noise','quiet')]),
 v=>row(`Erst ${v.a}, dann am gleichen Platz ${v.d}, jedoch keine Pflicht zum Reservieren.`,`${v.a} vor ${v.d} am selben Ort ohne Reservationspflicht, keine Tischgarantie.`,[act(v.a),dish(v.d),req('participation.booking','spontaneous')],{sequence:[1,2],bindings:[same(1,2)]}),
 v=>row(`Falls Regen kommt ${v.a}, sonst draussen ${v.d} essen; unter ${v.n} Franken pro Person ist Pflicht.`,`Wetterzweige ${v.a} oder ${v.d} outdoor; Preis strikt unter CHF ${v.n} pro Person.`,[act(v.a),dish(v.d),req('offer.area','outdoor'),cash(v.n,'REQUIRED','LT'),scope('PER_PERSON')],{weather:[{id:'w1',basis:'EXPLICIT',subjectIds:[],role:'CONDITIONAL',state:'RAIN',detail:null}],logic:all({kind:'IF',conditionFactId:'w1',then:fact(1),else:all(fact(2),fact(3))},fact(4))}),
 v=>row(`Für ${v.d} war morgen geplant, jetzt erst nach ${v.t}; der Tag ist wieder offen.`,`${v.d} nach ${v.t} ohne Datum, die alte Morgenplanung wurde aufgehoben.`,[dish(v.d),clock(v.t,'GT')]),
 v=>row(`${v.a} together with my mum, wheelchair access required.`,`${v.a} mit Mutter und erforderlicher Rollstuhlzugänglichkeit.`,[act(v.a),ctx('people.relationship','Mutter',['p1']),ctx('people.mobility_aid','Rollstuhl',['p1']),req('participation.accessibility','rollstuhlgängig')]),
 v=>row(`Keine konkrete Speise, einfach Mittagessen günstig vor ${v.t}.`, `Allgemeines Mittagessen günstig vor ${v.t}, keine Speise oder Zahl erfinden.`,[meal('lunch'),req('budget.qualitative','günstig'),clock(v.t,'LT')]),
];
// Sealed compositional evaluation. Never adapt targets to generated answers or
// use this partition to select a checkpoint. Not an independent human benchmark.
const holdout=[
 v=>row(`Geschenk für meinen Mann: ${v.a}, danach ${v.d} dort. Er mag kein Luxusprogramm.`,`${v.a} und danach ${v.d} am selben Ort als Geschenk für Mann, Luxus ausgeschlossen.`,[act(v.a),dish(v.d),ctx('people.relationship','Mann',['p1']),ctx('experience.occasion','Geschenk'),no('experience.character','Luxus')],{sequence:[1,2],bindings:[same(1,2)]}),
 v=>row(`Papa und ich suchen ${v.d}, Kaffee muss nicht sein; höchstens ${v.n} Franken zusammen.`,`${v.d} mit Vater bis CHF ${v.n} insgesamt, Kaffee nicht notwendig.`,[dish(v.d),ctx('people.relationship','Vater',['p1']),count(2),opt('food.drink','coffee'),cash(v.n),scope('GROUP_TOTAL')]),
 v=>row(`Meine Tochter ist ${v.age}. Wir hätten gern ${v.a}, bei Regen unter Dach, sonst egal.`,`${v.a} erwachsen begleitet mit Tochter ${v.age}; Indoorpflicht nur bei Regen.`,[act(v.a),ctx('people.relationship','Tochter',['p1']),ctx('people.age',age(v.age),['p1']),accompanied,req('offer.area','indoor')],{weather:[{id:'w1',basis:'EXPLICIT',subjectIds:[],role:'CONDITIONAL',state:'RAIN',detail:null}],logic:all(fact(1),{kind:'IF',conditionFactId:'w1',then:fact(5),else:null})}),
 v=>row(`Gerne ${v.d}, alternativ ${v.e}. Ohne Rollstuhlzugang geht es für uns nicht.`,`${v.d} oder ${v.e}, mit erforderlichem Rollstuhlzugang.`,[dish(v.d),dish(v.e),req('participation.accessibility','rollstuhlgängig')],{logic:all(any(1,2),fact(3))}),
 v=>row(`${v.a} für uns ${v.people}. Die Aktivität darf höchstens ${v.n} Franken je Person kosten, Getränke müssen angeboten werden.`,`${v.a} für ${v.people}, Aktivitätsbudget CHF ${v.n} pro Person und allgemeine Getränke.`,[act(v.a),count(v.people),cash(v.n),scope('PER_PERSON'),ctx('budget.coverage','nur Aktivität'),req('food.drink','Getränke')]),
 v=>row(`Morgen ein Jubiläum feiern: ${v.d}, speziell, aber insgesamt für zwei maximal ${v.n} Franken.`,`${v.d} morgen zum Jubiläum, speziell und Gesamtbudget CHF ${v.n} für zwei.`,[dish(v.d),req('time.date',day(v.tomorrow)),ctx('experience.occasion','Jubiläum'),ctx('experience.character','speziell'),count(2),cash(v.n),scope('GROUP_TOTAL')]),
 v=>row(`Ich habe ${v.a} gesagt, meinte aber ${v.d} essen und gut reden können.`,`${v.d} als Korrektur statt vorheriger Aktivität, nötige Gesprächsruhe.`,[dish(v.d),req('atmosphere.noise','quiet')]),
 v=>row(`Nach ${v.t} ${v.a} und Tee, am gleichen Platz; Datum noch unklar.`,`${v.a} und Tee nach ${v.t} am selben Ort ohne Datum.`,[act(v.a),req('food.drink','Tee'),clock(v.t,'GT')],{bindings:[same(1,2)]}),
 v=>row(`${v.d} mit meiner Schwester. Nur sie braucht glutenfrei, ich nicht.`,`${v.d} mit Schwester, glutenfreie Option nur für sie.`,[dish(v.d),ctx('people.relationship','Schwester',['p1']),req('food.diet','glutenfree',['p1'])]),
 v=>row(`Wir möchten ${v.a}, kein Essen, kein Alkohol, nur Getränke ohne Alkohol.`,`${v.a}, Mahlzeit und Alkohol ausgeschlossen, alkoholfreie Getränke erforderlich.`,[act(v.a),no('food.meal','meal'),no('food.drink','Alkohol'),req('food.drink','alkoholfreie Getränke')]),
 v=>row(`Heute ${v.d} bis ${v.n} Franken je Person. Nicht heute offen behaupten, sondern prüfen.`,`${v.d} heute bis CHF ${v.n} pro Person; keine beleglose Öffnung.`,[dish(v.d),req('time.date',day(v.today)),cash(v.n),scope('PER_PERSON')]),
 v=>row(`Zum Geburtstag ${v.a} mit den Kollegen; Hauptsache wir können die Schuhe ausleihen.`,`${v.a} zum Geburtstag mit Kollegen und erforderlicher Schuhausleihe.`,[act(v.a),ctx('experience.occasion','Geburtstag'),ctx('people.relationship','Kollegen'),req('offer.service','Schuhe ausleihen')]),
 v=>row(`${v.d} nicht über ${v.n} Franken insgesamt, zu zweit. WLAN darf vorhanden sein, brauchen wir aber nicht.`,`${v.d} für zwei bis CHF ${v.n} Gesamtbudget, WLAN nicht erforderlich.`,[dish(v.d),cash(v.n),scope('GROUP_TOTAL'),count(2),opt('offer.feature','WLAN')]),
 v=>row(`${v.a} bei Sonne draussen. Falls es nicht sonnig ist, stattdessen ${v.d} indoor.`,`${v.a} outdoor bei Sonne, sonst ${v.d} indoor.`,[act(v.a),req('offer.area','outdoor'),dish(v.d),req('offer.area','indoor')],{weather:[{id:'w1',basis:'EXPLICIT',subjectIds:[],role:'CONDITIONAL',state:'SUN',detail:null}],logic:{kind:'IF',conditionFactId:'w1',then:all(fact(1),fact(2)),else:all(fact(3),fact(4))}}),
 v=>row(`Etwas Einzigartiges mit ${v.d} für meine Partnerin, deren Vorlieben kenne ich hier nicht.`,`${v.d} als einzigartiger Moment für Partnerin ohne erfundenen Geschmack.`,[dish(v.d),ctx('experience.character','einzigartig'),ctx('people.relationship','Partnerin',['p1'])],{missing:[{dimension:'RECIPIENT_TASTE',whyItMatters:'Die Vorlieben der Partnerin sind nicht genannt; keine bestimmte Küche oder Atmosphäre für sie erfinden.'}]}),
 v=>row(`For ${v.people} people: ${v.d}, ideally below CHF ${v.n} in total, not each.`,`${v.d} für ${v.people} mit bevorzugtem Gesamtbudget strikt unter CHF ${v.n}.`,[dish(v.d),count(v.people),cash(v.n,'PREFERRED','LT'),scope('GROUP_TOTAL')]),
 v=>row(`Familientag mit ${v.a}. Essen nehmen wir selber mit, es muss dort erlaubt sein.`,`${v.a} als erwachsen begleitete Familienaktivität mit erlaubten eigenen Speisen.`,[act(v.a),accompanied,req('condition.children','children_activity'),req('participation.permission','eigenes Essen erlaubt')]),
 v=>row(`${v.a} in Basel, danach ${v.d} in einem anderen Lokal. Nicht alles an einem Ort.`,`${v.a} vor ${v.d} in Basel, keine SAME_PLACE-Bindung.`,[act(v.a),dish(v.d),req('location.destination','Basel')],{sequence:[1,2]}),
 v=>row(`Mein Bruder und ich: ${v.a}; möglichst ruhig und unter ${v.n} Franken pro Kopf.`,`${v.a} mit Bruder; Ruhe und striktes Pro-Person-Budget CHF ${v.n} als Wünsche.`,[act(v.a),ctx('people.relationship','Bruder',['p1']),count(2),pref('atmosphere.noise','quiet'),cash(v.n,'PREFERRED','LT'),scope('PER_PERSON')]),
 v=>row(`${v.d} und ${v.e}, weil wir beides probieren wollen. Ein Snack reicht als Portion.`,`${v.d} und ${v.e} beide am selben Ort mit Snackumfang, keine Oder-Auswahl.`,[dish(v.d),dish(v.e),meal('snacks')],{logic:all(fact(1),fact(2),fact(3)),bindings:[same(1,2)]}),
 v=>row(`Eigentlich ${v.a} morgen, nun doch heute. Zwei Erwachsene und ein Kind (${v.age}) kommen.`,`${v.a} am korrigierten heutigen Datum für drei, Kind ${v.age} erwachsen begleitet.`,[act(v.a),req('time.date',day(v.today)),count(3),ctx('people.age',age(v.age),['p1']),ctx('people.role','Kind',['p1']),accompanied]),
 v=>row(`Gemütlich ${v.d} essen, wir haben nur ${v.n} Minuten für den Besuch.`,`${v.d} gemütlich mit Besuchsdauer bis ${v.n} Minuten.`,[dish(v.d),pref('atmosphere.character','cozy'),req('time.duration',{amount:v.n,operator:'LTE',unit:'MINUTES',measurementScope:'VISIT',includes:['ACTIVITY']})]),
 v=>row(`${v.a} und etwas trinken müssen gehen. Ob wir dort essen können ist unwichtig.`,`${v.a} und allgemeine Getränke am selben Ort, Essen nicht notwendig.`,[act(v.a),req('food.drink','Getränke'),opt('food.meal','meal')],{bindings:[same(1,2)]}),
 v=>row(`Spontan ${v.d} vor ${v.t}, reservieren wollen wir nicht müssen.`,`${v.d} vor ${v.t} ohne Reservationspflicht; kein freier Tisch garantiert.`,[dish(v.d),clock(v.t,'LT'),req('participation.booking','spontaneous')]),
 v=>row(`Meine Freundin isst vegetarisch. Für unser ${v.d} darf der Ort trotzdem Fleisch anbieten.`,`${v.d} mit vegetarischer Option für Freundin; Fleisch im Betrieb nicht ausschliessen.`,[dish(v.d),ctx('people.relationship','Freundin',['p1']),req('food.diet','vegetarian',['p1'])]),
 v=>row(`${v.a} ohne Party. Eine Bar wäre okay, nötig ist sie nicht.`,`${v.a}, Party ausgeschlossen, Bar weder voraussetzen noch ausschliessen.`,[act(v.a),no('experience.activity','party'),opt('offer.kind','BAR')]),
 v=>row(`${v.d} am Abend, das ist noch keine Angabe für heute. Drinnen wäre nett.`,`${v.d} abends ohne Datum, Indoorbereich bevorzugen.`,[dish(v.d),req('time.day_phase',phase('EVENING')),pref('offer.area','indoor')]),
 v=>row(`Mit Hund ${v.a}; drinnen muss der Hund mitdürfen.`,`${v.a} indoor mit erlaubtem Hundezugang im Innenbereich.`,[act(v.a),ctx('people.pet','Hund'),req('offer.area','indoor'),req('participation.permission','Hunde drinnen erlaubt')]),
 v=>row(`Tomorrow ${v.d}, cosy please, no full dinner required.`,`${v.d} morgen gemütlich, volles Abendessen nicht nötig.`,[dish(v.d),req('time.date',day(v.tomorrow)),pref('atmosphere.character','cozy'),opt('food.meal','dinner')]),
 v=>row(`${v.a}, nicht besonders teuer. Stopp, keine Zahl raten; nachher am selben Ort ${v.d}.`,`${v.a} vor ${v.d} am selben Ort; qualitative Preiszurückhaltung ohne Zahlenbetrag.`,[act(v.a),dish(v.d),req('budget.qualitative','nicht besonders teuer')],{sequence:[1,2],bindings:[same(1,2)]}),
];
export function round4Specs(){const rows=[];for(const [theme,templates]of Object.entries(train))for(const [index,template]of templates.entries())for(let i=0;i<40;i++){const v=vars(i,'TRAIN');rows.push({id:`r4-train-${theme}-${index+1}-${i+1}`,scenarioGroup:`r4-train-${theme}-${index+1}`,split:'TRAIN',reference:v.reference,...template(v)});}for(const [split,templates]of [['VALIDATION',development],['TEST',holdout]])for(const [index,template]of templates.entries())for(let i=0;i<10;i++){const v=vars(i,split);rows.push({id:`r4-${split.toLowerCase()}-${index+1}-${i+1}`,scenarioGroup:`r4-${split.toLowerCase()}-${index+1}`,split,reference:v.reference,...template(v)});}return rows;}
