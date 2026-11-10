// Counterfactual evidence exercises reuse the existing canonical Product route.
import {worldCases} from '../nuknuk-pilot-cohort.mjs';
import {R,P,M,D,A,W,reference} from './authoring.mjs';
const specs=[
 ['coffee-cozy','TRAIN','Kaffee trinken, besonders gemütlich sitzen wäre schön.',D('coffee'),'atmosphere.character','gemütlich','atmosphere.character','cozy','DRINKS','RESTAURANT','Gemütlichkeit'],
 ['tea-talk','TRAIN','Tee trinken, gut reden können wäre mir lieb.',D('Tee'),'atmosphere.conversation','Unterhaltung gut möglich','atmosphere.conversation','conversation_possible','DRINKS','RESTAURANT','Gesprächsmöglichkeit'],
 ['meal-relaxed','TRAIN','Ein entspanntes Essen wäre schön, Essen ist der feste Wunsch.',M(),'atmosphere.character','entspannt','atmosphere.character','relaxed','GASTRONOMY','RESTAURANT','entspannte Atmosphäre'],
 ['snack-veggie','TRAIN','Snacks kaufen, vegetarische Optionen fände ich gut.',M('snacks'),'food.diet','vegetarisch','food.diet','vegetarian','SNACKS','RESTAURANT','vegetarische Snackoption'],
 ['boulder-shower','TRAIN','Bouldern, eine Dusche vor Ort wäre ein Bonus.',A('Bouldern'),'offer.feature','Dusche','offer.feature','Dusche','BOULDERING','SPORT','Dusche'],
 ['museum-quiet','TRAIN','Museum besuchen, ruhige Räume wären schön.',R('offer.kind','MUSEUM'),'atmosphere.noise','ruhig','atmosphere.noise','quiet','SELF_GUIDED_VISIT','MUSEUM','ruhige Atmosphäre'],
 ['play-shade','TRAIN','Ein Spielplatz, schattige Plätze wären praktisch.',A('playground'),'offer.shade','Schatten','offer.shade','shade','PLAYGROUND','OUTDOOR_NATURE','Schatten'],
 ['swim-warm','TRAIN','Schwimmen, warmes Wasser wäre ein schöner Zusatz.',A('swimming'),'offer.temperature','warmes Wasser','offer.temperature','warmes Wasser','SWIMMING','SPORT','warmes Wasser'],
 ['drinks-music','TRAIN','Ein Getränk, Hintergrundmusik wäre nett.',D('drinks'),'atmosphere.music','Hintergrundmusik','atmosphere.music','background_music','DRINKS','RESTAURANT','Hintergrundmusik'],
 ['breakfast-cozy','TRAIN','Frühstück essen, heimelige Atmosphäre würde mir gefallen.',M('breakfast'),'atmosphere.character','gemütlich','atmosphere.character','cozy','BREAKFAST','RESTAURANT','gemütliche Atmosphäre'],
 ['tabletennis-equipment','TRAIN','Tischtennis, Schläger ausleihen wäre praktisch.',A('table_tennis'),'offer.service','Schläger ausleihen','offer.service','Schläger ausleihen','TABLE_TENNIS','SPORT','Schlägerausleihe'],
 ['dinner-wlan','TRAIN','Abendessen, WLAN wäre ein Pluspunkt.',M('dinner'),'offer.feature','WLAN','offer.feature','WLAN','DINNER','RESTAURANT','WLAN'],
 ['dev-lunch-talk','VALIDATION','Mittagessen, Gesprächsmöglichkeiten würden die Auswahl verbessern.',M('lunch'),'atmosphere.conversation','Unterhaltung gut möglich','atmosphere.conversation','conversation_possible','LUNCH','RESTAURANT','Gesprächsmöglichkeit'],
 ['dev-museum-seating','VALIDATION','Museum anschauen, Sitzgelegenheiten wären angenehm.',R('offer.kind','MUSEUM'),'offer.feature','Sitzgelegenheiten','offer.feature','Sitzgelegenheiten','SELF_GUIDED_VISIT','MUSEUM','Sitzgelegenheiten'],
 ['test-workshop-cozy','TEST','Einen Workshop besuchen, Gemütlichkeit wäre ein Vorteil.',A('Workshop'),'atmosphere.character','gemütlich','atmosphere.character','cozy','WORKSHOP','ACTIVITIES_PLAY','gemütliche Atmosphäre'],
 ['test-bath-warm','TEST','Baden gehen, warmes Wasser würde ich bevorzugen.',A('bathing'),'offer.temperature','warmes Wasser','offer.temperature','warmes Wasser','BATHING','WELLNESS_RELAXATION','warmes Wasser'],
];
export async function evidenceCases(){
 const result=[];
 for(const [name,split,query,hard,feature,value,requestKey,requestValue,kind,category,label]of specs){
  const ids=['missing','present','missing-tie','present-tie'].map(suffix=>'solid-evidence-'+name+'-'+suffix);
  const scenarioGroup='solid-evidence-'+name;
  const byId=new Map(ids.map(id=>[id,{scenarioGroup,split}]));
  const spec={useHttpFixture:true,reference:{now:'2026-10-14T08:00:00Z',timezone:'Europe/Zurich'},...W(query,'Gewünschtes Angebot, Zusatzwunsch nicht mit bestätigtem Wissen verwechseln.',[hard,P(requestKey,requestValue)]),ids,kind:({SNACKS:'GASTRONOMY',PLAYGROUND:'MOVEMENT_PLAY',TABLE_TENNIS:'BALL_SPORT'})[kind]??kind,category,feature,value:feature==='offer.shade'?true:value,
   offerProperties:kind==='SNACKS'?[{key:'food.meal_extent',value:'Snacks'}]:kind==='TABLE_TENNIS'?[{key:'experience.activity',value:'Tischtennis'}]:[],
   areaKind:kind==='PLAYGROUND'?'PLAYGROUND':undefined,
   areaProperties:kind==='PLAYGROUND'?[{key:'amenity.playground',value:true}]:[],
   placeType:({SPORT:'SPORTS_CENTRE',OUTDOOR_NATURE:'PARK',ACTIVITIES_PLAY:'ESCAPE_ROOM',WELLNESS_RELAXATION:'SAUNA'})[category],
   propertyScope:['offer.shade','offer.temperature'].includes(feature)?'AREA':undefined,
   variantModes:['MISSING','PRESENT','MISSING_TWO','PRESENT_TWO'],
   must:'Nur belegte Eigenschaften bestätigen; gleich belegte Kandidaten nicht willkürlich als unterschiedlich passend erklären.',
   avoid:'Keinen fehlenden Beleg, freien Tisch, persönlichen Geschmack oder höhere Popularität erfinden.',
   missingJudgment:`Das gewünschte Grundangebot ist belegt. Für den Zusatzwunsch (${label}) fehlt ein bestätigter Beleg; dessen Erfüllung bleibt offen.`,
   knownJudgment:`Grundangebot und Zusatzwunsch (${label}) sind durch die übergebenen Belege gestützt. Das beweist weder persönliche Begeisterung noch tatsächlich freie Plätze.`,
   missingUncertainty:`Der Zusatzwunsch (${label}) ist nicht bestätigt.`,
  };
  // Historical helper uses its original reference. These exercises contain no
  // time terms; retain the reference actually used to construct their evidence.
  for(const built of await worldCases(spec,byId))result.push({...built,metadata:{domain:'grounded-evidence',phenomena:['evidence','unknown-vs-false','ties'],scenarioGroup,split}});
 }
 return result;
}
