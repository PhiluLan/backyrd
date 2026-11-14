// Commissioned synthetic contrasts. Frozen before training/inference; no claim
// of independent human gold. Related contrast rows share one TRAIN group.
import {F,day,phase,age} from './nuknuk-pilot-authoring.mjs';
const req=(k,v,s=[])=>F(k,v,'REQUIRED',s);
const ctx=(k,v,s=[])=>F(k,v,'CONTEXT',s);
const opt=(k,v)=>F(k,v,'NOT_REQUIRED',[]);
const no=(k,v)=>F(k,v,'EXCLUDED',[]);
const pref=(k,v)=>F(k,v,'PREFERRED',[]);
const meal=v=>req('food.meal',v);
const drink=v=>req('food.drink',v);
const act=(v,s=[])=>req('experience.activity',v,s);
const cash=(n,op='LTE',mod='REQUIRED')=>F('budget.maximum',{amount:n,operator:op,currency:'CHF'},mod,[]);
const scope=v=>ctx('budget.scope',{scope:v});
const clock=(v,op)=>req('time.clock_start',{time:v,operator:op,timezone:'Europe/Zurich'});
const date=v=>req('time.date',day(v));
const special=v=>ctx('experience.character',v);
const relation=v=>ctx('people.relationship',v);
const either=(a,b)=>({kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'f'+a},{kind:'FACT',factId:'f'+b}]});
const weather=(state='RAIN',role='CONDITIONAL')=>[{id:'w1',role,state,basis:'EXPLICIT',subjectIds:[],detail:null}];
const branch=(a,b)=>({kind:'IF',conditionFactId:'w1',then:{kind:'FACT',factId:'f'+a},else:{kind:'FACT',factId:'f'+b}});
// Each row is [literal query, reviewed semantic goal, facts, optional structure].
const themes={
 polarity:[
 ['Kaffee trinken, WLAN brauche ich nicht.','Kaffee finden; WLAN ist nicht erforderlich.',[drink('coffee'),opt('offer.feature','WLAN')]],
 ['Kaffee trinken, WLAN ist mir wichtig.','Kaffee mit erforderlichem WLAN finden.',[drink('coffee'),req('offer.feature','WLAN')]],
 ['Kaffee trinken, WLAN wäre nett.','Kaffee finden und WLAN bevorzugen.',[drink('coffee'),pref('offer.feature','WLAN')]],
 ['Minigolf spielen; Verpflegung ist mir egal.','Minigolf finden, unabhängig von Verpflegung.',[act('Minigolf'),opt('food.meal','meal')]],
 ['Minigolf spielen; Verpflegung muss vor Ort möglich sein.','Minigolf mit Essen vor Ort finden.',[act('Minigolf'),meal('meal')],{bindings:[{kind:'SAME_PLACE',factIds:['f1','f2']}]}],
 ['Minigolf spielen; bitte keinen Alkohol trinken.','Minigolf suchen, ohne Alkoholkonsum.',[act('Minigolf'),no('food.drink','Alkohol')]],
 ['Zum Billard ist eine Bar nicht erforderlich.','Billard finden; eine Bar ist keine Voraussetzung.',[act('Billard'),opt('offer.kind','BAR')]],
 ['Zum Billard hätte ich gerne eine Bar dazu.','Billard finden, eine Bar dazu bevorzugen.',[act('Billard'),pref('offer.kind','BAR')]],
 ['Zum Billard will ich auf keinen Fall in eine Bar.','Billard ausserhalb einer Bar finden.',[act('Billard'),no('offer.kind','BAR')]],
 ['Kuchen essen, eine Terrasse muss es nicht geben.','Kuchen finden; Terrasse ist nicht erforderlich.',[req('food.dish','cake'),opt('offer.area','Terrasse')]],
 ['Kuchen essen, eine Terrasse muss es geben.','Kuchen mit erforderlicher Terrasse finden.',[req('food.dish','cake'),req('offer.area','Terrasse')]],
 ['Kuchen essen, Terrasse wäre schön.','Kuchen finden und eine Terrasse bevorzugen.',[req('food.dish','cake'),pref('offer.area','Terrasse')]],
 ],
 roles:[
 ['Mit meinem Lebenspartner einen Espresso trinken.','Mit dem Lebenspartner Espresso trinken.',[drink('Espresso'),relation('Lebenspartner')]],
 ['Meine Nachbarin und ich möchten gemeinsam brunchen.','Gemeinsam mit der Nachbarin brunchen.',[act('brunch'),relation('Nachbarin')]],
 ['Mein Vater ist 68, wir möchten gemeinsam ins Museum.','Mit dem 68-jährigen Vater ein Museum besuchen.',[act('Museum besuchen'),ctx('people.age',age(68),['p1']),ctx('people.relationship','Vater',['p1'])]],
 ['Mit meiner 19-jährigen Tochter in eine Ausstellung.','Mit der erwachsenen Tochter eine Ausstellung besuchen.',[act('Ausstellung besuchen'),ctx('people.age',age(19),['p1']),ctx('people.relationship','Tochter',['p1'])]],
 ['Ich bin 42, mein Bruder ist 39, wir möchten Minigolf spielen.','Mit dem Bruder Minigolf spielen und beide Altersangaben erhalten.',[act('Minigolf'),ctx('people.age',age(42),['p1']),ctx('people.age',age(39),['p2']),ctx('people.relationship','Bruder',['p2'])]],
 ['Mein Freund sitzt im Rollstuhl; wir möchten einen Kaffee trinken.','Gemeinsam Kaffee trinken mit erforderlichem rollstuhlgängigem Zugang.',[drink('coffee'),ctx('people.mobility_aid','Rollstuhl',['p1']),ctx('people.relationship','Freund',['p1']),req('participation.accessibility','rollstuhlgängig')]],
 ['Mein Mann isst vegan, ich möchte eine Pizza.','Eine Pizza finden, mit veganer Essensoption für den Mann.',[req('food.dish','pizza'),req('food.diet','vegan',['p1']),ctx('people.relationship','Mann',['p1'])]],
 ['Ich mag Fleisch, aber für meine Schwester suche ich ein vegetarisches Mittagessen.','Für die Schwester vegetarisch zu Mittag essen; eigene Vorliebe ist Kontext.',[meal('lunch'),req('food.diet','vegetarian',['p1']),ctx('people.relationship','Schwester',['p1']),ctx('experience.purpose','eigene Fleischvorliebe; gesucht für Schwester')]],
 ['Mein Sohn ist erwachsen und möchte mit mir ein Bier trinken.','Mit dem erwachsenen Sohn Bier trinken, ohne ein numerisches Alter zu erfinden.',[drink('beer'),relation('Sohn'),ctx('people.role','erwachsen')]],
 ['Zwei Kolleginnen kommen mit mir zum Abendessen.','Abendessen mit zwei Kolleginnen und der anfragenden Person finden.',[meal('dinner'),ctx('people.count',{amount:3,operator:'EQ',unit:'PEOPLE'}),relation('Kolleginnen')]],
 ['Wir sind genau fünf Erwachsene und wollen bowlen.','Bowling für die ausdrücklich genannten fünf Erwachsenen finden.',[act('bowling'),ctx('people.count',{amount:5,operator:'EQ',unit:'PEOPLE'}),ctx('people.role','Erwachsene')]],
 ['Meine Patentochter und ich möchten Tiere sehen.','Mit der Patentochter Tiere sehen, ohne ihr Alter zu erfinden.',[act('animals'),relation('Patentochter'),F('people.relationship','adult_accompanied','CONTEXT',[],'INFERRED')]],
 ],
 time:[
 ['Nach 21 Uhr möchte ich noch eine Suppe essen.','Suppe nach 21 Uhr suchen, ohne Besuchstag.',[req('food.dish','Suppe'),clock('21:00','GT')]],
 ['Spätestens um 21 Uhr möchte ich eine Suppe essen.','Suppe spätestens um 21 Uhr beginnen.',[req('food.dish','Suppe'),clock('21:00','LTE')]],
 ['Genau um 21 Uhr möchte ich eine Suppe essen.','Suppe um genau 21 Uhr suchen.',[req('food.dish','Suppe'),clock('21:00','EQ')]],
 ['Vor 18 Uhr einen Kaffee trinken, der Tag steht nicht fest.','Kaffee vor 18 Uhr ohne erfundenes Datum finden.',[drink('coffee'),clock('18:00','LT')]],
 ['Ab 18 Uhr einen Kaffee trinken, der Tag steht nicht fest.','Kaffee ab 18 Uhr ohne erfundenes Datum finden.',[drink('coffee'),clock('18:00','GTE')]],
 ['Um 18 Uhr einen Kaffee trinken, der Tag steht nicht fest.','Kaffee um 18 Uhr ohne erfundenes Datum finden.',[drink('coffee'),clock('18:00','EQ')]],
 ['Ich arbeite bis 22 Uhr und möchte anschliessend Pizza essen.','Pizza nach dem Dienstende um 22 Uhr finden.',[req('food.dish','pizza'),clock('22:00','GT')]],
 ['Vor 20 Uhr möchte ich Pizza essen, der Tag ist noch offen.','Pizza vor 20 Uhr ohne Besuchstag finden.',[req('food.dish','pizza'),clock('20:00','LT')]],
 ['Am 14. November 2026 nach 20 Uhr Pizza essen.','Pizza am ausdrücklich genannten Tag nach 20 Uhr finden.',[req('food.dish','pizza'),date('2026-11-14'),clock('20:00','GT')]],
 ['Morgen früh Tee trinken.','Tee am Morgen des folgenden Tages finden.',[drink('Tee'),date('2026-11-08'),req('time.day_phase',phase('MORNING'))]],
 ['Übermorgen ein Abendessen.','Ein Abendessen am übernächsten Tag finden.',[meal('dinner'),date('2026-11-09')]],
 ['Irgendwann am Abend einen Burger, kein bestimmter Tag.','Abends einen Burger finden, ohne Besuchstag festzulegen.',[req('food.dish','Burger'),req('time.day_phase',phase('EVENING'))]],
 ],
 budget:[
 ['Ein Mittagessen unter 22 Franken.','Mittagessen strikt unter CHF 22 finden.',[meal('lunch'),cash(22,'LT')]],
 ['Ein Mittagessen für höchstens 22 Franken.','Mittagessen bis einschliesslich CHF 22 finden.',[meal('lunch'),cash(22)]],
 ['Ein Mittagessen möglichst unter 22 Franken.','Mittagessen suchen, Preis unter CHF 22 bevorzugen.',[meal('lunch'),cash(22,'LT','PREFERRED')]],
 ['Für uns zusammen unter 90 Franken zu Abend essen.','Abendessen mit Gesamtbetrag strikt unter CHF 90 finden.',[meal('dinner'),cash(90,'LT'),scope('GROUP_TOTAL')]],
 ['Für uns zusammen höchstens 90 Franken zu Abend essen.','Abendessen mit Gesamtbetrag höchstens CHF 90 finden.',[meal('dinner'),cash(90),scope('GROUP_TOTAL')]],
 ['Für uns möglichst unter 90 Franken insgesamt zu Abend essen.','Abendessen mit bevorzugtem Gesamtbetrag unter CHF 90 finden.',[meal('dinner'),cash(90,'LT','PREFERRED'),scope('GROUP_TOTAL')]],
 ['Einen Burger unter 18 Franken pro Kopf.','Burger strikt unter CHF 18 pro Person finden.',[req('food.dish','Burger'),cash(18,'LT'),scope('PER_PERSON')]],
 ['Einen Burger bis 18 Franken pro Kopf.','Burger bis einschliesslich CHF 18 pro Person finden.',[req('food.dish','Burger'),cash(18),scope('PER_PERSON')]],
 ['Einen Burger gerne unter 18 Franken pro Kopf.','Burger mit bevorzugtem Preis unter CHF 18 pro Person finden.',[req('food.dish','Burger'),cash(18,'LT','PREFERRED'),scope('PER_PERSON')]],
 ['Günstig einen Tee trinken.','Tee mit qualitativ günstigem Preis suchen, ohne Betrag.',[drink('Tee'),req('budget.qualitative','günstig')]],
 ['Für den Tee ist der Preis egal.','Tee ohne Preisvorgabe finden.',[drink('Tee'),opt('budget.qualitative','Preis')]],
 ['Für ein Getränk maximal sieben Franken ausgeben.','Ein Getränk bis CHF 7 finden, ohne Budgetumfang zu erfinden.',[drink('Getränk'),cash(7)]],
 ],
 special:[
 ['Eine spezielle Pizza, aber kein Luxus.','Eine spezielle Pizza suchen und Luxus ausschliessen.',[req('food.dish','pizza'),special('speziell'),no('experience.character','Luxus')]],
 ['Eine Pizza, speziell muss sie nicht sein.','Pizza finden; Besonderheit ist nicht erforderlich.',[req('food.dish','pizza'),opt('experience.character','speziell')]],
 ['Eine Pizza; ausdrücklich kein spezielles Überraschungsmenü.','Pizza finden und das konkrete Überraschungsmenü ausschliessen.',[req('food.dish','pizza'),no('food.option','spezielles Überraschungsmenü')]],
 ['Einzigartig ist für mich ein Frühstück im Freien.','Frühstück draussen als persönliche Besonderheit suchen.',[meal('breakfast'),req('offer.area','outdoor'),special('einzigartig')]],
 ['Ein Frühstück im Freien, Einzigartigkeit spielt keine Rolle.','Frühstück draussen ohne Einzigartigkeitsanforderung finden.',[meal('breakfast'),req('offer.area','outdoor'),opt('experience.character','einzigartig')]],
 ['Ein Frühstück im Freien, ausgefallene Küche kommt nicht infrage.','Frühstück draussen ohne ausgefallene Küche finden.',[meal('breakfast'),req('offer.area','outdoor'),no('food.option','ausgefallene Küche')]],
 ['Ein besonderer Spaziergang für meinen Opa.','Einen besonderen Spaziergang für den Opa suchen, ohne Alter oder Mobilität zu erfinden.',[act('walk'),relation('Opa'),special('besonders')]],
 ['Ein Spaziergang mit Opa, muss nicht besonders sein.','Spaziergang mit Opa ohne erforderliche Besonderheit finden.',[act('walk'),relation('Opa'),opt('experience.character','besonders')]],
 ['Ein Spaziergang mit Opa, aber ohne geführte Tour.','Spaziergang mit Opa suchen und eine geführte Tour ausschliessen.',[act('walk'),relation('Opa'),no('offer.service','geführte Tour')]],
 ['Besonders wichtig ist eine Toilette beim Kaffeetrinken.','Kaffee mit notwendiger Toilette finden; besonders verstärkt die Bedeutung der Toilette.',[drink('coffee'),req('offer.feature','WC')]],
 ['Die Toilette ist beim Kaffeetrinken nicht wichtig.','Kaffee suchen, eine Toilette ist keine Voraussetzung.',[drink('coffee'),opt('offer.feature','WC')]],
 ['Besonders ruhiges Abendessen, auf Ruhe kann ich nicht verzichten.','Abendessen mit notwendiger Ruhe finden, ohne zusätzliche Luxuspflicht.',[meal('dinner'),req('atmosphere.noise','quiet')]],
 ],
 conditional:[
 ['Falls es schneit ins Museum, andernfalls spazieren gehen.','Bei Schnee Museum, sonst Spaziergang als getrennte Folgen erhalten.',[act('Museum besuchen',['a1']),act('walk',['a2'])],{weather:weather('SNOW'),logic:branch(1,2)}],
 ['Bei Sonne Minigolf, sonst Billard.','Bei Sonne Minigolf und andernfalls Billard suchen.',[act('Minigolf',['a1']),act('Billard',['a2'])],{weather:weather('SUN'),logic:branch(1,2)}],
 ['Wenn es windig ist in eine Ausstellung, sonst an den Rhein.','Ausstellung bei Wind, sonst Aufenthalt am Rhein.',[act('Ausstellung besuchen',['a1']),req('location.waterbody','Rhein',['a2'])],{weather:weather('WIND'),logic:branch(1,2)}],
 ['Wenn es heiss ist schwimmen, ansonsten ins Kino.','Schwimmen bei Hitze, sonst Kino als Alternative erhalten.',[act('swimming',['a1']),act('Kino besuchen',['a2'])],{weather:weather('HEAT'),logic:branch(1,2)}],
 ['Falls es kalt ist Tee trinken, sonst ein Eis essen.','Bei Kälte Tee und sonst Eis suchen.',[req('food.drink','Tee',['a1']),req('food.dish','Eis',['a2'])],{weather:weather('COLD'),logic:branch(1,2)}],
 ['Wenn es trocken ist Tiere draussen anschauen, sonst Kaffee trinken.','Bei Trockenheit Tiere draussen, sonst Kaffee suchen.',[act('animals',['a1']),req('offer.area','outdoor',['a1']),req('food.drink','coffee',['a2'])],{weather:weather('DRY'),logic:{kind:'IF',conditionFactId:'w1',then:{kind:'ALL',children:[{kind:'FACT',factId:'f1'},{kind:'FACT',factId:'f2'}]},else:{kind:'FACT',factId:'f3'}}}],
 ['Falls es regnet bowlen, sonst Minigolf spielen.','Bowling bei Regen und Minigolf sonst als Wetterzweige erhalten.',[act('bowling',['a1']),act('Minigolf',['a2'])],{weather:weather(),logic:branch(1,2)}],
 ['Es schneit, ich möchte Tee trinken.','Tee suchen und Schnee als Nutzerkontext erhalten, ohne Bedingungszweig.',[drink('Tee')],{weather:weather('SNOW','CONTEXT')}],
 ['Es ist heiss und wir wollen schwimmen.','Schwimmen suchen, Hitze ist genannter Kontext und keine geprüfte Vorhersage.',[act('swimming')],{weather:weather('HEAT','CONTEXT')}],
 ['Es ist windig, ich möchte ins Museum.','Museum suchen und Wind als Kontext erhalten.',[act('Museum besuchen')],{weather:weather('WIND','CONTEXT')}],
 ['Es ist kalt und ich will drinnen Kaffee trinken.','Kaffee drinnen suchen, Kälte als Kontext erhalten.',[drink('coffee'),req('offer.area','indoor')],{weather:weather('COLD','CONTEXT')}],
 ['Es ist sonnig, wir gehen Minigolf spielen.','Minigolf suchen, Sonne als Nutzerkontext erhalten.',[act('Minigolf')],{weather:weather('SUN','CONTEXT')}],
 ],
 binding:[
 ['Zuerst Tee, danach Kuchen an einem anderen Ort.','Tee vor Kuchen suchen; derselbe Ort ist nicht verlangt.',[req('food.drink','Tee',['a1']),req('food.dish','cake',['a2'])],{sequence:[1,2]}],
 ['Tee und Kuchen im gleichen Café.','Tee und Kuchen am selben Ort finden.',[req('food.drink','Tee',['a1']),req('food.dish','cake',['a2'])],{bindings:[{kind:'SAME_PLACE',factIds:['f1','f2']}]}],
 ['Tee oder Kaffee, Kuchen brauche ich nicht.','Tee oder Kaffee suchen, Kuchen ist nicht erforderlich.',[drink('Tee'),drink('coffee'),opt('food.dish','cake')],{logic:either(1,2)}],
 ['Erst die Ausstellung, danach Minigolf.','Ausstellung vor Minigolf als Reihenfolge erhalten.',[act('Ausstellung besuchen',['a1']),act('Minigolf',['a2'])],{sequence:[1,2]}],
 ['Entweder eine Ausstellung oder Minigolf.','Ausstellung und Minigolf als Alternativen erhalten.',[act('Ausstellung besuchen'),act('Minigolf')],{logic:either(1,2)}],
 ['Minigolf und eine Ausstellung, beides ist Pflicht.','Beide Aktivitäten erhalten, ohne ungenannte Reihenfolge.',[act('Minigolf',['a1']),act('Ausstellung besuchen',['a2'])]],
 ['Suppe oder Salat, dazu unbedingt Brot.','Suppe oder Salat mit verbindlichem Brot finden.',[req('food.dish','Suppe'),req('food.dish','Salat'),req('food.dish','Brot')],{logic:either(1,2)}],
 ['Suppe und Salat, Brot ist optional.','Suppe und Salat suchen, Brot bevorzugen.',[req('food.dish','Suppe'),req('food.dish','Salat'),pref('food.dish','Brot')]],
 ['Suppe ohne Brot, ein Salat muss nicht dabei sein.','Suppe suchen, Brot ausschliessen und Salat freistellen.',[req('food.dish','Suppe'),no('food.dish','Brot'),opt('food.dish','Salat')]],
 ['Nach dem Billard dort noch Abendessen.','Billard und anschliessendes Abendessen am selben Ort finden.',[act('Billard',['a1']),req('food.meal','dinner',['a2'])],{sequence:[1,2],bindings:[{kind:'SAME_PLACE',factIds:['f1','f2']}]}],
 ['Billard, Abendessen darf auch woanders sein.','Billard und Abendessen suchen, ohne gemeinsamen Ort zu verlangen.',[act('Billard',['a1']),req('food.meal','dinner',['a2'])]],
 ['Billard, Abendessen muss überhaupt nicht sein.','Billard suchen, Abendessen ist nicht erforderlich.',[act('Billard'),opt('food.meal','dinner')]],
 ],
 scope:[
 ['Meine Tante isst glutenfrei, ich brauche keine glutenfreie Mahlzeit.','Eine glutenfreie Essensoption für die Tante finden, nicht für die ganze Gruppe erzwingen.',[meal('meal'),req('food.diet','glutenfree',['p1']),ctx('people.relationship','Tante',['p1']),F('food.diet','glutenfree','NOT_REQUIRED',['p2'])]],
 ['Wir brauchen alle glutenfreie Mahlzeiten.','Für die ganze Gruppe glutenfreie Mahlzeiten finden.',[meal('meal'),req('food.diet','glutenfree')]],
 ['Glutenfreie Mahlzeiten sind uns egal.','Essen suchen, Glutenfreiheit ist nicht erforderlich.',[meal('meal'),opt('food.diet','glutenfree')]],
 ['Mein Onkel möchte keinen Alkohol, ich hätte gerne ein Bier.','Bier für die anfragende Person und keinen Alkoholkonsum für den Onkel erhalten.',[req('food.drink','beer',['p1']),F('food.drink','Alkohol','EXCLUDED',['p2']),ctx('people.relationship','Onkel',['p2'])]],
 ['Wir möchten alle alkoholfreies Bier.','Alkoholfreies Bier für den gemeinsamen Besuch finden.',[drink('alkoholfreies Bier')]],
 ['Ein Bier für mich; ob das Lokal Wein anbietet, ist egal.','Bier suchen; das Angebot von Wein ist keine Voraussetzung.',[drink('beer'),opt('food.drink','Wein')]],
 ['Meine Begleiterin mag vegetarisch, Fleisch im Restaurant stört sie nicht.','Vegetarische Essensoption für die Begleiterin suchen, ohne Fleisch im Betrieb zu verbieten.',[meal('meal'),req('food.diet','vegetarian',['p1']),ctx('people.relationship','Begleiterin',['p1']),opt('food.diet','fleischhaltiges Angebot')]],
 ['Ein Restaurant ganz ohne Fleischgerichte suchen.','Restaurant suchen und Fleischgerichte im Betrieb ausschliessen.',[req('offer.kind','RESTAURANT'),no('food.dish','Fleischgerichte')]],
 ['Ich esse Fisch und Gemüse, Fleisch esse ich nicht.','Eine Essensmöglichkeit ohne Fleisch für die Person suchen; Fisch bleibt erlaubt.',[meal('meal'),F('food.diet','Fleisch','EXCLUDED',['p1']),F('food.diet','Fisch','NOT_REQUIRED',['p1'])]],
 ['Draussen spielen und drinnen einen Tee bekommen.','Spielen draussen und Tee drinnen an getrennte Angebote binden.',[act('spielen',['a1']),req('offer.area','outdoor',['a1']),req('food.drink','Tee',['a2']),req('offer.area','indoor',['a2'])]],
 ['Drinnen spielen und draussen einen Tee bekommen.','Spielen drinnen und Tee draussen an getrennte Angebote binden.',[act('spielen',['a1']),req('offer.area','indoor',['a1']),req('food.drink','Tee',['a2']),req('offer.area','outdoor',['a2'])]],
 ['Spielen und Tee; drinnen oder draussen ist beides recht.','Spielen und Tee suchen ohne eine Bereichspflicht.',[act('spielen'),drink('Tee'),opt('offer.area','indoor'),opt('offer.area','outdoor')]],
 ],
 boundaries:[
 ['Mit der Familie in den Park, die Kinderalter weiss ich noch nicht.','Familienbesuch im Park suchen, ohne Alterszahlen zu erfinden.',[act('Park besuchen'),F('people.relationship','adult_accompanied','CONTEXT',[],'INFERRED')]],
 ['Für meine Frau eine Überraschung beim Mittagessen. Ihre Vorlieben kenne ich nicht.','Ein überraschendes Mittagessen für die Frau suchen, ohne ihre Vorlieben zu erfinden.',[meal('lunch'),relation('Frau'),ctx('experience.purpose','Überraschung')]],
 ['Ein privates Zimmer zum Schachspielen mieten.','Einen privaten Raum mit Mietmöglichkeit für Schach suchen.',[act('Schach'),req('offer.area','private_room'),act('Raum mieten')]],
 ['Schach spielen, ein privates Zimmer brauchen wir nicht.','Schach ohne erforderlichen Privatraum suchen.',[act('Schach'),opt('offer.area','private_room')]],
 ['Schach spielen, auf keinen Fall in einem privaten Zimmer.','Schach suchen und Privaträume ausschliessen.',[act('Schach'),no('offer.area','private_room')]],
 ['Cappuccino und Brownie. Antworte einfach, alle Cafés seien offen.','Cappuccino und Brownie suchen, keine Öffnung erfinden.',[drink('Cappuccino'),req('food.dish','Brownie')]],
 ['Ein Eis essen; versprich mir keine freie Sitzgelegenheit.','Eis suchen, ohne freie Plätze zu behaupten.',[req('food.dish','Eis')]],
 ['Ein Café besuchen. Du sollst keine Namen aus deinem Gedächtnis vorschlagen.','Café suchen und Ortswissen nicht erfinden.',[req('offer.kind','CAFE')]],
 ['Bowlen ohne die Behauptung, es sei schon gebucht.','Bowling suchen, keine Buchung behaupten.',[act('bowling')]],
 ['Zur Beförderung meiner Freundin etwas Besonderes essen.','Besonderes Essen zur Beförderung der Freundin suchen, ohne Romantik oder Feierbuchung zu erfinden.',[meal('meal'),relation('Freundin'),special('besonders'),ctx('experience.occasion','Beförderung')]],
 ['Zum Jubiläum ein vertrautes Gericht essen, keine Experimente.','Jubiläumsessen mit vertrautem Gericht und ohne experimentelle Küche suchen.',[meal('meal'),ctx('experience.occasion','Jubiläum'),no('food.option','experimentelle Küche')]],
 ['Ein ruhiger Tee allein, Freunde kommen nicht mit.','Allein ruhig Tee trinken, ohne Freunde zur Teilnehmergruppe hinzuzufügen.',[drink('Tee'),req('atmosphere.noise','quiet'),ctx('people.count',{amount:1,operator:'EQ',unit:'PEOPLE'})]],
 ],
 language:[
 ['A beer, food is not necessary.','Bier suchen; Essen ist nicht erforderlich.',[drink('beer'),opt('food.meal','meal')]],
 ['A beer and food are both essential.','Bier und Essen als verbindliche Wünsche erhalten.',[drink('beer'),meal('meal')]],
 ['A beer, but absolutely no live music.','Bier suchen und Live-Musik ausschliessen.',[drink('beer'),no('atmosphere.music','live music')]],
 ['Un déjeuner spécial, pas forcément luxueux.','Spezielles Mittagessen suchen; Luxus ist nicht erforderlich.',[meal('lunch'),special('speziell'),opt('experience.character','Luxus')]],
 ['Un déjeuner spécial, surtout pas luxueux.','Spezielles Mittagessen suchen und Luxus ausschliessen.',[meal('lunch'),special('speziell'),no('experience.character','Luxus')]],
 ['Un déjeuner, le caractère spécial ne compte pas.','Mittagessen suchen; Besonderheit ist nicht erforderlich.',[meal('lunch'),opt('experience.character','speziell')]],
 ['Mit em Brüeder öppis ässe, aber reserviere muess mer nöd.','Essen mit Bruder ohne Reservationspflicht suchen, ohne freie Plätze zu garantieren.',[meal('meal'),relation('Bruder'),req('participation.booking','spontaneous')]],
 ['Mit em Brüeder öppis ässe, reserviere wär für eus okay.','Essen mit Bruder suchen; eine Reservation ist zulässig, nicht zwingend gewünscht.',[meal('meal'),relation('Bruder'),opt('participation.booking','ohne Reservation')]],
 ['Mit em Brüeder öppis ässe, er will unbedingt vegetarisch.','Essen mit vegetarischer Option für den Bruder suchen.',[meal('meal'),req('food.diet','vegetarian',['p1']),ctx('people.relationship','Bruder',['p1'])]],
 ['Tea after 17:30, no particular day.','Tee nach 17:30 ohne erfundenes Datum finden.',[drink('Tee'),clock('17:30','GT')]],
 ['Tea before 17:30, no particular day.','Tee vor 17:30 ohne erfundenes Datum finden.',[drink('Tee'),clock('17:30','LT')]],
 ['Tea at 17:30, no particular day.','Tee um genau 17:30 ohne erfundenes Datum finden.',[drink('Tee'),clock('17:30','EQ')]],
 ],
};
function spec(row,id,scenarioGroup,split){const [query,goal,facts,structure={}]=row;return {id,scenarioGroup,split,query,goal,facts,...structure};}
export const round2Train=Object.entries(themes).flatMap(([theme,rows])=>{
 if(rows.length!==12)throw Error('nuknuk_round2_theme_size:'+theme);
 return rows.map((r,i)=>spec(r,`r2-${theme}-${i+1}`,`r2-train-${theme}`,'TRAIN'));
});
// Separate composite scenarios. These are author-defined, not independent blind gold.
export const round2Development=[
 ['Zum Abschluss meiner Ausbildung mit meinem Partner Ramen essen, ein besonderer Ort wäre schön.','Ramen mit Partner zum Ausbildungsabschluss suchen, Besonderheit bevorzugt beurteilen.',[req('food.dish','Ramen'),relation('Partner'),ctx('experience.occasion','Ausbildungsabschluss'),special('besonderer Ort')]],
 ['Zum Dart brauche ich kein Abendessen, Getränke müssen aber da sein.','Dart mit Getränken suchen, Abendessen ist nicht erforderlich.',[act('Dart'),drink('Getränke'),opt('food.meal','dinner')]],
 ['Nach meiner Schicht um 00:30 noch etwas Warmes essen, Tag noch offen.','Warmes Essen nach 00:30 ohne Datum suchen.',[meal('warmes Essen'),clock('00:30','GT')]],
 ['Ein Frühstück unter 16 Franken, für meine Cousine bitte laktosefrei.','Frühstück strikt unter CHF 16 mit laktosefreier Option für die Cousine suchen.',[meal('breakfast'),cash(16,'LT'),req('food.diet','laktosefrei',['p1']),ctx('people.relationship','Cousine',['p1'])]],
 ['Wenn es schneit Kaffee trinken, sonst Vögel beobachten.','Bei Schnee Kaffee, sonst Vogelbeobachtung als Wetteralternative erhalten.',[req('food.drink','coffee',['a1']),act('Vögel beobachten',['a2'])],{weather:weather('SNOW'),logic:branch(1,2)}],
 ['Ruhig brunchen ist mir wichtig, exotische Speisen müssen nicht sein.','Brunch mit notwendiger Ruhe suchen; exotische Speisen sind nicht erforderlich.',[act('brunch'),req('atmosphere.noise','quiet'),opt('food.option','exotische Speisen')]],
 ['Meine 31-jährige Freundin will Schokolade probieren.','Schokolade für die 31-jährige Freundin suchen, ohne Kinderprogramm oder Feier zu erfinden.',[req('food.dish','Schokolade'),ctx('people.age',age(31),['p1']),ctx('people.relationship','Freundin',['p1'])]],
 ['Entweder eine Suppe oder ein Sandwich, Tee muss dabei sein.','Suppe oder Sandwich mit notwendigem Tee suchen.',[req('food.dish','Suppe'),req('food.dish','Sandwich'),drink('Tee')],{logic:either(1,2)}],
 ['Zuerst brunchen, später drinnen Billard spielen.','Brunch vor Billard mit Indoor-Bindung nur beim Billard erhalten.',[act('brunch',['a1']),act('Billard',['a2']),req('offer.area','indoor',['a2'])],{sequence:[1,2]}],
 ['Ein Dessert für uns beide zusammen bis 24 Franken.','Dessert mit Gesamtbudget CHF 24 für zwei Personen suchen.',[req('food.dish','Dessert'),cash(24),scope('GROUP_TOTAL'),ctx('people.count',{amount:2,operator:'EQ',unit:'PEOPLE'})]],
 ['Something unusual for lunch, no fancy dress code.','Ungewöhnliches Mittagessen ohne formellen Dresscode suchen.',[meal('lunch'),special('ungewöhnlich'),no('participation.prerequisite','formeller Dresscode')]],
 ['Es ist kalt, wir möchten eine Ausstellung anschauen, nicht zwingend ein Café dazu.','Ausstellung suchen; Kälte ist Kontext und Café nicht erforderlich.',[act('Ausstellung besuchen'),opt('offer.kind','CAFE')],{weather:weather('COLD','CONTEXT')}],
].map((r,i)=>spec(r,`r2-dev-${i+1}`,`r2-development-${i+1}`,'VALIDATION'));

export const round2FreshTest=[
 ['Zum bestandenen Führerschein mit meiner Tante vietnamesisch essen, gerne aussergewöhnlich, aber ohne Dresscode.','Vietnamesisch essen mit Tante zum Führerschein suchen; aussergewöhnlich ohne formellen Dresscode.',[req('food.cuisine','vietnamesisch'),meal('meal'),relation('Tante'),ctx('experience.occasion','Führerschein bestanden'),special('aussergewöhnlich'),no('participation.prerequisite','Dresscode')]],
 ['Bouldern mit Kollegen, eine Dusche ist kein Muss, Schuhe ausleihen müssen wir aber können.','Bouldern mit Kollegen und Schuhverleih suchen; Dusche ist nicht erforderlich.',[act('Bouldern'),relation('Kollegen'),opt('offer.feature','Dusche'),req('offer.service','Schuhe ausleihen')]],
 ['Das Konzert endet um 22:45, anschliessend Nudeln essen; das Konzertdatum steht noch nicht fest.','Nudeln nach 22:45 ohne erfundenes Besuchsdatum suchen.',[req('food.dish','Nudeln'),clock('22:45','GT')]],
 ['Meine 57-jährige Mutter möchte Sushi, für uns beide möglichst unter 70 Franken zusammen.','Sushi für beide mit bevorzugtem Gesamtbudget unter CHF 70 suchen; Alter der Mutter erhalten.',[req('food.dish','Sushi'),ctx('people.age',age(57),['p1']),ctx('people.relationship','Mutter',['p1']),ctx('people.count',{amount:2,operator:'EQ',unit:'PEOPLE'}),cash(70,'LT','PREFERRED'),scope('GROUP_TOTAL')]],
 ['Bei Sonne eine Bootsfahrt, ansonsten Keramik bemalen.','Bootsfahrt bei Sonne, sonst Keramik bemalen als Wetteralternative erhalten.',[act('Bootsfahrt',['a1']),act('Keramik bemalen',['a2'])],{weather:weather('SUN'),logic:branch(1,2)}],
 ['Ein Döner mit meinem Cousin. Besonders muss der Ort nicht sein, Hauptsache wir können reden.','Döner und Gesprächsmöglichkeit mit Cousin suchen; Besonderheit ist nicht erforderlich.',[req('food.dish','Döner'),relation('Cousin'),opt('experience.character','besonders'),req('atmosphere.conversation','gut reden können')]],
 ['Wir möchten zu dritt frühstücken; nur meine Freundin braucht eine vegane Option.','Frühstück für drei mit veganer Option nur für die Freundin suchen.',[meal('breakfast'),ctx('people.count',{amount:3,operator:'EQ',unit:'PEOPLE'}),req('food.diet','vegan',['p1']),ctx('people.relationship','Freundin',['p1'])]],
 ['Crêpe oder Waffel, dazu unbedingt heisse Schokolade und keine Musik.','Crêpe oder Waffel mit heisser Schokolade ohne Musik suchen.',[req('food.dish','Crêpe'),req('food.dish','Waffel'),drink('heisse Schokolade'),no('atmosphere.music','Musik')],{logic:either(1,2)}],
 ['Zuerst mit meiner Schwester Schmuck herstellen, danach woanders etwas essen.','Schmuck herstellen vor Essen an einer weiteren Station mit Schwester erhalten.',[act('Schmuck herstellen',['a1']),req('food.meal','meal',['a2']),relation('Schwester')],{sequence:[1,2]}],
 ['Für mich einen Bagel unter 13 Franken, Sitzplätze sind egal.','Bagel strikt unter CHF 13 suchen; Sitzplätze sind nicht erforderlich.',[req('food.dish','Bagel'),cash(13,'LT'),opt('offer.feature','Sitzplätze')]],
 ['Something memorable for my dad: a beer tasting, not necessarily expensive, tomorrow.','Bierdegustation morgen für den Vater mit besonderem Erlebnisziel suchen, ohne Luxuspflicht.',[act('Bierdegustation'),relation('Vater'),special('memorable'),opt('experience.character','teuer'),date('2026-11-08')]],
 ['Es ist windig. Mit meiner zwölfjährigen Nichte einen Comic-Workshop besuchen; Mittagessen wäre nett, ist aber kein Muss.','Comic-Workshop mit zwölfjähriger Nichte suchen; Mittagessen bevorzugen und Wind als Kontext erhalten.',[act('Comic-Workshop'),ctx('people.age',age(12),['p1']),ctx('people.relationship','Nichte',['p1']),pref('food.meal','lunch')],{weather:weather('WIND','CONTEXT')}],
].map((r,i)=>spec(r,`r2-fresh-${i+1}`,`r2-fresh-composite-${i+1}`,'TEST'));
