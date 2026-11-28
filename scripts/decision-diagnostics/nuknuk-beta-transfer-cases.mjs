// Separately authored transfer compositions. No model output or production data.
// Assistant-authored; independent wording is not independent human adjudication.
const locales=['de','de-CH','en','fr'];
const q=(...values)=>Object.fromEntries(locales.map((locale,i)=>[locale,values[i]]));
const entity=(id,kind='ACTIVITY',members=[])=>({id,kind,label:id,members});
const f=(id,key,value,subjectIds=['visit'],modality='REQUIRED',basis='EXPLICIT')=>({id,key,value:typeof value==='string'?{text:value}:value,subjectIds,modality,basis});
const group=amount=>({amount,operator:'EQ',unit:'PEOPLE'});
const age=amount=>({amount,operator:'EQ',unit:'YEARS'});
const duration=(amount,measurementScope)=>({amount,operator:'LTE',unit:'MINUTES',measurementScope,includes:[]});
const money=(amount,currency='CHF')=>({amount,operator:'LTE',currency});
const empty={logic:null,bindings:[],extensions:[],uncertainties:[],weatherConditions:[]};
const m=(facts,entities=[entity('visit')],extra={})=>({...empty,entities,facts,...extra});
const childFacts=[f('kin','people.relationship','daughter',['child'],'CONTEXT'),f('age','people.age',age(4),['child'],'CONTEXT'),f('self','people.role','self',['me'],'CONTEXT'),f('adult','people.relationship','adult_accompanied',['child'],'CONTEXT','INFERRED'),f('suitable','condition.children','children_activity',['visit'],'REQUIRED','INFERRED')];
const childEntities=[entity('visit'),entity('child','PERSON'),entity('me','PERSON')];
export function betaTransferCases(){
 const specs=[];
 const add=(id,questions,expected,options={})=>specs.push({id,questions,expected,...options});
 add('exhibit-walk-party',q(
  'Wir sind acht und möchten eine Ausstellung sehen. Länger als zwölf Minuten wollen wir vom Ausgangspunkt aus nicht dorthin laufen.',
  'Mir sind acht und wänd e Usstellig aluege. Vom Startpunkt us wänd mir nöd länger als 12 Minute laufe.',
  'An exhibition for eight of us, please. Getting there on foot must take no more than twelve minutes from where we start.',
  'Nous serons huit pour voir une exposition. Depuis notre point de départ, la marche pour y aller ne doit pas dépasser douze minutes.'
 ),{meaning:m([f('purpose','experience.activity','exhibition'),f('party','people.count',group(8),['all'],'CONTEXT'),f('walk','time.duration',duration(12,'WALKING'))],[entity('visit'),entity('all','GROUP')])});
 add('rain-child-no-restaurants',q(
  'Es regnet hier. Mit meiner Tochter, sie ist vier, suche ich eine Beschäftigung im Gebäude. Restaurants kommen für diesen Ausflug nicht infrage.',
  'Da rägnet es. Ich suech öppis zum Mache mit minere vierjährige Tochter, aber dinne. Restaurants wänd mir für dä Usflug nöd.',
  'It is raining here. My daughter is four; I need something we can do indoors together. Please leave restaurants out of this outing.',
  'Il pleut ici. Ma fille a quatre ans et je cherche une activité à faire avec elle en intérieur. Écartons les restaurants pour cette sortie.'
 ),{meaning:m([f('purpose','experience.activity','offene Entdeckung'),f('inside','offer.area','indoor'),f('no-dining','offer.kind','RESTAURANT',['visit'],'EXCLUDED'),...childFacts],childEntities,{weatherConditions:[{id:'rain',role:'CONTEXT',state:'RAIN',basis:'EXPLICIT',subjectIds:[],detail:null}]})});
 add('adult-gift-pottery',q(
  'Ein Geschenk für meine 28-jährige Tochter: ein Keramikkurs. Pro Person darf er höchstens 83 Franken kosten.',
  'Für mini 28-jährigi Tochter suech ich en Töpferkurs als Gschenk. Pro Person söll er nöd meh als 83 Franke choschte.',
  'A pottery course would be a gift for my daughter, who is 28. Keep the cost at CHF 83 or less per person.',
  'Pour ma fille de 28 ans, je voudrais offrir un cours de céramique. Le prix doit rester à 83 CHF maximum par personne.'
 ),{meaning:m([f('purpose','experience.activity','ceramics_course'),f('kin','people.relationship','daughter',['recipient'],'CONTEXT'),f('age','people.age',age(28),['recipient'],'CONTEXT'),f('recipient-role','people.role','recipient',['recipient'],'CONTEXT'),f('occasion','experience.occasion','Geschenk',['visit'],'CONTEXT'),f('price','budget.maximum',money(83)),f('scope','budget.scope',{scope:'PER_PERSON'},['visit'],'CONTEXT')],[entity('visit'),entity('recipient','PERSON')])});
 add('gluten-subgroup-soft-quiet',q(
  'Neun Leute zum Abendessen. Nur zwei brauchen glutenfreie Optionen. Wenn es dort ruhig wäre, wäre das schön, ist aber kein Muss.',
  'Mir sind nün fürs Znacht. Nur zwei bruuched glutefreii Optione. Es ruhigs Umfeld wär schön, isch aber kei Pflicht.',
  'Dinner for nine. Two of us need gluten-free options; the rest do not. A quiet setting would be a bonus rather than a requirement.',
  'Un dîner pour neuf personnes. Seules deux ont besoin d’options sans gluten. Le calme serait un plus, sans être indispensable.'
 ),{meaning:m([f('purpose','food.meal','dinner'),f('party','people.count',group(9),['all'],'CONTEXT'),f('subset','people.count',group(2),['some'],'CONTEXT'),f('diet','food.diet','gluten_free',['some']),f('quiet','atmosphere.noise','quiet',['visit'],'PREFERRED')],[entity('visit'),entity('all','GROUP',['some']),entity('some','GROUP')])});
 add('vegan-whole-bill',q(
  'Sieben Personen essen gemeinsam, davon vier vegan. Die Rechnung für das Essen darf für uns alle zusammen 176 Franken nicht übersteigen.',
  'Z sibt öppis ässe, vier vo üs bruuched vegani Optione. Für s Esse vo allne zäme wänd mir höchstens 176 Franke zahle.',
  'Seven of us are having a meal, and four need vegan options. The entire food bill for all seven must stay within CHF 176.',
  'Nous mangerons à sept, dont quatre personnes ayant besoin d’options véganes. La facture du repas pour les sept doit rester à 176 CHF maximum.'
 ),{meaning:m([f('purpose','food.meal','meal'),f('party','people.count',group(7),['all'],'CONTEXT'),f('subset','people.count',group(4),['some'],'CONTEXT'),f('diet','food.diet','vegan',['some']),f('price','budget.maximum',money(176)),f('scope','budget.scope',{scope:'GROUP_TOTAL'},['visit'],'CONTEXT')],[entity('visit'),entity('all','GROUP',['some']),entity('some','GROUP')])});
 add('cinema-pasta-second-budget',q(
  'Wir wollen erst einen Film im Kino sehen und anschliessend dort Pasta essen. Nur für die Pasta gilt ein Limit von 21 Euro pro Person.',
  'Zerscht is Kino, dänn det Pasta ässe. Nur für d Pasta gälted höchstens 21 Euro pro Person.',
  'A cinema film first, followed by pasta at the same place. The pasta part alone has a EUR 21 limit per person.',
  'Une séance de cinéma, puis des pâtes au même endroit. Pour les pâtes seulement, le plafond est de 21 euros par personne.'
 ),{meaning:m([f('film','experience.activity','cinema'),f('pasta','food.dish','Pasta',['after']),f('price','budget.maximum',money(21,'EUR'),['after']),f('scope','budget.scope',{scope:'PER_PERSON'},['after'],'CONTEXT')],[entity('visit'),entity('after')],{bindings:[{kind:'SEQUENCE',factIds:['film','pasta']},{kind:'SAME_PLACE',factIds:['film','pasta']}]})});
 add('snow-museum-morning',q(
  'Bei uns liegt gerade Schnee. Ein Museum am Vormittag wäre mein Plan; den Besuchstag habe ich noch nicht gewählt.',
  'Bi üs hät es grad Schnee. Ich möcht am Vormittag es Museum bsueche; de Tag isch no nöd bestimmt.',
  'There is snow here at the moment. I would like a museum visit in the morning, with the day still undecided.',
  'Il y a de la neige ici actuellement. Je voudrais visiter un musée le matin ; je n’ai pas encore choisi le jour.'
 ),{meaning:m([f('purpose','offer.kind','MUSEUM'),f('phase','time.day_phase',{phase:'MORNING',timezone:'Europe/Zurich'})],[entity('visit')],{weatherConditions:[{id:'snow',role:'CONTEXT',state:'SNOW',basis:'EXPLICIT',subjectIds:[],detail:null}]})});
 add('dry-swim-else-pottery',q(
  'Wenn es trocken ist, möchte ich draussen schwimmen. Ansonsten besuche ich einen Keramikkurs.',
  'Wänn es troche isch, will ich dusse go schwümme. Suscht bsuech ich en Töpferkurs.',
  'If the weather is dry, I want to swim outdoors. Otherwise, I will take a pottery course.',
  'Si le temps est sec, je veux nager en extérieur. Sinon, je suivrai un cours de céramique.'
 ),{meaning:m([f('swim','experience.activity','swimming'),f('outside','offer.area','outdoor'),f('pottery','experience.activity','ceramics_course',['after'])],[entity('visit'),entity('after')],{logic:{kind:'IF',conditionFactId:'dry',then:{kind:'ALL',children:[{kind:'FACT',factId:'swim'},{kind:'FACT',factId:'outside'}]},else:{kind:'FACT',factId:'pottery'}},weatherConditions:[{id:'dry',role:'CONDITIONAL',state:'DRY',basis:'EXPLICIT',subjectIds:[],detail:null}]})});
 add('optional-outside-quiet-tomorrow',q(
  'Morgen einen Tee trinken, eine ruhige Umgebung ist zwingend. Ob wir draussen sitzen können, ist völlig egal, es ist aber erlaubt.',
  'Morn en Tee trinke, es muess zwingend ruhig sii. Dusse sitze wär erlaubt, isch üs aber völlig egal.',
  'Tea tomorrow; a quiet setting is mandatory. Outdoor seating is fine but entirely unnecessary.',
  'Un thé demain ; le calme est impératif. S’asseoir dehors est acceptable, mais cela n’a aucune importance.'
 ),{meaning:m([f('purpose','food.drink','tea'),f('quiet','atmosphere.noise','quiet'),f('outside','offer.area','outdoor',['visit'],'NOT_REQUIRED'),f('date','time.date',{date:'2027-04-01',operator:'EQ',timezone:'Europe/Zurich'})])},{reference:{now:'2027-03-31T19:20:00Z',timezone:'Europe/Zurich'}});
 add('meal-no-cinema-site',q(
  'Für uns sechs suche ich etwas zum Essen. Im ganzen Betrieb soll es kein Kino geben.',
  'Für üs sächs suech ich öppis zum Ässe. Im ganze Betrieb söll es kei Kino gäh.',
  'Find a meal for six of us at a venue with no cinema anywhere on the premises.',
  'Je cherche un repas pour six dans un établissement sans aucun cinéma sur le site.'
 ),{meaning:m([f('purpose','food.meal','meal'),f('party','people.count',group(6),['all'],'CONTEXT'),f('ban','offer.kind','CINEMA',['visit'],'EXCLUDED')],[entity('visit'),entity('all','GROUP')])});
 add('exhibition-no-own-swim',q(
  'Ich möchte eine Ausstellung sehen, selbst aber auf keinen Fall schwimmen. Ein Schwimmbad am selben Ort würde mich nicht stören.',
  'Ich will e Usstellig aluege, aber selber sicher nöd schwümme. Es Schwümmbad det würd mi nöd störe.',
  'I want to see an exhibition, and I will not swim myself. A swimming pool at the same venue would not bother me.',
  'Je souhaite voir une exposition, mais je refuse de nager moi-même. Une piscine sur le même site ne me dérangerait pas.'
 ),{meaning:m([f('purpose','experience.activity','exhibition',['visit','me']),f('self-role','people.role','self',['me'],'CONTEXT'),f('refusal','experience.activity','swimming',['me'],'EXCLUDED')],[entity('visit'),entity('me','PERSON')])});
 add('walk-in-workshop-duration',q(
  'Ein Workshop ohne Voranmeldung ist mir wichtig. Der Workshop selbst darf höchstens 67 Minuten dauern; die Fahrtzeit zählt nicht mit.',
  'En Workshop, wo ich ohni Voramäldig cha mitmache. De Workshop selber dörf höchstens 67 Minute duure, d Fahrt chunnt extra.',
  'I need a workshop that accepts walk-ins. The workshop itself must last no more than 67 minutes, excluding the journey.',
  'Il me faut un atelier accessible sans réservation préalable. L’atelier lui-même doit durer au maximum 67 minutes, trajet non compris.'
 ),{meaning:m([f('purpose','experience.activity','workshop'),f('booking','participation.booking','spontaneous'),f('duration','time.duration',duration(67,'ACTIVITY'))])});
 add('ambiguous-budget-five',q(
  'Bowling für fünf. Dafür ist die Obergrenze 92 Euro; wie der Betrag aufzuteilen ist, habe ich noch nicht gesagt.',
  'Mir wänd z füft go bowle. D Obergränze isch 92 Euro; wie de Betrag verteilt wird, han ich no nöd gseit.',
  'Bowling for five. The cap is EUR 92, and I have not specified whether that is per person or shared.',
  'Du bowling pour cinq. Le plafond est de 92 euros ; je n’ai pas précisé s’il est individuel ou commun.'
 ),{meaning:m([f('purpose','experience.activity','bowling'),f('party','people.count',group(5),['all'],'CONTEXT'),f('price','budget.maximum',money(92,'EUR')),f('scope','budget.scope',{scope:'UNSPECIFIED'},['visit'],'CONTEXT')],[entity('visit'),entity('all','GROUP')]),clarification:{question:'Gilt die Grenze pro Person oder für die ganze Gruppe?',dimension:'BUDGET',options:['Pro Person','Für die ganze Gruppe']}},{localizedClarification:true});
 const previous=m([f('purpose','experience.activity','exhibition')]);
 add('dialogue-new-time-and-money',q(
  'Noch zwei Grenzen dazu: insgesamt nur 81 Minuten Zeit und höchstens 27 Franken pro Person.',
  'No zwei Gränze dezue: insgesamt nur 81 Minute Ziit und höchstens 27 Franke pro Person.',
  'Add two limits: only 81 minutes in total and a maximum of CHF 27 per person.',
  'Ajoute deux limites : seulement 81 minutes au total et 27 CHF maximum par personne.'
 ),{changes:[],additions:m([f('time-new','time.duration',duration(81,'AVAILABLE_TOTAL')),f('money-new','budget.maximum',money(27)),f('scope-new','budget.scope',{scope:'PER_PERSON'},['visit'],'CONTEXT')],[])},{previousMeaning:previous,initial:q('Eine Ausstellung besuchen.','E Usstellig bsueche.','Visit an exhibition.','Visiter une exposition.')});
 const before=m([f('purpose','food.drink','coffee'),f('booking','participation.booking','spontaneous')]);
 const remove=q('Ohne Anmeldung ist keine Bedingung mehr. Dafür müssen wir drinnen sitzen.','Ohni Aamäldig isch kei Bedingig meh. Dafür müend mir dinne sitze.','Drop the walk-in requirement. We do need indoor seating now.','L’accès sans réservation n’est plus obligatoire. En revanche, nous devons nous asseoir en intérieur.');
 add('dialogue-remove-and-add',remove,{changes:[{id:'booking',quote:remove.de,fact:null}],additions:m([f('area-new','offer.area','indoor')],[])},{previousMeaning:before,initial:q('Kaffee ohne Voranmeldung trinken.','Kafi ohni Voramäldig trinke.','Have coffee without advance booking.','Boire un café sans réservation préalable.'),localizedQuotes:true});
 add('dialogue-add-scoped-second-part',q(
  'Nach der Ausstellung am selben Ort noch Kaffee trinken. Für diesen zweiten Teil höchstens 11 Franken pro Person.',
  'Nach de Usstellig am gliiche Ort no Kafi trinke. Nur für dä zweiti Teil höchstens 11 Franke pro Person.',
  'After the exhibition, have coffee at that same place. Only the second part has a limit of CHF 11 per person.',
  'Après l’exposition, boire un café au même endroit. Pour cette seconde partie seulement, 11 CHF maximum par personne.'
 ),{changes:[],additions:m([f('coffee-new','food.drink','coffee',['after']),f('price-new','budget.maximum',money(11),['after']),f('scope-new','budget.scope',{scope:'PER_PERSON'},['after'],'CONTEXT')],[entity('after')],{bindings:[{kind:'SEQUENCE',factIds:['purpose','coffee-new']},{kind:'SAME_PLACE',factIds:['purpose','coffee-new']}]})},{previousMeaning:previous,initial:q('Eine Ausstellung besuchen.','E Usstellig bsueche.','Visit an exhibition.','Visiter une exposition.')});
 return specs.flatMap(spec=>locales.map(locale=>{
  const expected=structuredClone(spec.expected);
  if(spec.localizedQuotes)expected.changes[0].quote=spec.questions[locale];
  if(spec.localizedClarification)expected.clarification={question:q('Gilt die Grenze pro Person oder für die ganze Gruppe?','Gilt d Gränze pro Person oder für di ganz Gruppe?','Is the limit per person or for the whole group?','Le plafond est-il par personne ou pour tout le groupe ?')[locale],dimension:'BUDGET',options:q(['Pro Person','Für die ganze Gruppe'],['Pro Person','Für di ganz Gruppe'],['Per person','For the whole group'],['Par personne','Pour tout le groupe'])[locale]};
  return {id:`beta-transfer-${spec.id}-${locale}`,familyId:`beta-transfer-${spec.id}`,scenarioGroup:`beta-transfer-${spec.id}`,split:'TRANSFER',locale,theme:'separately-worded-transfer',transferKind:spec.id==='ambiguous-budget-five'?'PARAPHRASE_OF_KNOWN_OPERATION':'NEW_COMPOSITION_OF_KNOWN_OPERATIONS',task:spec.previousMeaning?'DIALOGAKTUALISIERUNG_V3':'COMPACT_SEARCH_V7',query:spec.initial?.[locale]??spec.questions[locale],reference:spec.reference??{now:'2027-05-17T10:15:00Z',timezone:'Europe/Zurich'},expected,...(spec.previousMeaning?{previousMeaning:structuredClone(spec.previousMeaning),turns:[{question:null,answer:spec.questions[locale]}]}:{}),critical:true,review:'Separate transfer composition; source facts only, no invented constraints.',provenance:{kind:'AUTHORED_SYNTHETIC',modelResponsesUsed:false,independentHumanGold:false,independentAuthor:false},readiness:'PENDING_ASTRA_AND_NATIVE_ADJUDICATION'};
 }));
}
