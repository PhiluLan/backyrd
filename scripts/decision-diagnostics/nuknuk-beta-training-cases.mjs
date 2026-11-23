// Authored synthetic curriculum. No model calls, real users or inferred spot facts.
import {createHash} from 'node:crypto';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {betaGraphHash} from './nuknuk-beta-semantics.mjs';
import {productTrainingCases} from './nuknuk-product-training-cases.mjs';
const locales=['de','de-CH','en','fr'];
const REF={now:'2027-02-03T09:00:00Z',timezone:'Europe/Zurich'};
const R=(key,value,subjectIds=['a1'])=>({key,value:typeof value==='string'?{text:value}:value,modality:'REQUIRED',subjectIds,basis:'EXPLICIT'});
const C=(key,value,subjectIds=['a1'],basis='EXPLICIT')=>({...R(key,value,subjectIds),modality:'CONTEXT',basis});
const P=(key,value,subjectIds=['a1'])=>({...R(key,value,subjectIds),modality:'PREFERRED'});
const E=(id,kind='ACTIVITY',members=[])=>({id,kind,label:id,members});
const date=value=>({date:value,operator:'EQ',timezone:REF.timezone});
const duration=(amount,measurementScope='AVAILABLE_TOTAL',includes=[])=>({amount,operator:'LTE',unit:'MINUTES',measurementScope,includes});
const count=amount=>({amount,operator:'EQ',unit:'PEOPLE'});
const clock=(time,operator='EQ')=>({time,operator,timezone:REF.timezone});
const phase=value=>({phase:value,timezone:REF.timezone});
const money=(amount=38,operator='LTE',currency='CHF')=>({amount,operator,currency});
const text=(de,ch,en,fr)=>Object.fromEntries(locales.map((l,i)=>[l,[de,ch,en,fr][i]]));
const and=(...factIds)=>({kind:'ALL',children:factIds.map(factId=>({kind:'FACT',factId}))});
const fact=(f,i)=>({id:'f'+(i+1),...f});
const meaning=(facts,extra={})=>({entities:[E('a1')],facts:facts.map(fact),logic:null,bindings:[],extensions:[],uncertainties:[],weatherConditions:[],...extra});
const act=(id,key,value,phrases)=>({id,key,value,phrases});
const foods=[
 act('coffee','food.drink','coffee',text('Kaffee trinken','Kafi trinke','have coffee','boire un café')),
 act('tea','food.drink','tea',text('Tee trinken','Tee trinke','have tea','boire un thé')),
 act('drinks','food.drink','drinks',text('etwas trinken','öppis trinke','have a drink','prendre une boisson')),
 act('breakfast','food.meal','breakfast',text('frühstücken','zmörgele','have breakfast','prendre le petit-déjeuner')),
 act('lunch','food.meal','lunch',text('Mittagessen gehen','go zmittag ässe','have lunch','déjeuner')),
 act('dinner','food.meal','dinner',text('Abendessen gehen','go znacht ässe','have dinner','dîner')),
 act('meal','food.meal','meal',text('etwas essen','öppis ässe','have a meal','manger quelque chose')),
 act('pizza','food.dish','Pizza',text('Pizza essen','Pizza ässe','eat pizza','manger une pizza')),
 act('pasta','food.dish','Pasta',text('Pasta essen','Pasta ässe','eat pasta','manger des pâtes')),
 act('sushi','food.dish','Sushi',text('Sushi essen','Sushi ässe','eat sushi','manger des sushis')),
];
const activities=[
 act('cinema','experience.activity','cinema',text('ins Kino gehen','is Kino go','go to the cinema','aller au cinéma')),
 act('billiards','experience.activity','billiards',text('Billard spielen','Billard spiele','play billiards','jouer au billard')),
 act('swimming','experience.activity','swimming',text('schwimmen gehen','go schwümme','go swimming','aller nager')),
 act('bowling','experience.activity','bowling',text('Bowling spielen','go bowle','go bowling','jouer au bowling')),
 act('mini-golf','experience.activity','mini_golf',text('Minigolf spielen','Minigolf spiele','play mini golf','jouer au minigolf')),
 act('museum','offer.kind','MUSEUM',text('ein Museum besuchen','es Museum bsueche','visit a museum','visiter un musée')),
 act('exhibition','experience.activity','exhibition',text('eine Ausstellung besuchen','e Usstellig bsueche','visit an exhibition','visiter une exposition')),
 act('walking','experience.activity','walking',text('spazieren gehen','go spaziere','go for a walk','faire une promenade')),
 act('ceramics','experience.activity','ceramics_course',text('einen Keramikkurs besuchen','en Töpferkurs bsueche','take a pottery course','suivre un cours de céramique')),
 act('workshop','experience.activity','workshop',text('einen Workshop besuchen','en Workshop bsueche','attend a workshop','participer à un atelier')),
];
const ask=(a,tail=text('','','',''))=>Object.fromEntries(locales.map(l=>[l,({de:'Ich möchte ', 'de-CH':'Ich möcht ',en:'I would like to ',fr:'Je voudrais '})[l]+a.phrases[l]+tail[l]+'.']));
const fs=a=>R(a.key,a.value);
const checklist=['Erhalte alle ausdrücklich genannten Bedingungen und ihre Modalität.','Keine ungenannten Orte, Preise, Termine, Altersgrenzen oder Spotfakten ergänzen.'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const directionQuestion=l=>({question:text('Welche Richtung würde der Person am ehesten Freude machen?','Weli Richtig würd dere Person am ehschte Freud mache?','What kind of experience would the recipient enjoy most?','Quel type d’expérience ferait le plus plaisir à cette personne ?')[l],dimension:'EXPERIENCE_DIRECTION',options:text(['Kultur entdecken','Kreativ werden','Essen geniessen'],['Kultur entdecke','Kreativ werde','Esse gnüsse'],['Explore culture','Get creative','Enjoy food'],['Découvrir la culture','Créer quelque chose','Savourer un repas'])[l]});

export function betaTrainingFamilies(){
 const families=[];
 function add(theme,id,queries,target,{critical=false,notes='',localeTargets=null,task='COMPACT_SEARCH_V7',previousMeaning=null,turns=null}={}){
  families.push({id:`beta1-${theme}-${id}`,theme,queries,target,localeTargets,critical,notes,task,previousMeaning,turns,reference:REF,review:checklist.join(' ')+' '+notes});
 }
 for(const a of foods)for(const context of ['plain','indoor','cozy']){
  const suffix=context==='plain'?text('','','',''):context==='indoor'?text(', unbedingt drinnen',', unbedingt dinne',', indoors only',", uniquement à l’intérieur"):text(', möglichst gemütlich',', am liebschte gmüetlich',', preferably somewhere cozy',', de préférence dans une ambiance chaleureuse');
  add('food-retention',a.id+'-'+context,ask(a,suffix),{meaning:meaning([fs(a),...(context==='indoor'?[R('offer.area','indoor')]:context==='cozy'?[P('atmosphere.character','cozy')]:[])])},{notes:'Ein einfacher Suchzweck; keine zusätzliche Mahlzeit, Kategorie oder Rückfrage.'});
 }
 for(const a of activities)for(const context of ['plain','tomorrow','basel']){
  const suffix=context==='plain'?text('','','',''):context==='tomorrow'?text(' und zwar morgen',' und zwar morn',' tomorrow',' demain'):text(' in Basel',' in Basel',' in Basel',' à Bâle');
  add('activity-retention',a.id+'-'+context,ask(a,suffix),{meaning:meaning([fs(a),...(context==='tomorrow'?[R('time.date',date('2027-02-04'))]:context==='basel'?[R('location.destination','Basel')]:[])])},{notes:'Konkrete Tätigkeit erhalten; Angebotstyp oder Kurs nicht durch generische Entdeckung ersetzen.'});
 }
 const relatives=[
 ['uncle',text('meinem Onkel','mim Onkel','my uncle','mon oncle'),text('Onkel','Onkel','uncle','oncle'),42],
 ['aunt',text('meiner Tante','minere Tante','my aunt','ma tante'),text('Tante','Tante','aunt','tante'),53],
 ['father',text('meinem Vater','mim Vater','my father','mon père'),text('Vater','Vater','father','père'),62],
 ['mother',text('meiner Mutter','minere Mueter','my mother','ma mère'),text('Mutter','Mueter','mother','mère'),68],
 ['sister',text('meiner Schwester','minere Schwöster','my sister','ma sœur'),text('Schwester','Schwöster','sister','sœur'),26],
 ['brother',text('meinem Bruder','mim Brüeder','my brother','mon frère'),text('Bruder','Brüeder','brother','frère'),31],
 ['friend-m',text('einem Freund von mir','eme Fründ vo mir','a male friend of mine','un ami à moi'),text('Freund','Fründ','male friend','ami'),29],
 ['friend-f',text('einer Freundin von mir','ere Fründin vo mir','a female friend of mine','une amie à moi'),text('Freundin','Fründin','female friend','amie'),34],
 ['daughter',text('meiner Tochter','minere Tochter','my daughter','ma fille'),text('Tochter','Tochter','daughter','fille'),7],
 ['son',text('meinem Sohn','mim Sohn','my son','mon fils'),text('Sohn','Sohn','son','fils'),11],
 ];
 for(const [id,forms,labels,years]of relatives)for(const mode of ['companion','recipient','age']){
  const openRecipient=mode==='recipient'&&['uncle','aunt','father','mother','sister'].includes(id);
  const a=mode==='recipient'?activities[8]:activities[6];
  const queries=Object.fromEntries(locales.map(l=>[l,mode==='recipient'?({de:`Ich suche einen Keramikkurs als Geschenk für ${forms[l].replace(/meinem /,'meinen ').replace(/meiner /,'meine ').replace(/^einem /,'einen ').replace(/^einer /,'eine ')}.`, 'de-CH':`Ich suech en Töpferkurs als Gschenk für ${forms[l].replace(/^mim /,'min ').replace(/^minere /,'mini ').replace(/^eme /,'en ').replace(/^ere /,'e ')}.`,en:`I want a pottery course as a gift for ${forms[l]}.`,fr:`Je cherche un cours de céramique comme cadeau pour ${forms[l]}.`})[l]
   :mode==='age'?({de:`Ich möchte mit ${forms[l]} eine Ausstellung besuchen. Diese Person ist ${years} Jahre alt.`, 'de-CH':`Ich möcht mit ${forms[l]} e Usstellig bsueche. Die Person isch ${years} Jahr alt.`,en:`I want to visit an exhibition with ${forms[l]}, who is ${years} years old.`,fr:`Je voudrais visiter une exposition avec ${forms[l]}, qui a ${years} ans.`})[l]
   :({de:`Ich möchte mit ${forms[l]} eine Ausstellung besuchen.`, 'de-CH':`Ich möcht mit ${forms[l]} e Usstellig bsueche.`,en:`I want to visit an exhibition with ${forms[l]}.`,fr:`Je voudrais visiter une exposition avec ${forms[l]}.`})[l]]));
  if(openRecipient)for(const l of locales)queries[l]=({de:`Ich suche etwas Besonderes als Geschenk für ${forms[l].replace(/meinem /,'meinen ').replace(/meiner /,'meine ').replace(/^einem /,'einen ').replace(/^einer /,'eine ')}. Die Richtung ist noch offen.`, 'de-CH':`Ich suech öppis Bsunders als Gschenk für ${forms[l].replace(/^mim /,'min ').replace(/^minere /,'mini ').replace(/^eme /,'en ').replace(/^ere /,'e ')}. D Richtig isch no offe.`,en:`I want a special experience as a gift for ${forms[l]}. I do not know what kind yet.`,fr:`Je cherche une expérience spéciale comme cadeau pour ${forms[l]}. Le type d’expérience reste à choisir.`})[l];
  const make=l=>({...(openRecipient?{clarification:directionQuestion(l)}:{}),meaning:meaning([...(openRecipient?[R('experience.activity','offene Entdeckung'),P('experience.character','besonders')]:[fs(a)]),C('people.relationship',labels[l],['p1']),...(mode==='recipient'?[C('people.role','recipient',['p1']),C('experience.occasion','Geschenk')]:[C('people.role','self',['self'])]),...(mode==='age'?[C('people.age',{amount:years,operator:'EQ',unit:'YEARS'},['p1']),...(years<18?[C('people.relationship','adult_accompanied',['p1'],'INFERRED')]:[])]:[])],{entities:[E('a1'),E('p1','PERSON'),...(mode==='recipient'?[]:[E('self','PERSON')])]})});
  add('people-roles',id+'-'+mode,queries,make('de'),{critical:true,localeTargets:Object.fromEntries(locales.map(l=>[l,make(l)])),notes:'Einzelne Person als PERSON; Beziehung nicht austauschen. Geschenkempfänger ist kein automatisch Mitreisender. Altersangabe gehört genau dieser Person.'});
 }
 const needs=[['vegan','food.diet','vegan',text('vegane Optionen','vegani Optione','vegan options','des options véganes'),foods[6]],['vegetarian','food.diet','vegetarian',text('vegetarische Optionen','vegetarischi Optione','vegetarian options','des options végétariennes'),foods[6]],['gluten','food.diet','gluten_free',text('glutenfreie Optionen','glutefreii Optione','gluten-free options','des options sans gluten'),foods[6]],['lactose','food.diet','lactose_free',text('laktosefreie Optionen','laktosefreii Optione','lactose-free options','des options sans lactose'),foods[6]],['alcohol','food.drink','alkoholfreie Getränke',text('alkoholfreie Getränke','alkoholfreii Getränk','alcohol-free drinks','des boissons sans alcool'),foods[2]],['access','participation.accessibility','step_free',text('stufenlosen Zugang','stufelose Zuegang','step-free access','un accès sans marches'),activities[6]]];
 for(const [needIndex,[id,key,value,label,a]]of needs.entries())for(const [scopeIndex,scope]of ['subset','all','self','preferred','subset-indoor'].entries()){
  const total=[3,4,6,7,8,5][(needIndex+scopeIndex)%6],n=2+(needIndex*3+scopeIndex)%Math.min(total-2,3),pref=scope==='preferred';
  const noun=label.fr.replace(/^des /,'');const frNeed=label.fr.startsWith('un ')?'d’un '+label.fr.slice(3):/^[aeiouyéèêàâîôûœ]/iu.test(noun)?'d’'+noun:'de '+noun;
  const base=ask(a);const q=Object.fromEntries(locales.map(l=>[l,({de:`${base[l]} Wir sind ${total}. ${scope==='all'?`Alle ${total} brauchen ${label[l]}`:scope==='self'?`Nur ich brauche ${label[l]}, die anderen haben diese Anforderung nicht`:pref?`${n} von uns hätten am liebsten ${label[l]}`:`${n} von uns ${n===1?'braucht':'brauchen'} ${label[l]}`}${scope==='subset-indoor'?'. Der gemeinsame Besuch muss drinnen sein':''}.`,
   'de-CH':`${base[l]} Mir sind ${total}. ${scope==='all'?`Alli ${total} bruuched ${label[l]}`:scope==='self'?`Nur ich bruuche ${label[l]}, di andere händ die Aaforderig nöd`:pref?`${n} vo üs hätted am liebschte ${label[l]}`:`${n} vo üs ${n===1?'brucht':'bruuched'} ${label[l]}`}${scope==='subset-indoor'?'. De gmeinsami Bsuech muess dinne sii':''}.`,
   en:`${base[l]} There are ${total} of us. ${scope==='all'?`All ${total} need ${label[l]}`:scope==='self'?`Only I need ${label[l]}; the others do not have this requirement`:pref?`${n} of us would prefer ${label[l]}`:`${n} of us ${n===1?'needs':'need'} ${label[l]}`}${scope==='subset-indoor'?'. Our shared visit must be indoors':''}.`,
   fr:`${base[l]} Nous sommes ${total}. ${scope==='all'?`Les ${total} personnes ont besoin ${frNeed}`:scope==='self'?`Moi seul ai besoin ${frNeed}; les autres n’ont pas cette exigence`:pref?`${n} personnes du groupe préfèrent ${label[l]}`:`${n===1?'Une personne du groupe a':n+' personnes du groupe ont'} besoin ${frNeed}`}${scope==='subset-indoor'?'. Notre visite commune doit être en intérieur':''}.`})[l]]));
  const subset=!['all','self'].includes(scope),person=scope==='self',whom=scope==='all'?'g1':person?'self':'g2';
  add('subgroup-scope',id+'-'+scope,q,{meaning:meaning([fs(a),C('people.count',count(total),['g1']),...(subset?[C('people.count',count(n),['g2'])]:[]),...(person?[C('people.role','self',['self'])]:[]),{...R(key,value,[whom]),modality:pref?'PREFERRED':'REQUIRED'},...(scope==='subset-indoor'?[R('offer.area','indoor')]:[])],{entities:[E('a1'),E('g1','GROUP',subset?['g2']:person?['self']:[]),...(subset?[E('g2','GROUP')]:person?[E('self','PERSON')]:[])]})},{critical:true,notes:'Teilgruppe weder auf alle übertragen noch zusätzlich zur Gesamtzahl addieren. Keine Allergiesicherheit oder medizinische Eignung behaupten.'});
 }
 const ops=[['LT',text('unter','under','under','moins de')],['LTE',text('höchstens','höchstens','at most','au plus')],['GTE',text('mindestens','mindischtens','at least','au moins')],['GT',text('mehr als','meh als','more than','plus de')]];
 for(const [opIndex,[op,word]]of ops.entries())for(const soft of [false,true])for(const scope of ['PER_PERSON','GROUP_TOTAL']){
  const amount=[32,47,58,73][(opIndex+(soft?2:0))%4],partySize=[3,4,6,5][(opIndex+(soft?1:0))%4];
  const tail=text(` Wir sind ${partySize}. Für das Essen möchte ich ${soft?'bevorzugt ':''}${scope==='GROUP_TOTAL'?'zusammen ':''}${word.de} ${amount} Franken${scope==='PER_PERSON'?' pro Person':''} ausgeben.`,` Mir sind ${partySize}. Für s Esse möcht ich ${soft?'am liebschte ':''}${scope==='GROUP_TOTAL'?'zäme ':''}${word['de-CH']} ${amount} Franke${scope==='PER_PERSON'?' pro Person':''} usgäh.`,` There are ${partySize} of us. For the meal, I want to spend ${soft?'preferably ':''}${scope==='GROUP_TOTAL'?'in total ':''}${word.en} CHF ${amount}${scope==='PER_PERSON'?' per person':''}.`,` Nous sommes ${partySize}. Pour le repas, je souhaite dépenser ${soft?'de préférence ':''}${scope==='GROUP_TOTAL'?'au total ':''}${word.fr} ${amount} CHF${scope==='PER_PERSON'?' par personne':''}.`);
  add('budget',`${op}-${soft?'preferred':'hard'}-${scope}`,Object.fromEntries(locales.map(l=>[l,ask(foods[5])[l]+tail[l]])),{meaning:meaning([fs(foods[5]),C('people.count',count(partySize),['g1']),{...R('budget.maximum',money(amount,op)),modality:soft?'PREFERRED':'REQUIRED'},C('budget.scope',{scope})],{entities:[E('a1'),E('g1','GROUP')]})},{critical:true,notes:'Richtung, strenge Grenze, Währung und Gruppen-/Personenumfang getrennt; Präferenz nicht verhärten.'});
 }
 for(const [i,[a,b]]of [[activities[3],foods[6]],[activities[5],foods[0]]].entries())for(const component of [0,1])for(const soft of [false,true]){
  const target=component===0?a:b,amount=component===0?29:17;
  const q=text(`Erst ${a.phrases.de}, danach ${b.phrases.de}. Nur für den ${component===0?'ersten':'zweiten'} Teil ${soft?'möglichst ':''}höchstens ${amount} Franken pro Person.`,`Zerscht ${a.phrases['de-CH']}, dänn ${b.phrases['de-CH']}. Nur für de ${component===0?'erschte':'zweite'} Teil ${soft?'am liebschte ':''}höchstens ${amount} Franke pro Person.`,`First ${a.phrases.en}, then ${b.phrases.en}. For the ${component===0?'first':'second'} part only, ${soft?'preferably ':''}at most CHF ${amount} per person.`,`D’abord ${a.phrases.fr}, puis ${b.phrases.fr}. Pour la ${component===0?'première':'deuxième'} partie seulement, ${soft?'de préférence ':''}au plus ${amount} CHF par personne.`);
  add('budget',`component-${i}-${component}-${soft}`,q,{meaning:meaning([fs(a),R(b.key,b.value,['a2']),{...R('budget.maximum',money(amount),[component===0?'a1':'a2']),modality:soft?'PREFERRED':'REQUIRED'},C('budget.scope',{scope:'PER_PERSON'},[component===0?'a1':'a2'])],{entities:[E('a1'),E('a2')],bindings:[{kind:'SEQUENCE',factIds:['f1','f2']}]})},{critical:true,notes:`Budget gehört nur zur ${target.id}-Aktivität; kein gemeinsamer Ort oder zweites Budget erfunden.`});
 }
 const budgetWords=[
 ['cheap',text('Bitte möglichst günstig.','Bitte möglichts günstig.','Preferably inexpensive.','De préférence bon marché.'),P('budget.qualitative','günstig')],
 ['not-cheap',text('Günstig ist mir nicht wichtig.','Günstig isch mer nöd wichtig.','Cheapness is not important to me.','Le prix bas ne m’importe pas.'),{...R('budget.qualitative','günstig'),modality:'NOT_REQUIRED'}],
 ['unknown-amount',text('Gerne günstig, einen Betrag kann ich noch nicht nennen.','Gern günstig, en Betrag weiss ich no nöd.','Preferably inexpensive; I cannot specify an amount yet.','De préférence bon marché ; je ne peux pas encore donner de montant.'),P('budget.qualitative','günstig')],
 ['expensive-okay',text('Es muss nicht günstig sein.','Es muess nöd günstig sii.','It does not have to be cheap.','Cela ne doit pas forcément être bon marché.'),{...R('budget.qualitative','günstig'),modality:'NOT_REQUIRED'}],
 ['no-limit',text('Ich habe keine Preisgrenze festgelegt.','Ich han kei Priisgränze festgleit.','I have not set a price limit.','Je n’ai pas fixé de limite de prix.'),null],
 ['prefer-cheap-outdoor',text('Möglichst günstig und draussen.','Am liebschte günstig und dusse.','Preferably inexpensive and outdoors.','De préférence bon marché et dehors.'),P('budget.qualitative','günstig')],
 ];
 for(const [id,tail,f]of budgetWords)add('budget',id,Object.fromEntries(locales.map(l=>[l,ask(foods[4])[l]+' '+tail[l]])),{meaning:meaning([fs(foods[4]),...(f?[f]:[]),...(id.endsWith('outdoor')?[P('offer.area','outdoor')]:[])])},{critical:true,notes:'Keinen Preisbetrag aus günstig/egal/unbekannt erzeugen.'});
 const family=act('family-discovery','experience.activity','offene Entdeckung',text('mit meiner 6-jährigen Tochter etwas unternehmen','mit minere 6-jährige Tochter öppis undernäh','do something with my 6-year-old daughter','faire une activité avec ma fille de 6 ans'));
 const familyFacts=[C('people.relationship','daughter',['child']),C('people.age',{amount:6,operator:'EQ',unit:'YEARS'},['child']),C('people.role','self',['self']),C('people.relationship','adult_accompanied',['child'],'INFERRED'),{...R('condition.children','children_activity'),basis:'INFERRED'}];
 const familyEntities=[E('a1'),E('child','PERSON'),E('self','PERSON')];
 const temporal=[
 ['available',text(' Ich habe insgesamt höchstens 27 Minuten Zeit.',' Ich han insgesamt höchstens 27 Minute Ziit.',' I have at most 27 minutes in total.',' Je dispose de 27 minutes au maximum au total.'),R('time.duration',duration(27))],
 ['activity',text(' Die eigentliche Aktivität soll höchstens 45 Minuten dauern; die Anreise kommt extra.',' D Aktivität selber söll höchstens 45 Minute duure; d Aareis chunnt dezue.',' The activity itself must last at most 45 minutes; travel is additional.',' L’activité elle-même doit durer au maximum 45 minutes ; le trajet est en plus.'),R('time.duration',duration(45,'ACTIVITY'))],
 ['walking',text(' Der Fussweg dorthin darf höchstens 14 Minuten dauern.',' De Fuesswäg det ane dörf höchstens 14 Minute duure.',' The walk there must take at most 14 minutes.',' Le trajet à pied doit prendre au maximum 14 minutes.'),R('time.duration',duration(14,'WALKING'))],
 ['with-travel',text(' Insgesamt höchstens 80 Minuten, einschliesslich Aktivität und Hinweg.',' Zäme höchstens 80 Minute, inklusiv Aktivität und Hiwäg.',' At most 80 minutes in total, including the activity and outbound travel.',' Au maximum 80 minutes au total, activité et trajet aller compris.'),R('time.duration',duration(80,'AVAILABLE_TOTAL',['ACTIVITY','TRAVEL']))],
 ['tomorrow',text(' Morgen.',' Morn.',' Tomorrow.',' Demain.'),R('time.date',date('2027-02-04'))],
 ['fixed-date',text(' Am 12. Februar 2027.',' Am 12. Februar 2027.',' On 12 February 2027.',' Le 12 février 2027.'),R('time.date',date('2027-02-12'))],
 ['weekend',text(' Am kommenden Wochenende, Samstag oder Sonntag.',' Am chomende Wuchenänd, Samschtig oder Sunntig.',' This coming weekend, Saturday or Sunday.',' Ce week-end, samedi ou dimanche.'),[R('time.date_start',{date:'2027-02-06',operator:'GTE',timezone:REF.timezone}),R('time.date_end',{date:'2027-02-07',operator:'LTE',timezone:REF.timezone})]],
 ['end-clock',text(' Ich muss spätestens um 18:10 Uhr fertig sein.',' Ich muess spötischtens am 18:10 fertig sii.',' I must finish by 18:10.',' Je dois avoir terminé à 18 h 10.'),R('time.clock_end',clock('18:10','LTE'))],
 ['start-clock',text(' Der Besuch soll erst nach 17:20 Uhr beginnen.',' De Bsuech söll erscht nach 17:20 afange.',' The visit must start after 17:20.',' La visite doit commencer après 17 h 20.'),R('time.clock_start',clock('17:20','GT'))],
 ['morning-no-date',text(' Am Vormittag; der Besuchstag ist noch offen.',' Am Vormittag; de Tag isch no offe.',' In the morning; the visit date is undecided.',' Le matin ; la date de la visite reste ouverte.'),R('time.day_phase',phase('MORNING'))],
 ];
 for(const [index,a]of [foods[1],activities[6],family].entries())for(const [id,tail,f]of temporal){
  const value=structuredClone(f),amount=[14,35,22][index];let suffix=tail;
  if(['available','activity','walking','with-travel'].includes(id)){
   const old=value.value.amount;value.value.amount=amount;
   suffix=Object.fromEntries(locales.map(l=>[l,tail[l].replace(String(old),String(amount))]));
  }
  const travel=a.id===family.id&&id==='fixed-date';
  if(travel)suffix=text(' Die Anreise allein darf höchstens 35 Minuten dauern.',' D Aareis allei dörf höchstens 35 Minute duure.','Outbound travel alone must take at most 35 minutes.','Le trajet aller seul doit durer au maximum 35 minutes.');
  add('temporal',a.id+'-'+(travel?'travel-only':id),Object.fromEntries(locales.map(l=>[l,ask(a)[l]+suffix[l]])),{meaning:meaning([fs(a),...(travel?[R('time.duration',duration(35,'TRAVEL'))]:Array.isArray(value)?value:[value]),...(a.id===family.id?familyFacts:[])],a.id===family.id?{entities:familyEntities}:{})},{critical:true,notes:'Zeitumfang, Datumsspanne und strikte Grenzen erhalten. Gleicher Zahlenwert kann verschiedene Zeitumfänge bezeichnen. Keine Uhrzeit aus einer Dauer errechnen, keine aktuelle Referenz als Besuchstag übernehmen.'});
 }

 const attrs=[['indoor','offer.area','indoor',text('drinnen','dinne','indoors','en intérieur')],['outdoor','offer.area','outdoor',text('draussen','dusse','outdoors','en extérieur')],['quiet','atmosphere.noise','quiet',text('eine ruhige Umgebung','es ruhigs Umfeld','a quiet setting','un cadre calme')],['cozy','atmosphere.character','cozy',text('eine gemütliche Atmosphäre','e gmüetlichi Atmosphäre','a cozy atmosphere','une ambiance chaleureuse')],['vegan','food.diet','vegan',text('vegane Optionen','vegani Optione','vegan options','des options véganes')],['music','atmosphere.music','live_music',text('Live-Musik','Live-Musig','live music','de la musique live')]];
 for(const [id,key,value,label]of attrs)for(const mode of ['REQUIRED','PREFERRED','EXCLUDED','NOT_REQUIRED','PREFERRED_TOMORROW']){
  const location=['indoor','outdoor'].includes(id);
  const clause=Object.fromEntries(locales.map(l=>[l,({de:mode==='REQUIRED'?`Verbindliche Bedingung: ${label[l]}.`:mode==='EXCLUDED'?`Ausgeschlossen: ${label[l]}.`:mode==='NOT_REQUIRED'?`Das ist keine Bedingung, aber erlaubt: ${label[l]}.`:`Am liebsten ${label[l]}.`,'de-CH':mode==='REQUIRED'?`Das isch e feschti Bedingig: ${label[l]}.`:mode==='EXCLUDED'?`Das söll es nöd ha: ${label[l]}.`:mode==='NOT_REQUIRED'?`Das isch kei Bedingig, aber erlaubt: ${label[l]}.`:`Am liebschte ${label[l]}.`,en:mode==='REQUIRED'?`A firm requirement: ${label[l]}.`:mode==='EXCLUDED'?`Exclude ${label[l]}.`:mode==='NOT_REQUIRED'?`This is not required, but is allowed: ${label[l]}.`:`Preferably ${label[l]}.`,fr:mode==='REQUIRED'?`Une condition impérative : ${label[l]}.`:mode==='EXCLUDED'?`À exclure : ${label[l]}.`:mode==='NOT_REQUIRED'?`Ce n’est pas obligatoire, mais reste acceptable : ${label[l]}.`:`De préférence ${label[l]}.`})[l]]));
  const a=id==='vegan'?foods[6]:foods[1];
  const queries=Object.fromEntries(locales.map(l=>[l,ask(a)[l]+' '+clause[l]+(mode==='PREFERRED_TOMORROW'?text(' Morgen.',' Morn.',' Tomorrow.',' Demain.')[l]:'' )]));
  add('modality',id+'-'+mode,queries,{meaning:meaning([fs(a),{...R(key,value),modality:mode==='PREFERRED_TOMORROW'?'PREFERRED':mode},...(mode==='PREFERRED_TOMORROW'?[R('time.date',date('2027-02-04'))]:[])])},{critical:true,notes:`Pflicht, Wunsch, Ausschluss und Freiwilligkeit unterscheiden. ${location?'Eine Bereichsbedingung gehört an die Aktivität.':''} Nicht benötigt bedeutet nicht verboten.`});
 }
 const plans=[[activities[0],activities[7]],[activities[5],activities[3]],[activities[2],activities[8]],[family,activities[7]],[activities[8],foods[0]],[activities[6],foods[1]]];
 for(const [i,[a,b]]of plans.entries())for(const mode of ['choice','sequence','same-place','weather','fallback']){
  const isFamily=a.id===family.id;
  const intro=isFamily?text('Ich bin mit meiner 6-jährigen Tochter unterwegs. ','Ich bin mit minere 6-jährige Tochter underwägs. ','I am with my 6-year-old daughter. ','Je suis avec ma fille de 6 ans. '):text('','','','');
  const aPhrase=isFamily?text('drinnen etwas unternehmen','dinne öppis undernäh','do an indoor activity','faire une activité en intérieur'):a.phrases;
  const bPhrase=isFamily?text('draussen spazieren gehen','dusse go spaziere','go for an outdoor walk','faire une promenade en plein air'):b.phrases;
  const q=Object.fromEntries(locales.map(l=>[l,intro[l]+({de:mode==='choice'?`Entweder ${aPhrase[l]} oder ${bPhrase[l]}.`:mode==='sequence'?`Erst ${aPhrase[l]}, danach ${bPhrase[l]}.`:mode==='same-place'?`Erst ${aPhrase[l]}, danach am selben Ort ${bPhrase[l]}.`:mode==='weather'?`Wenn es regnet, ${aPhrase[l]}; sonst ${bPhrase[l]}.`:`Am liebsten ${aPhrase[l]}; nur wenn das nicht möglich ist, ${bPhrase[l]}.`,'de-CH':mode==='choice'?`Entweder ${aPhrase[l]} oder ${bPhrase[l]}.`:mode==='sequence'?`Zerscht ${aPhrase[l]}, dänn ${bPhrase[l]}.`:mode==='same-place'?`Zerscht ${aPhrase[l]}, dänn am gliiche Ort ${bPhrase[l]}.`:mode==='weather'?`Wänn es rägnet, ${aPhrase[l]}; suscht ${bPhrase[l]}.`:`Am liebschte ${aPhrase[l]}; nur wänn das nöd gaht, ${bPhrase[l]}.`,en:mode==='choice'?`Either ${aPhrase[l]} or ${bPhrase[l]}.`:mode==='sequence'?`First ${aPhrase[l]}, then ${bPhrase[l]}.`:mode==='same-place'?`First ${aPhrase[l]}, then ${bPhrase[l]} at the same place.`:mode==='weather'?`If it rains, ${aPhrase[l]}; otherwise ${bPhrase[l]}.`:`I would prefer to ${aPhrase[l]}; only if that is unavailable, ${bPhrase[l]}.`,fr:mode==='choice'?`Soit ${aPhrase[l]}, soit ${bPhrase[l]}.`:mode==='sequence'?`D’abord ${aPhrase[l]}, puis ${bPhrase[l]}.`:mode==='same-place'?`D’abord ${aPhrase[l]}, puis ${bPhrase[l]} au même endroit.`:mode==='weather'?`S’il pleut, ${aPhrase[l]} ; sinon ${bPhrase[l]}.`:`De préférence ${aPhrase[l]} ; seulement si ce n’est pas possible, ${bPhrase[l]}.`})[l]]));
  const facts=[fs(a),R(b.key,b.value,['a2'])];let aIds=['f1'],bIds=['f2'];
  if(isFamily){facts.push(R('offer.area','indoor'));aIds.push('f3');facts.push(R('offer.area','outdoor',['a2']));bIds.push('f4');facts.push({...R('condition.children','children_activity'),basis:'INFERRED'});aIds.push('f5');facts.push(...familyFacts.filter(f=>f.modality==='CONTEXT'));}
  const branch=ids=>ids.length===1?{kind:'FACT',factId:ids[0]}:and(...ids);
  const logic=mode==='choice'?{kind:'ANY',strength:'REQUIRED',children:[branch(aIds),branch(bIds)]}:mode==='weather'?{kind:'IF',conditionFactId:'w1',then:branch(aIds),else:branch(bIds)}:mode==='fallback'?{kind:'FALLBACK',options:[branch(aIds),branch(bIds)]}:and(...aIds,...bIds);
  const bindings=['sequence','same-place'].includes(mode)?[{kind:'SEQUENCE',factIds:['f1','f2']},...(mode==='same-place'?[{kind:'SAME_PLACE',factIds:['f1','f2']}]:[])]:[];
  add('logic-weather',`plan${i}-${mode}`,q,{meaning:meaning(facts,{entities:[E('a1'),E('a2'),...(isFamily?[E('child','PERSON'),E('self','PERSON')]:[])],logic,bindings,weatherConditions:mode==='weather'?[{id:'w1',role:'CONDITIONAL',state:'RAIN',basis:'EXPLICIT',subjectIds:[],detail:null}]:[]})},{critical:true,notes:'Alternative, Reihenfolge, gemeinsamer Ort und Wetterbedingung getrennt. Die Wetterlage selbst ist unbekannt; kein realer Wetterbericht.'});
 }
 function dialogue(theme,id,first,previous,answers,changes,notes){
  const targets=Object.fromEntries(locales.map(l=>{const update=changes(l);return [l,Array.isArray(update)?{changes:update}:update];}));
  add(theme,id,first,targets.de,{task:'DIALOGAKTUALISIERUNG_V3',critical:true,localeTargets:targets,previousMeaning:previous,turns:Object.fromEntries(locales.map(l=>[l,[{question:null,answer:answers[l]}]])),notes});
 }
 const editTypes=['date','clock','duration','money','scope','group','area','cancel-cozy','dish','drink'];
 for(const a of [foods[4],activities[6],activities[2]])for(const type of editTypes){
  let prev=meaning([fs(a)]),first=ask(a),answer,updated,id='f2';
  if(type==='date'){prev=meaning([fs(a),R('time.date',date('2027-02-09'))]);first=ask(a,text(' am 9. Februar 2027',' am 9. Februar 2027',' on 9 February 2027',' le 9 février 2027'));answer=text('Bitte auf den 16. Februar 2027 verschieben.','Bitte uf de 16. Februar 2027 verschiebe.','Please move it to 16 February 2027.','Merci de reporter au 16 février 2027.');updated=R('time.date',date('2027-02-16'));}
  if(type==='clock'){prev=meaning([fs(a),R('time.clock',clock('16:00'))]);first=ask(a,text(' um 16 Uhr',' am 16:00',' at 16:00',' à 16 h'));answer=text('Neu um 17:30 Uhr.','Neu am 17:30.','Change the time to 17:30.','Changeons l’heure à 17 h 30.');updated=R('time.clock',clock('17:30'));}
  if(type==='duration'){prev=meaning([fs(a),R('time.duration',duration(75))]);first=ask(a,text(', ich habe insgesamt höchstens 75 Minuten Zeit',', ich han insgesamt höchstens 75 Minute Ziit',', I have at most 75 minutes in total',', je dispose de 75 minutes au maximum au total'));answer=text('Ich habe jetzt insgesamt höchstens 48 Minuten Zeit.','Ich han jetzt insgesamt höchstens 48 Minute Ziit.','I now have at most 48 minutes in total.','Je dispose maintenant de 48 minutes au maximum au total.');updated=R('time.duration',duration(48));}
  if(type==='money'){prev=meaning([fs(a),R('budget.maximum',money(45)),C('budget.scope',{scope:'PER_PERSON'})]);first=ask(a,text(', höchstens 45 Franken pro Person',', höchstens 45 Franke pro Person',', at most CHF 45 per person',', au plus 45 CHF par personne'));answer=text('Bitte höchstens 32 Franken pro Person.','Bitte höchstens 32 Franke pro Person.','At most CHF 32 per person, please.','Au plus 32 CHF par personne, merci.');updated=R('budget.maximum',money(32));}
  if(type==='scope'){prev=meaning([fs(a),R('budget.maximum',money(90)),C('budget.scope',{scope:'PER_PERSON'}),C('people.count',count(3),['g1'])],{entities:[E('a1'),E('g1','GROUP')]});first=ask(a,text(', zu dritt, höchstens 90 Franken pro Person',', mir sind z dritt, höchstens 90 Franke pro Person',', three people, at most CHF 90 per person',', trois personnes, au plus 90 CHF par personne'));answer=text('Die 90 Franken gelten zusammen für uns drei, nicht pro Person.','Die 90 Franke gälted zäme für üs drü, nöd pro Person.','The CHF 90 is for all three of us together, not per person.','Les 90 CHF sont pour nous trois au total, pas par personne.');id='f3';updated=C('budget.scope',{scope:'GROUP_TOTAL'});}
  if(type==='group'){prev=meaning([fs(a),C('people.count',count(3),['g1'])],{entities:[E('a1'),E('g1','GROUP')]});first=ask(a,text(', wir sind drei',', mir sind drü',', there are three of us',', nous sommes trois'));answer=text('Wir sind jetzt sechs.','Mir sind jetzt sächs.','There are now six of us.','Nous sommes maintenant six.');updated=C('people.count',count(6),['g1']);}
  if(type==='area'){prev=meaning([fs(a),R('offer.area','outdoor')]);first=ask(a,text(', unbedingt draussen',', unbedingt dusse',', outdoors only',', uniquement dehors'));answer=text('Bitte stattdessen unbedingt drinnen.','Bitte statt däm unbedingt dinne.','Indoors instead, please; that is required.','En intérieur à la place, c’est impératif.');updated=R('offer.area','indoor');}
  if(type==='cancel-cozy'){prev=meaning([fs(a),P('atmosphere.character','cozy')]);first=ask(a,text(', gerne gemütlich',', gern gmüetlich',', preferably cozy',', de préférence dans une ambiance chaleureuse'));answer=text('Die Gemütlichkeit ist mir egal.','Ob es gmüetlich isch, isch mer egal.','I no longer care about coziness.','L’ambiance chaleureuse ne m’importe plus.');updated=null;}
  if(type==='dish'){prev=meaning([fs(a),R('food.dish','Pasta',['a2'])],{entities:[E('a1'),E('a2')],bindings:[{kind:'SEQUENCE',factIds:['f1','f2']}]});first=text(`Erst ${a.phrases.de}, danach Pasta essen.`,`Zerscht ${a.phrases['de-CH']}, dänn Pasta ässe.`,`First ${a.phrases.en}, then eat pasta.`,`D’abord ${a.phrases.fr}, puis manger des pâtes.`);answer=text('Beim zweiten Teil bitte Pizza statt Pasta.','Bim zweite Teil bitte Pizza statt Pasta.','For the second part, pizza instead of pasta.','Pour la deuxième partie, une pizza au lieu des pâtes.');updated=R('food.dish','Pizza',['a2']);}
  if(type==='drink'){prev=meaning([fs(a),R('food.drink','tea',['a2'])],{entities:[E('a1'),E('a2')],bindings:[{kind:'SEQUENCE',factIds:['f1','f2']}]});first=text(`Erst ${a.phrases.de}, danach Tee trinken.`,`Zerscht ${a.phrases['de-CH']}, dänn Tee trinke.`,`First ${a.phrases.en}, then have tea.`,`D’abord ${a.phrases.fr}, puis boire un thé.`);answer=text('Beim zweiten Teil Kaffee statt Tee.','Bim zweite Teil Kafi statt Tee.','For the second part, coffee instead of tea.','Pour la deuxième partie, un café au lieu du thé.');updated=R('food.drink','coffee',['a2']);}
  dialogue('dialogue-facts',a.id+'-'+type,first,prev,answer,l=>[{id,quote:answer[l],fact:updated?{id,...updated}:null}],'Nur die zitierte Änderung durchführen; Betrag, Einheit, Bezug und unveränderte Fakten behalten.');
 }
 for(const [i,[a,b]]of plans.filter(([a])=>a.id!==family.id).entries())for(const type of ['party-area','component-budget','weather-branch','booking','relative','preference-date']){
  let prev=meaning([fs(a)]),first=ask(a),answer,changes;
  if(type==='party-area'){
   prev=meaning([fs(a),R('offer.area','outdoor'),C('people.count',count(4),['g1']),R('time.date',date('2027-02-05'))],{entities:[E('a1'),E('g1','GROUP')]});first=ask(a,text(' am 5. Februar 2027, draussen, vier Personen',' am 5. Februar 2027, dusse, vier Persone',' on 5 February 2027, outdoors, four people',' le 5 février 2027, dehors, quatre personnes'));answer=text('Wir sind nun sieben und möchten drinnen bleiben. Der Tag bleibt.','Mir sind jetzt sibe und wänd dinne bliibe. De Tag bliibt.','There are now seven of us and we want to stay indoors. Keep the same date.','Nous sommes maintenant sept et souhaitons rester à l’intérieur. La date reste la même.');changes=l=>[{id:'f2',quote:answer[l],fact:{id:'f2',...R('offer.area','indoor')}},{id:'f3',quote:answer[l],fact:{id:'f3',...C('people.count',count(7),['g1'])}}];
  }
  if(type==='component-budget'){
   prev=meaning([fs(a),R(b.key,b.value,['a2']),R('budget.maximum',money(24)),C('budget.scope',{scope:'PER_PERSON'}),R('budget.maximum',money(19),['a2']),C('budget.scope',{scope:'PER_PERSON'},['a2'])],{entities:[E('a1'),E('a2')],bindings:[{kind:'SEQUENCE',factIds:['f1','f2']}]});first=text(`Erst ${a.phrases.de}, danach ${b.phrases.de}. Für Teil eins höchstens 24 Franken pro Person, für Teil zwei höchstens 19 Franken pro Person.`,`Zerscht ${a.phrases['de-CH']}, dänn ${b.phrases['de-CH']}. Für Teil eis höchstens 24 Franke pro Person, für Teil zwei höchstens 19 Franke pro Person.`,`First ${a.phrases.en}, then ${b.phrases.en}. At most CHF 24 per person for part one and CHF 19 per person for part two.`,`D’abord ${a.phrases.fr}, puis ${b.phrases.fr}. Au plus 24 CHF par personne pour la première partie et 19 CHF par personne pour la seconde.`);answer=text('Nur für Teil zwei gilt neu höchstens 26 Franken pro Person.','Nur für Teil zwei gälted neu höchstens 26 Franke pro Person.','Only part two changes: at most CHF 26 per person.','Seule la seconde partie change : au plus 26 CHF par personne.');changes=l=>[{id:'f5',quote:answer[l],fact:{id:'f5',...R('budget.maximum',money(26),['a2'])}}];
  }
  if(type==='weather-branch'){
   prev=meaning([fs(a),R(b.key,b.value,['a2'])],{entities:[E('a1'),E('a2')],logic:{kind:'IF',conditionFactId:'w1',then:{kind:'FACT',factId:'f1'},else:{kind:'FACT',factId:'f2'}},weatherConditions:[{id:'w1',role:'CONDITIONAL',state:'RAIN',basis:'EXPLICIT',subjectIds:[],detail:null}]});first=text(`Bei Regen ${a.phrases.de}, sonst ${b.phrases.de}.`,`Bi Räge ${a.phrases['de-CH']}, suscht ${b.phrases['de-CH']}.`,`If it rains, ${a.phrases.en}; otherwise ${b.phrases.en}.`,`S’il pleut, ${a.phrases.fr} ; sinon ${b.phrases.fr}.`);answer=text('Nur für die Regenoption stattdessen Billard spielen.','Nur bi de Rägeoption statt däm Billard spiele.','For the rain option only, play billiards instead.','Pour l’option pluie uniquement, jouer au billard à la place.');changes=l=>[{id:'f1',quote:answer[l],fact:{id:'f1',...R('experience.activity','billiards')}}];
  }
  if(type==='booking'){
   prev=meaning([fs(a),R('participation.booking','spontaneous'),R('budget.maximum',money(33)),C('budget.scope',{scope:'PER_PERSON'})]);first=ask(a,text(', ohne Voranmeldung, höchstens 33 Franken pro Person',', ohni Voramäldig, höchstens 33 Franke pro Person',', no advance booking, at most CHF 33 per person',', sans réservation préalable, au plus 33 CHF par personne'));answer=text('Spontaner Zugang ist doch keine Bedingung. Das Budget bleibt wichtig.','Spontane Zuegang isch doch kei Bedingig. S Budget bliibt wichtig.','Walk-in access is no longer required. The budget still matters.','L’accès sans réservation n’est plus obligatoire. Le budget reste important.');changes=l=>[{id:'f2',quote:answer[l],fact:null}];
  }
  if(type==='relative'){
   prev=meaning([fs(a),C('people.relationship','father',['p1']),C('people.age',{amount:64,operator:'EQ',unit:'YEARS'},['p1']),C('people.role','self',['self'])],{entities:[E('a1'),E('p1','PERSON'),E('self','PERSON')]});first=text(`Ich möchte mit meinem 64-jährigen Vater ${a.phrases.de}.`,`Ich möcht mit mim 64-jährige Vater ${a.phrases['de-CH']}.`,`I want to ${a.phrases.en} with my 64-year-old father.`,`Je voudrais ${a.phrases.fr} avec mon père de 64 ans.`);answer=text('Es kommt stattdessen meine 46-jährige Tante mit.','Statt däm chunnt mini 46-jährigi Tante mit.','My 46-year-old aunt is coming instead.','Ma tante de 46 ans vient à sa place.');changes=l=>[{id:'f2',quote:answer[l],fact:{id:'f2',...C('people.relationship',text('Tante','Tante','aunt','tante')[l],['p1'])}},{id:'f3',quote:answer[l],fact:{id:'f3',...C('people.age',{amount:46,operator:'EQ',unit:'YEARS'},['p1'])}}];
  }
  if(type==='preference-date'){
   prev=meaning([fs(a),P('atmosphere.character','cozy'),R('time.date',date('2027-02-10'))]);first=ask(a,text(' am 10. Februar 2027, gerne gemütlich',' am 10. Februar 2027, gern gmüetlich',' on 10 February 2027, preferably cozy',' le 10 février 2027, de préférence dans une ambiance chaleureuse'));answer=text('Gemütlichkeit ist egal, und bitte auf den 18. Februar 2027 verschieben.','Gmüetlich isch egal, und bitte uf de 18. Februar 2027 verschiebe.','Coziness no longer matters, and please move it to 18 February 2027.','L’ambiance chaleureuse ne compte plus ; merci de reporter au 18 février 2027.');changes=l=>[{id:'f2',quote:answer[l],fact:null},{id:'f3',quote:answer[l],fact:{id:'f3',...R('time.date',date('2027-02-18'))}}];
  }
  dialogue('dialogue-compositions',`plan${i}-${type}`,first,prev,answer,changes,'Mehrere Angebots-/Personenbezüge und bestehende IF-/SEQUENCE-Verknüpfungen erhalten. Änderungen vollständig zitieren.');
 }
 // Adult offspring and an explicitly unaccompanied minor pair prevent kinship=minor shortcuts.
 for(const [oldId,newId,role,years,forms,labels]of [
  ['friend-m','adult-daughter','daughter',25,text('meiner 25-jährigen Tochter','minere 25-jährige Tochter','my 25-year-old daughter','ma fille de 25 ans'),text('Tochter','Tochter','daughter','fille')],
  ['friend-f','adult-son','son',23,text('meinem 23-jährigen Sohn','mim 23-jährige Sohn','my 23-year-old son','mon fils de 23 ans'),text('Sohn','Sohn','son','fils')],
 ]){
  const old=families.find(f=>f.id===`beta1-people-roles-${oldId}-age`);old.id=`beta1-people-roles-${newId}-age`;
  old.queries=text(`Ich möchte mit ${forms.de} eine Ausstellung besuchen.`,`Ich möcht mit ${forms['de-CH']} e Usstellig bsueche.`,`I want to visit an exhibition with ${forms.en}.`,`Je voudrais visiter une exposition avec ${forms.fr}.`);
  old.localeTargets=Object.fromEntries(locales.map(l=>[l,{meaning:meaning([fs(activities[6]),C('people.relationship',labels[l],['p1']),C('people.age',{amount:years,operator:'EQ',unit:'YEARS'},['p1']),C('people.role','self',['self'])],{entities:[E('a1'),E('p1','PERSON'),E('self','PERSON')]})}]));old.target=old.localeTargets.de;old.notes=old.review='Erwachsene Tochter/erwachsener Sohn, kein minderjähriges Kind und keine abgeleitete Kinderaktivität oder Erwachsenenbegleitung.';
 }
 {
  const old=families.find(f=>f.id==='beta1-people-roles-brother-age');old.id='beta1-people-roles-unaccompanied-minor-pair';
  old.queries=text('Ich bin 16 Jahre alt. Ich möchte nur mit meinem 11-jährigen Bruder eine Ausstellung besuchen, ohne erwachsene Begleitung.','Ich bin 16 Jahr alt. Ich möcht nur mit mim 11-jährige Brüeder e Usstellig bsueche, ohni erwachseni Begleitig.','I am 16 years old. I want to visit an exhibition with only my 11-year-old brother, without an adult.','J’ai 16 ans. Je voudrais visiter une exposition uniquement avec mon frère de 11 ans, sans adulte.');
  old.localeTargets=Object.fromEntries(locales.map(l=>[l,{meaning:meaning([fs(activities[6]),C('people.relationship',text('Bruder','Brüeder','brother','frère')[l],['p1']),C('people.age',{amount:11,operator:'EQ',unit:'YEARS'},['p1']),C('people.role','self',['self']),C('people.age',{amount:16,operator:'EQ',unit:'YEARS'},['self']),C('people.relationship','unaccompanied',['p1','self'])],{entities:[E('a1'),E('p1','PERSON'),E('self','PERSON')]})}]));old.target=old.localeTargets.de;old.notes=old.review='Beide ausdrücklich minderjährig und ohne Erwachsenenbegleitung. Keine Erwachsenenannahme oder erfundene Zulassung.';
 }
 // Replace five redundant temporal combinations with genuinely ambiguous budget scope.
 const removed=new Set(['beta1-temporal-tea-fixed-date','beta1-temporal-exhibition-fixed-date','beta1-temporal-tea-tomorrow','beta1-temporal-exhibition-tomorrow','beta1-temporal-exhibition-start-clock']);
 for(let i=families.length-1;i>=0;i--)if(removed.has(families[i].id))families.splice(i,1);
 for(const a of [foods[6],foods[7],activities[0],activities[2],activities[8]]){
  const q=Object.fromEntries(locales.map(l=>[l,ask(a)[l]+text(' Wir sind vier. Budget höchstens 38 Franken.',' Mir sind vier. Budget höchstens 38 Franke.',' There are four of us. Budget at most CHF 38.',' Nous sommes quatre. Budget au plus 38 CHF.')[l]]));
  const make=l=>({meaning:meaning([fs(a),C('people.count',count(4),['g1']),R('budget.maximum',money(38)),C('budget.scope',{scope:'UNSPECIFIED'})],{entities:[E('a1'),E('g1','GROUP')]}),clarification:{question:text('Gilt das Budget pro Person oder für alle zusammen?','Gilt s Budget pro Person oder für alli zäme?','Is that budget per person or for everyone together?','Ce budget est-il par personne ou pour tout le groupe ?')[l],dimension:'BUDGET',options:text(['Pro Person','Für alle zusammen'],['Pro Person','Für alli zäme'],['Per person','For everyone together'],['Par personne','Pour tout le groupe'])[l]}});
  add('budget','clarify-scope-'+a.id,q,make('de'),{localeTargets:Object.fromEntries(locales.map(l=>[l,make(l)])),critical:true,notes:'Betrag und genannte Personenanzahl erhalten. Die nicht genannte Bezugsbasis bleibt UNSPECIFIED und wird einmal gezielt erfragt; kein stilles Raten.'});
 }
 // Replace redundant attribute/date combinations with asymmetric evidence cases.
 function replaceFamily(oldId,theme,id,q,target,notes){
  const index=families.findIndex(f=>f.id===oldId);if(index<0)throw Error('beta_replacement_missing_'+oldId);
  families.splice(index,1);add(theme,id,q,target,{critical:true,notes});
 }
 for(const [i,a]of [activities[0],activities[5],foods[4]].entries()){
  replaceFamily(`beta1-logic-weather-plan${i}-sequence`,'weather-evidence','observed-'+a.id,
   Object.fromEntries(locales.map(l=>[l,text('Hier regnet es gerade. ','Da rägnet es grad. ','It is raining here now. ','Il pleut ici en ce moment. ')[l]+ask(a)[l]])),
   {meaning:meaning([fs(a)],{weatherConditions:[{id:'w1',role:'CONTEXT',state:'RAIN',basis:'EXPLICIT',subjectIds:[],detail:null}]})},
   'Vom Nutzer berichteter Regen ist CONTEXT, keine Wettervorhersage und keine hypothetische IF-Bedingung. Kein Indoor-Zwang erfinden.');
 }
 for(const [i,[modality,tail]]of [
  ['REQUIRED',text('Der Zugang muss ohne Voranmeldung möglich sein.','De Zuegang muess ohni Voramäldig möglich sii.','Walk-in access without advance booking is required.','L’accès sans réservation préalable est impératif.')],
  ['PREFERRED',text('Am liebsten ohne Voranmeldung.','Am liebschte ohni Voramäldig.','Preferably without advance booking.','De préférence sans réservation préalable.')],
  ['NOT_REQUIRED',text('Ob Voranmeldung nötig ist, ist mir egal.','Ob Voramäldig nötig isch, isch mer egal.','I do not mind whether advance booking is needed.','Peu importe qu’une réservation préalable soit nécessaire.')],
  ['EXCLUDED',text('Kein spontaner Zugang: Ich will nur ein Angebot mit obligatorischer Voranmeldung.','Kei spontane Zuegang: Ich will nur es Aagebot mit obligatorischer Voramäldig.','Exclude walk-in access: I only want an offer that requires advance booking.','Pas d’accès spontané : je veux uniquement une offre avec réservation préalable obligatoire.')],
  ['REQUIRED',text('Nur ohne Voranmeldung und ausschliesslich drinnen.','Nur ohni Voramäldig und usschliesslich dinne.','Only without advance booking and strictly indoors.','Uniquement sans réservation préalable et en intérieur.')],
 ].entries()){
  const old=['beta1-modality-indoor-REQUIRED','beta1-modality-outdoor-REQUIRED','beta1-modality-cozy-REQUIRED','beta1-food-retention-coffee-cozy','beta1-food-retention-tea-cozy'][i];
  const a=i%2?activities[8]:activities[6];
  replaceFamily(old,'booking','initial-'+i,Object.fromEntries(locales.map(l=>[l,ask(a)[l]+' '+tail[l]])),{meaning:meaning([fs(a),{...R('participation.booking','spontaneous'),modality},...(i===4?[R('offer.area','indoor')]:[])])},'Buchungsbedingung als Suchwunsch erhalten; keine Verfügbarkeit oder getätigte Reservation behaupten.');
 }
 for(const [i,a]of [activities[0],activities[2],activities[3]].entries())for(const venue of [false,true]){
  const old=`beta1-modality-${['indoor','outdoor','quiet','cozy','vegan','music'][i*2+Number(venue)]}-PREFERRED_TOMORROW`;
  const kind=['cinema','swimming','bowling'][i];
  const facility=[text('ein Kino','es Kino','a cinema','un cinéma'),text('ein Schwimmbad','es Schwümmbad','a swimming pool','une piscine'),text('eine Bowlingbahn','e Bowlingbahn','a bowling alley','une piste de bowling')][i];
  const q=Object.fromEntries(locales.map(l=>[l,ask(foods[6])[l]+' '+(venue?text(`Im gesamten Betrieb darf es keine solche Einrichtung geben: ${facility.de}.`,`Im ganze Betrieb dörf es kei söttigi Iirichtig gäh: ${facility['de-CH']}.`,`This facility must be absent from the entire venue: ${facility.en}.`,`Cet équipement doit être absent de tout l’établissement : ${facility.fr}.`):text(`Ich selbst möchte nicht ${a.phrases.de}. Ob andere das dort tun können, ist mir egal.`,`Ich selber möcht nöd ${a.phrases['de-CH']}. Ob anderi das det chönd mache, isch mer egal.`,`I do not want to ${a.phrases.en} myself. I do not mind whether other people can do that there.`,`Je ne souhaite pas personnellement cette activité : ${a.phrases.fr}. Peu importe que d’autres puissent le faire sur place.`))[l]]));
  replaceFamily(old,'exclusion-scope',a.id+'-'+(venue?'venue':'self'),q,{meaning:meaning([{...fs(foods[6]),subjectIds:venue?['a1']:['a1','self']},...(!venue?[C('people.role','self',['self'])]:[]),{...R(venue?'offer.kind':a.key,venue?kind:a.value,venue?['a1']:['self']),modality:'EXCLUDED'}],{entities:[E('a1'),...(venue?[]:[E('self','PERSON')])]})},'Persönliche Ablehnung betrifft nur self; betriebsweiter Ausschluss gehört an den Angebotsbezug. Keine Umdeutung von persönlicher Ablehnung zum gesamten Betrieb.');
 }
 for(const a of [activities[1],activities[9]])replaceFamily(`beta1-activity-retention-${a.id}-basel`,'temporal',a.id+'-travel-only',Object.fromEntries(locales.map(l=>[l,ask(a)[l]+text(' Die Anreise allein darf höchstens 35 Minuten dauern.',' D Aareis allei dörf höchstens 35 Minute duure.','Outbound travel alone must take at most 35 minutes.','Le trajet aller seul doit durer au maximum 35 minutes.')[l]])),{meaning:meaning([fs(a),R('time.duration',duration(35,'TRAVEL'))])},'Nur die Anreise ist begrenzt; keine verfügbare Gesamtzeit oder Aktivitätsdauer erfinden.');
 for(const [id,amount,queries]of [
  ['billiards',18,text('Ich will Billard spielen. Für die Anfahrt plane ich höchstens 18 Minuten ein.','Ich will Billard spiele. D Aafahrt dörf höchstens 18 Minute duure.','I want to play billiards; reaching the venue must take 18 minutes or less.','Je veux jouer au billard ; le trajet pour rejoindre le lieu doit durer au maximum 18 minutes.')],
  ['workshop',46,text('Einen Workshop besuchen, mit einer Anreise von maximal 46 Minuten.','En Workshop bsueche, aber höchstens 46 Minute det ane fahre.','Find a workshop within a journey of no more than 46 minutes.','Un atelier, à condition de ne pas mettre plus de 46 minutes pour y aller.')],
  ['family-discovery',29,text('Mit meiner 6-jährigen Tochter etwas unternehmen. Schon die Hinfahrt soll nicht länger als 29 Minuten dauern.','Mit minere 6-jährige Tochter öppis undernäh. Für d Hifahrt wänd mir höchstens 29 Minute bruuche.','Something to do with my 6-year-old daughter, with the outward journey capped at 29 minutes.','Une activité avec ma fille de 6 ans ; nous voulons limiter le trajet aller à 29 minutes.')],
 ]){
  const row=families.find(f=>f.id===`beta1-temporal-${id}-travel-only`);row.queries=queries;
  row.target.meaning.facts.find(f=>f.key==='time.duration').value.amount=amount;
 }
 // Grounded additions use the existing atomic protocol, including mixed edits.
 const replacedAdditionIds=[
  'beta1-food-retention-drinks-cozy','beta1-food-retention-breakfast-cozy',
  'beta1-food-retention-lunch-cozy','beta1-food-retention-dinner-cozy',
  'beta1-food-retention-meal-cozy','beta1-food-retention-pizza-cozy',
  'beta1-food-retention-pasta-cozy','beta1-food-retention-sushi-cozy',
  'beta1-activity-retention-cinema-basel','beta1-activity-retention-swimming-basel',
  'beta1-activity-retention-bowling-basel','beta1-activity-retention-mini-golf-basel',
  'beta1-activity-retention-ceramics-basel','beta1-activity-retention-walking-basel',
 ];
 for(const [index,type]of [...['budget','duration','companion','second-part','mixed','subgroup'].flatMap(type=>[type,type]),'companion-budget','duration-second'].entries()){
  const oldIndex=families.findIndex(f=>f.id===replacedAdditionIds[index]);if(oldIndex<0)throw Error('beta_addition_replacement');families.splice(oldIndex,1);
  const a=index%2?activities[6]:foods[4];let previous=meaning([fs(a)]),first=ask(a),answer,addition;
  if(type==='budget'){
   const amount=index%2?51:64;
   answer=text(`Dafür gilt zusätzlich eine Obergrenze von ${amount} Franken pro Person.`,`Dezue gilt e Obergränze vo ${amount} Franke pro Person.`,`Also set a spending limit of CHF ${amount} per person for this visit.`,`Ajoute une limite de ${amount} CHF par personne pour cette sortie.`);
   addition={facts:[{id:'n1',...R('budget.maximum',money(amount))},{id:'n2',...C('budget.scope',{scope:'PER_PERSON'})}]};
  }
  if(type==='duration'){
   const amount=index%2?52:68;
   answer=text(`Ich habe für den ganzen Besuch jetzt höchstens ${amount} Minuten zur Verfügung.`,`Für de ganz Bsuech han ich jetzt höchstens ${amount} Minute Ziit.`,`I now have no more than ${amount} minutes for the whole visit.`,`Je dispose maintenant de ${amount} minutes au maximum pour toute la sortie.`);
   addition={facts:[{id:'n1',...R('time.duration',duration(amount))}]};
  }
  if(type==='companion'){
   answer=text('Mein 57-jähriger Onkel kommt mit mir mit.','Min 57-jährige Onkel chunnt mit mir mit.','My 57-year-old uncle is joining me.','Mon oncle de 57 ans m’accompagne.');
   addition={entities:[E('p2','PERSON'),E('self','PERSON')],facts:[{id:'n1',...C('people.relationship','uncle',['p2'])},{id:'n2',...C('people.age',{amount:57,operator:'EQ',unit:'YEARS'},['p2'])},{id:'n3',...C('people.role','self',['self'])}]};
  }
  if(type==='second-part'){
   answer=text('Danach möchte ich am selben Ort noch Tee trinken.','Dänn möcht ich am gliiche Ort no Tee trinke.','Afterwards I would also like tea at the same place.','Ensuite, je voudrais aussi boire un thé au même endroit.');
   addition={entities:[E('a2')],facts:[{id:'n1',...R('food.drink','tea',['a2'])}],bindings:[{kind:'SEQUENCE',factIds:['f1','n1']},{kind:'SAME_PLACE',factIds:['f1','n1']}]};
  }
  if(type==='mixed'){
   previous=meaning([fs(a),P('atmosphere.character','cozy')]);first=ask(a,text(', gerne gemütlich',', gern gmüetlich',', preferably cozy',', de préférence dans une ambiance chaleureuse'));
   answer=text('Gemütlichkeit ist egal. Neu habe ich insgesamt höchstens 43 Minuten Zeit.','Gmüetlich isch egal. Neu han ich insgesamt höchstens 43 Minute Ziit.','Coziness no longer matters. I now have at most 43 minutes in total.','L’ambiance chaleureuse ne compte plus. Je dispose maintenant de 43 minutes au maximum au total.');
   addition={facts:[{id:'n1',...R('time.duration',duration(43))}]};
  }
  if(type==='subgroup'){
   answer=text('Wir kommen zu siebt; drei von uns brauchen vegane Optionen.','Mir chömed z sibt; drü vo üs bruuched vegani Optione.','Seven of us are coming; three need vegan options.','Nous serons sept ; trois personnes du groupe ont besoin d’options véganes.');
   addition={entities:[E('party','GROUP',['subset']),E('subset','GROUP')],facts:[{id:'n1',...C('people.count',count(7),['party'])},{id:'n2',...C('people.count',count(3),['subset'])},{id:'n3',...R('food.diet','vegan',['subset'])}]};
  }
  if(type==='companion-budget'){
   answer=text('Meine 58-jährige Tante kommt mit mir. Pro Person höchstens 72 Franken.','Mini 58-jährigi Tante chunnt mit mir. Pro Person höchstens 72 Franke.','My 58-year-old aunt is joining me. At most CHF 72 per person.','Ma tante de 58 ans m’accompagne. Au maximum 72 CHF par personne.');
   addition={entities:[E('p2','PERSON'),E('self','PERSON')],facts:[{id:'n1',...C('people.relationship','aunt',['p2'])},{id:'n2',...C('people.age',{amount:58,operator:'EQ',unit:'YEARS'},['p2'])},{id:'n3',...C('people.role','self',['self'])},{id:'n4',...R('budget.maximum',money(72))},{id:'n5',...C('budget.scope',{scope:'PER_PERSON'})}]};
  }
  if(type==='duration-second'){
   answer=text('Danach am selben Ort Tee trinken. Für alles zusammen habe ich höchstens 77 Minuten Zeit.','Dänn am gliiche Ort Tee trinke. Für alles zäme han ich höchstens 77 Minute Ziit.','Tea afterwards at the same place. I have at most 77 minutes for the whole plan.','Ensuite, boire un thé au même endroit. Je dispose de 77 minutes au maximum pour l’ensemble du programme.');
   addition={entities:[E('a2')],facts:[{id:'n1',...R('food.drink','tea',['a2'])},{id:'n2',...R('time.duration',duration(77),[])}],bindings:[{kind:'SEQUENCE',factIds:['f1','n1']},{kind:'SAME_PLACE',factIds:['f1','n1']}]};
  }
  dialogue('dialogue-additions',type+'-'+index,first,previous,answer,l=>({changes:type==='mixed'?[{id:'f2',quote:answer[l],fact:null}]:[],additions:{entities:[],facts:[],bindings:[],extensions:[],uncertainties:[],weatherConditions:[],logic:null,...addition}}),'Neue Angaben mit neuen IDs ergänzen; alte Tätigkeit, Fakten und Verknüpfungen bleiben erhalten. Gemischte Änderung mit wörtlichem Aufhebungsbeleg.');
  families.at(-1).curriculumRole=index>=12?'COMPOSED_HOLDOUT':'TEACHING';
 }
 // Several reference days, including month rollover. Relative dates are regenerated.
 for(const [i,f]of families.entries()){
  const now=['2027-01-31T09:00:00Z','2027-02-01T09:00:00Z','2027-02-03T09:00:00Z','2027-02-05T09:00:00Z'][i%4];
  f.reference={...REF,now:f.id.endsWith('-weekend')?'2027-02-03T09:00:00Z':f.id==='beta1-activity-retention-cinema-tomorrow'?'2027-01-31T09:00:00Z':now};
  const tomorrow=new Date(new Date(f.reference.now).getTime()+86400000).toISOString().slice(0,10);
  for(const target of [f.target,...Object.values(f.localeTargets??{})])for(const item of target.meaning?.facts??[])if(item.value?.date==='2027-02-04')item.value.date=tomorrow;
 }
 if(families.length!==300)throw Error('beta_family_count_'+families.length);
 return families;
}

export {roleAliases} from './nuknuk-beta-semantics.mjs';
export function semanticPattern(row){
 const target=row.target??row.expected;
 if(row.task!=='DIALOGAKTUALISIERUNG_V3')return contentHash({task:row.task,graph:betaGraphHash({entities:[],facts:[],logic:null,bindings:[],extensions:[],uncertainties:[],weatherConditions:[],...target.meaning},{maskNumbers:true}),question:target.clarification?.dimension??null});
 const previous=row.previousMeaning,addition=target.additions??{};
 const facts=(target.changes??[]).map(change=>({...structuredClone(change.fact??previous.facts.find(f=>f.id===change.id)),operation:change.fact?'REPLACE':'REMOVE'}));
 facts.push(...(addition.facts??[]).map(f=>({...structuredClone(f),operation:'ADD'})));
 const referenced=(value,result=new Set())=>{if(Array.isArray(value))value.forEach(v=>referenced(v,result));else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){if(k==='factId')result.add(v);else if(k==='factIds')v.forEach(id=>result.add(id));else referenced(v,result);}return result;};
 for(const id of referenced({logic:addition.logic,bindings:addition.bindings}))if(!facts.some(f=>f.id===id)){const prior=previous.facts.find(f=>f.id===id);if(prior)facts.push({...structuredClone(prior),key:'BOUND_PREVIOUS_FACT',value:{text:'existing fact'},operation:'ANCHOR'});}
 const entities=[...previous.entities,...(addition.entities??[])];const used=new Set([...facts,...(addition.extensions??[])].flatMap(f=>f.subjectIds));for(const f of facts)if(f.value?.referenceEntityId)used.add(f.value.referenceEntityId);
 let changed=true;while(changed){changed=false;for(const e of entities.filter(e=>used.has(e.id)))for(const id of e.members)if(!used.has(id)){used.add(id);changed=true;}}
 const graph={entities:entities.filter(e=>used.has(e.id)),facts,extensions:addition.extensions??[],logic:addition.logic??null,bindings:addition.bindings??[],uncertainties:[],weatherConditions:addition.weatherConditions??[]};
 return contentHash({task:row.task,graph:betaGraphHash(graph,{maskNumbers:true})});
}

export function betaTrainingCases(){
 const families=betaTrainingFamilies();
 const known=new Set(productTrainingCases().map(r=>semanticPattern({task:r.task,target:r.expected,previousMeaning:r.previousMeaning??null})));
 const groups=new Map();
 for(const f of families){const signature=semanticPattern(f);const g=groups.get(signature)??{signature,families:[],known:known.has(signature)};g.families.push(f);groups.set(signature,g);}
 const all=[...groups.values()].sort((a,b)=>sha('backyrd-beta-v1:'+a.signature).localeCompare(sha('backyrd-beta-v1:'+b.signature)));
 const assigned=new Map();
 for(const g of all)if(g.families.some(f=>f.curriculumRole))assigned.set(g.signature,g.families.some(f=>f.curriculumRole==='TEACHING')?'TRAIN':'TEST');
 // Reserve both teaching and transfer coverage before balancing row totals.
 const protocols=[
  f=>f.theme==='weather-evidence',f=>f.theme==='booking',
  f=>f.theme==='exclusion-scope'&&f.id.endsWith('-self'),
  f=>f.theme==='exclusion-scope'&&f.id.endsWith('-venue'),
  f=>f.target.meaning?.facts.some(f=>f.key==='time.duration'&&f.value.measurementScope==='WALKING'),
  f=>f.target.meaning?.facts.some(f=>f.key==='time.duration'&&f.value.measurementScope==='TRAVEL'),
 ];
 for(const matches of protocols){
  const test=all.find(g=>!g.known&&!assigned.has(g.signature)&&g.families.some(matches));
  if(!test)throw Error('beta_protocol_test_coverage');assigned.set(test.signature,'TEST');
  const train=all.find(g=>assigned.get(g.signature)!=='TEST'&&g.families.some(matches));
  if(!train)throw Error('beta_protocol_train_coverage');assigned.set(train.signature,'TRAIN');
 }
 for(const split of ['TEST','VALIDATION']){
  let remaining=50;const themes=new Map();
  for(const g of all.filter(g=>assigned.get(g.signature)===split)){remaining-=g.families.length;for(const f of g.families)themes.set(f.theme,(themes.get(f.theme)??0)+1);}
  if(split==='TEST'){
   const ambiguity=all.find(g=>!g.known&&!assigned.has(g.signature)&&g.families.some(f=>f.target.clarification));
   if(!ambiguity)throw Error('beta_test_clarification_missing');
   assigned.set(ambiguity.signature,split);remaining-=ambiguity.families.length;
   for(const f of ambiguity.families)themes.set(f.theme,(themes.get(f.theme)??0)+1);
  }
  while(remaining){
   const candidates=all.filter(g=>!g.known&&!assigned.has(g.signature)&&g.families.length<=remaining);
   candidates.sort((a,b)=>Math.min(...a.families.map(f=>themes.get(f.theme)??0))-Math.min(...b.families.map(f=>themes.get(f.theme)??0))||all.indexOf(a)-all.indexOf(b));
   const g=candidates[0];if(!g)throw Error('beta_split_capacity');assigned.set(g.signature,split);remaining-=g.families.length;for(const f of g.families)themes.set(f.theme,(themes.get(f.theme)??0)+1);
  }
 }
 const rows=[];
 for(const g of all)for(const f of g.families)for(const locale of locales){
  const split=assigned.get(g.signature)??'TRAIN';
  rows.push({id:`${f.id}-${locale}`,scenarioGroup:`beta1-semantic-${g.signature.slice(0,24)}`,familyId:f.id,theme:f.theme,locale,split,task:f.task,query:f.queries[locale],reference:f.reference,
   expected:structuredClone(f.localeTargets?.[locale]??f.target),...(f.previousMeaning?{previousMeaning:structuredClone(f.previousMeaning),turns:structuredClone(f.turns[locale])}:{}),
   review:f.review,critical:f.critical,provenance:{kind:'AUTHORED_SYNTHETIC',independentHumanGold:false},reviewStatus:'PENDING_ASTRA_REVIEW',knownFamily:g.known});
 }
 if(rows.length!==1200||rows.filter(r=>r.split==='TRAIN').length!==800||rows.filter(r=>r.split==='VALIDATION').length!==200||rows.filter(r=>r.split==='TEST').length!==200)throw Error('beta_split_inventory');
 return rows;
}
