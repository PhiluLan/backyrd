// New contrast groups after Astra review. Natural requests, no annotation prose.
import {family,W,R,P,C,O,X,A,M,D,dish,person,accompanied,age,count,cash,scope,date,clock,same,clarification} from './authoring.mjs';
const groups=[];const add=(n,d,t,rows,split='TRAIN')=>groups.push(...family(n,d,t,rows,split));
add('attendance-contrast','family',['companions','unaccompanied','minor-companion'],[
 W('Mein Sohn möchte allein ins Museum, er ist zwölf.','Museum für allein teilnehmenden Sohn.',[R('offer.kind','MUSEUM'),person('Sohn'),age(12),C('people.relationship','unaccompanied',['p1'])]),
 W('Ich suche für mein Kind etwas mit Tieren.','Tiererlebnis für Kind, Begleitung nicht genannt.',[A('animals'),person('Kind')]),
 W('Meine Tochter geht mit ihrer dreizehnjährigen Freundin zum Minigolf.','Tochter mit dreizehnjähriger Freundin, Tochteralter und Erwachsenenbegleitung nicht genannt.',[A('Minigolf'),person('Tochter','p1'),person('Freundin der Tochter','p2'),age(13,'p2'),C('people.role','minderjährig',['p2'])]),
 W('Ich bin siebzehn und begleite meinen kleinen Bruder ins Kino.','Siebzehnjährige Begleitperson ist keine erwachsene Aufsicht; weitere Begleitung nicht genannt.',[R('offer.kind','CINEMA'),C('people.role','self',['pSelf']),age(17,'pSelf'),person('Bruder')]),
 W('Unsere Kinder gehen alleine klettern, wir holen sie später ab.','Klettern ohne mitteilnehmende Eltern.',[A('Klettern'),person('Kinder'),C('people.relationship','unaccompanied',['p1'])]),
 W('Ich komme mit meinem vierjährigen Sohn auf den Spielplatz.','Gemeinsame Teilnahme mit vierjährigem Kind.',[A('playground'),person('Sohn'),age(4),accompanied(),C('people.role','self',['pSelf'])]),
 W('Familienausflug mit Tieren und Picknick aus dem Rucksack.','Gemeinsamer Familienausflug mit eigener Verpflegung.',[A('animals'),R('participation.permission','own_food'),accompanied()]),
 W('Meine erwachsene Tochter will alleine einen Kochkurs besuchen.','Erwachsene Tochter nimmt allein teil.',[A('Kochkurs'),person('Tochter'),C('people.role','erwachsen',['p1']),C('people.relationship','alone',['p1'])]),
]);
add('negation-contrast','meaning',['exclusion','not-required','own-experience'],[
 W('Sushi zum Geburtstag, bitte keine Überraschungsaktion.','Überraschungsaktion beim eigenen Erlebnis ausgeschlossen.',[dish('Sushi'),C('experience.occasion','Geburtstag'),X('experience.character','Überraschungsaktion')]),
 W('Sushi zum Geburtstag, eine Überraschung brauche ich nicht.','Überraschung nicht nötig, kein Verbot.',[dish('Sushi'),C('experience.occasion','Geburtstag'),O('experience.character','Überraschung')]),
 W('Zum Tee auf keinen Fall Live-Musik.','Live-Musik beim eigenen Besuch ausgeschlossen.',[D('Tee'),X('atmosphere.music','live_music')]),
 W('Zum Tee muss keine Live-Musik laufen.','Kein Live-Musikbedarf.',[D('Tee'),O('atmosphere.music','live_music')]),
 W('Bouldern, aber keinen Wettkampf.','Wettkampf als eigenes Teilnahmeformat ausgeschlossen.',[A('Bouldern'),X('atmosphere.competition','Wettkampf')]),
 W('Einen Spielplatz ohne Wasserspiele bitte.','Wasserspiele im gewählten Spielangebot ausgeschlossen.',[A('playground'),X('offer.feature','Wasserspiele')]),
 W('Kaffee draussen, bitte nicht in der prallen Sonne.','Outdoorbesuch mit ausgeschlossenem direktem Sonnenplatz.',[D('coffee'),R('offer.area','outdoor'),X('condition.exposure','pralle Sonne')]),
 W('Ich will keinen Kurs, sondern selbst Tischtennis spielen.','Tischtennis als selbständige Nutzung, kein Kursformat.',[A('table_tennis'),X('experience.activity','course')]),
]);
add('venue-contrast','stay',['venue-vs-consumption','dayguest','currency'],[
 W('Eine Weinbar zum Plaudern.','Weinbar und Gespräch, kein Weinkonsum erfunden.',[R('offer.kind','WINE_BAR'),R('atmosphere.conversation','conversation_possible')]),
 W('Ein Glas Wein zum Plaudern.','Wein ohne vorgegebenen Ortstyp.',[D('Wein'),R('atmosphere.conversation','conversation_possible')]),
 W('Ein Hotel mit Frühstück für externe Gäste.','Hotel und zugängliches Frühstück.',[R('offer.kind','HOTEL'),M('breakfast'),R('participation.permission','public_day_access')]),
 W('Ein Frühstück, schlafen tun wir daheim.','Frühstück als Tagesgast ohne Hotelpflicht.',[M('breakfast'),R('participation.permission','public_day_access')]),
 W('Billard mit Café im gleichen Haus.','Billard und eigenständiger Café-Ortstyp.',[A('Billard'),R('offer.kind','CAFE',['a2'])],{bindings:[same(1,2)]}),
 W('Billard mit Kaffee im gleichen Haus.','Billard und beziehbarer Kaffee statt Cafépflicht.',[A('Billard'),D('coffee',['a2'])],{bindings:[same(1,2)]}),
 W('Mittagessen für maximal 25.','Preisgrenze ohne erfundene Währung.',[M('lunch'),cash(25,'LTE','REQUIRED',['a1'],'UNSPECIFIED')]),
 W('Mittagessen in Weil am Rhein bis 25 Euro.','Genannte Eurowährung bleibt trotz regionalem Default erhalten.',[M('lunch'),R('location.destination','Weil am Rhein',[]),cash(25,'LTE','REQUIRED',['a1'],'EUR')]),
]);
add('sequence-contrast','composition',['sequence','same-place','simultaneous'],[
 W('Erst Minigolf, danach dort Kaffee.','Reihenfolge und gemeinsamer Ort erhalten.',[A('Minigolf'),D('coffee',['a2'])],{bindings:[same(1,2)],sequence:[1,2],capability:true}),
 W('Erst Kaffee, danach dort Minigolf.','Umgekehrte Reihenfolge am gleichen Ort.',[D('coffee'),A('Minigolf',['a2'])],{bindings:[same(1,2)],sequence:[1,2],capability:true}),
 W('Minigolf und Kaffee am selben Ort.','Gleicher Ort ohne erfundene Reihenfolge.',[A('Minigolf'),D('coffee',['a2'])],{bindings:[same(1,2)]}),
 W('Kaffee oder zuerst Minigolf? Egal, beides im gleichen Betrieb.','Beides erforderlich, Reihenfolge frei.',[D('coffee'),A('Minigolf',['a2'])],{bindings:[same(1,2)]}),
 W('Nach dem Museum gehen wir woanders Pizza essen.','Zwei verschiedene Besuche, nicht gemeinsamer Ort.',[R('offer.kind','MUSEUM'),dish('Pizza',['a2'])],{sequence:[1,2],extensions:['Pizzaessen findet an einem anderen Ort als der Museumsbesuch statt'],capability:true}),
 W('Während ich Kaffee trinke spielt mein Sohn gleichzeitig Tischtennis.','Gleichzeitigkeit und getrennte Personenrollen erhalten.',[D('coffee',['pSelf']),A('table_tennis',['pSon']),C('people.role','self',['pSelf']),person('Sohn','pSon')],{bindings:[{kind:'SIMULTANEOUS',factIds:['f1','f2']}],capability:true}),
 W('Bei unserem Ausflug erst schwimmen, danach ein Snack dort.','Baden und Verpflegung mit expliziter Reihenfolge am selben Ort.',[A('swimming'),M('snacks',['a2'])],{sequence:[1,2],bindings:[same(1,2)],capability:true}),
 W('Bowling mit Snacks, die Reihenfolge ist mir egal.','Keine Reihenfolge voraussetzen.',[A('Bowling'),M('snacks',['a2'])],{bindings:[same(1,2)]}),
]);
const dev=[
 W('Morn mit de Chind öppis mit Tier, kei Show bitte.','Tiererlebnis mit ausgeschlossener Show, Familienbegleitung.',[A('animals'),X('participation.format','Show'),accompanied()]),
 W('Un café tranquille avec ma mère.','Kaffee mit Mutter und beschreibender Ruhepräferenz.',[D('coffee'),person('Mutter'),P('atmosphere.noise','quiet')]),
 W('Lunch with mum, no live band please.','Mittagessen mit ausgeschlossener Live-Musik.',[M('lunch'),person('Mutter'),X('atmosphere.music','live_music')]),
 W('Una pizza, massimo venti euro.','Pizza mit genannter Eurogrenze.',[dish('Pizza'),cash(20,'LTE','REQUIRED',['a1'],'EUR')]),
 W('Museum für meine Tochter, sie geht allein.','Kein Erwachsener als Begleitung erfunden.',[R('offer.kind','MUSEUM'),person('Tochter'),C('people.relationship','unaccompanied',['p1'])]),
 W('Ohne Reservation bitte.','Reservationsfreiheit ohne erfundene Aktivität.',[R('participation.booking','spontaneous')],clarification('EXPERIENCE_DIRECTION','Was möchtest du machen?',['Essen gehen','Spielen','Kultur entdecken'],'Die Aktivität fehlt.')),
 W('Mal wieder mit meiner Schwester Kaffee trinken.','Kaffee und Wiedersehen ohne erfundene Vorlieben.',[D('coffee'),person('Schwester')],{hypotheses:[{statement:'Vielleicht steht gemeinsame Zeit im Vordergrund.',evidence:[{quote:'Mal wieder mit meiner Schwester'}],status:'HYPOTHESIS'}]}),
 W('Für meinen Bruder etwas Besonderes.','Empfänger bekannt, Erlebnisrichtung offen.',[person('Bruder'),P('experience.character','besonders')],{...clarification('RECIPIENT_TASTE','Welche Richtung mag er?',['Kulinarisches','Aktivitäten','Kultur'],'Interessen nicht genannt.'),uncertainties:[{description:'Die Interessen des Bruders sind nicht bekannt.',relatedIds:['p1']}]}),
];
// The dialect request explicitly says tomorrow.
dev[0].facts.push(date('2026-11-13'));
add('dev-natural-contrast','language',['multilingual','natural','hypothesis','uncertainty'],dev,'VALIDATION');
add('test-natural-contrast','meaning',['exclusion','companions','natural','uncertainty'],[
 W('Brunch, bloss kein Überraschungsmenü.','Eigenes Überraschungsmenü ausgeschlossen.',[M('brunch'),X('food.option','Überraschungsmenü')]),
 W('Mein Sohn sucht einen Spielplatz.','Spielplatzwunsch ohne belegte Begleitung.',[A('playground'),person('Sohn')]),
 W('Wine bar for a chat, no live music.','Weinbar, Gespräch und Ausschluss statt Weinkonsum.',[R('offer.kind','WINE_BAR'),R('atmosphere.conversation','conversation_possible'),X('atmosphere.music','live_music')]),
 W('Dans un hôtel, juste la piscine pour la journée.','Hotelbaden als Tagesgast.',[R('offer.kind','HOTEL'),A('bathing'),R('participation.permission','public_day_access')]),
 W('Zu fünft essen, höchstens 130 zusammen.','Vollständige Gruppe und Gesamtgrenze, Währung offen.',[M(),count(5),cash(130,'LTE','REQUIRED',['a1'],'UNSPECIFIED'),scope('GROUP_TOTAL')]),
 W('Vor dem Bowling dort eine Suppe essen.','Reihenfolge Suppe vor Bowling am gleichen Ort.',[dish('Suppe'),A('Bowling',['a2'])],{sequence:[1,2],bindings:[same(1,2)],capability:true}),
 W('Mit meinem Vater wieder mal Tee trinken.','Tee mit Vater, mögliches Wiedersehen ohne neue Pflicht.',[D('Tee'),person('Vater')],{hypotheses:[{statement:'Vielleicht ist gemeinsame Zeit der Anlass.',evidence:[{quote:'wieder mal'}],status:'HYPOTHESIS'}]}),
 W('Für meine Frau ein Wow-Erlebnis.','Wow beschreibt noch keine konkrete Tätigkeit.',[person('Frau'),P('experience.character','Wow')],{...clarification('RECIPIENT_TASTE','Was könnte sie begeistern?',['Kulinarisches','Bewegung','Kreatives'],'Vorlieben unbekannt.'),uncertainties:[{description:'Wow benennt keine konkrete Vorliebe der Frau.',relatedIds:['p1']}]}),
],'TEST');
function calendarRows(split){const dev=split==='VALIDATION';const refs=dev?['2026-12-31T23:30:00Z','2028-02-28T22:30:00Z','2026-03-28T23:30:00Z','2026-10-24T22:30:00Z','2027-01-31T09:00:00Z','2027-04-30T08:00:00Z','2027-08-31T08:00:00Z','2027-09-04T08:00:00Z']:['2027-12-31T23:30:00Z','2028-02-29T09:00:00Z','2027-03-27T23:30:00Z','2027-10-30T22:30:00Z','2028-01-31T09:00:00Z','2028-04-30T08:00:00Z','2028-08-31T08:00:00Z','2028-09-03T08:00:00Z'];
 return refs.map((now,i)=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));const n=i%3;const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);const term=['heute','morgen','übermorgen'][n];const query=dev?[`Kaffee ${term}.`,`Tee ${term} mit Mama.`,`Bouldern ${term}.`,`${term} Minigolf spielen.`,`${term} Pizza essen.`,`${term} ins Museum.`,`${term} Kaffee und Kuchen.`,`${term} schwimmen.`][i]:[`${term} brunchen.`,`Sushi ${term}.`,`Ein Spielplatz ${term}.`,`Kino ${term}.`,`${term} Tischtennis.`,`${term} baden.`,`${term} Kaffee mit Papa.`,`${term} Bowling.`][i];const fs=dev?[[D('coffee')],[D('Tee'),person('Mutter')],[A('Bouldern')],[A('Minigolf')],[dish('Pizza')],[R('offer.kind','MUSEUM')],[D('coffee'),dish('Kuchen')],[A('swimming')]][i]:[[M('brunch')],[dish('Sushi')],[A('playground')],[R('offer.kind','CINEMA')],[A('table_tennis')],[A('bathing')],[D('coffee'),person('Vater')],[A('Bowling')]][i];return W(query,'Relative Tagesangabe nach lokalem Kalender normalisieren.',[...fs,date(d.toISOString().slice(0,10))],{reference:{now,timezone:'Europe/Zurich'}});});}
add('dev-calendar-contrast','time',['reference','year-month-change','local-midnight','dst'],calendarRows('VALIDATION'),'VALIDATION');
add('test-calendar-contrast','time',['reference','year-month-change','local-midnight','dst'],calendarRows('TEST'),'TEST');
export const contrastSpecs=Object.freeze(groups);
