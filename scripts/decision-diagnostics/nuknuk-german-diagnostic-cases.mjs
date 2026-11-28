// Authored German diagnostics, not independent holdout or training permission.
export const GERMAN_REFERENCE={now:'2026-11-25T09:00:00Z',timezone:'Europe/Zurich'};
export function germanDiagnosticCases(){
 const rows=[
  ['coffee','Alltag','Ich möchte heute Nachmittag in Basel einen Kaffee trinken, am liebsten irgendwo ruhig.',['Kaffee bleibt der Zweck.','Heute Nachmittag; Basel.','Ruhe ist eine Präferenz, keine Pflicht.']],
  ['child-rain','Familie','Morgen Abend mit meiner vierjährigen Tochter was drinnen machen. Restaurants möchten wir nicht.',['Gemeinsame geeignete Indoor-Aktivität für ein vierjähriges Kind.','Morgen Abend.','Kein Restaurant als Ausflugsziel.']],
  ['adult-daughter','Personen','Ich möchte mit meiner 25-jährigen Tochter eine Ausstellung besuchen.',['Anfragende Person und Tochter kommen mit.','25 Jahre gehören zur Tochter.','Kein Kleinkind- oder Familienzwang.']],
  ['father','Personen','Ich würde gerne mit meinem Vater in ein Museum gehen.',['Anfragende Person und Vater bleiben unterschiedliche Personen.','Museum bleibt der Zweck.']],
  ['brother-gift','Personen','Ich suche einen Töpferkurs als Geschenk für meinen Bruder.',['Bruder ist Empfänger, keine automatisch gemeinsame Teilnahme.','Geschenkanlass und Töpferkurs bleiben erhalten.']],
  ['sister-gift','Rückfragen','Ich suche etwas Besonderes als Geschenk für meine Schwester, weiss aber noch nicht, was ihr gefallen könnte.',['Schwester ist Empfängerin.','Besonderes bleibt Präferenz.','Offene Erlebnisrichtung ehrlich klären.']],
  ['access-subgroup','Teilgruppen','Wir sind fünf und möchten eine Ausstellung besuchen. Zwei von uns brauchen einen stufenlosen Zugang.',['Fünf insgesamt; zwei davon benötigen stufenlosen Zugang.','Teilgruppe bleibt mit der Gesamtgruppe verbunden.','Stufenloser Zugang ist notwendig.']],
  ['lactose-subgroup','Teilgruppen','Wir wollen zu viert drinnen essen gehen. Drei von uns brauchen laktosefreie Gerichte.',['Vier insgesamt; drei davon benötigen laktosefreie Gerichte.','Drinnen und laktosefreie Optionen sind Pflicht.']],
  ['vegan-total','Teilgruppen','Wir sind sechs, zwei essen vegan. Für unser Abendessen zusammen möchten wir höchstens 180 Franken ausgeben.',['Sechs insgesamt; zwei vegan.','180 CHF für das Essen der ganzen Gruppe, nicht pro Person.','Abendessen bleibt der Zweck.']],
  ['budget-ambiguous','Rückfragen','Wir möchten zu viert schwimmen gehen. Höchstens 38 Franken.',['Vier Personen; Schwimmen; Obergrenze 38 CHF.','Pro Person oder insgesamt ist offen und muss geklärt werden.']],
  ['budget-total','Budget','Wir sind vier und möchten schwimmen gehen. Der Eintritt darf für uns alle zusammen maximal 80 Franken kosten.',['Vier Personen; höchstens 80 CHF Gruppengesamtpreis für Eintritt.','Keine unnötige Rückfrage zur bereits genannten Bezugsbasis.']],
  ['pizza-per-person','Budget','Wir möchten zu zweit Pizza essen, höchstens 25 Franken pro Person.',['Pizza für zwei; höchstens 25 CHF pro Person.','Keine erfundene Gesamtrechnungsgrenze.']],
  ['museum-coffee','Mehrteilig','Erst ein Museum besuchen und danach am selben Ort Kaffee trinken. Für den Kaffee höchstens elf Franken pro Person.',['Museum vor Kaffee, am selben Ort.','11 CHF pro Person gelten nur für Kaffee.','Beziehungen referenzieren die tatsächlichen Tätigkeiten korrekt.']],
  ['weather','Bedingungen','Wenn es regnet, möchte ich ins Kino. Sonst würde ich draussen spazieren gehen.',['Regen entscheidet zwischen Kino und Spaziergang.','Draussen gilt für den Spaziergang.','Kein erfundenes aktuelles Wetter.']],
  ['no-sauna-activity','Ausschlüsse','Ich möchte schwimmen gehen. Sauna möchte ich dabei nicht machen.',['Schwimmen ist der Zweck; eigene Saunateilnahme ausgeschlossen.','Zusätzliche Sauna im Gebäude ist allein kein Standortverbot.']],
  ['no-sauna-venue','Ausschlüsse','Ich möchte schwimmen gehen. Ein Bad mit Sauna kommt für mich nicht infrage.',['Schwimmen bleibt der Zweck.','Ausdrückliches Verbot eines Bads mit Sauna gilt für den Standort.']],
  ['outside-preference','Pflicht und Wunsch','Ich möchte einen Kaffee trinken. Draussen sitzen wäre schön, ist aber kein Muss.',['Kaffee bleibt der Zweck.','Draussen ist höchstens Präferenz, keine Pflicht und kein Verbot.']],
  ['vegetarian','Pflicht und Wunsch','Wir wollen heute Abend essen gehen. Es muss vegetarische Gerichte geben, die Küche ist uns egal.',['Heute Abend essen.','Vegetarische Optionen sind Pflicht.','Keine bestimmte Küche erfinden.']],
  ['total-duration','Zeit','Ich habe eine Stunde Zeit und möchte in ein Museum. Die Fahrt muss in diese Stunde passen.',['Museum; insgesamt höchstens 60 Minuten inklusive Fahrt.','Reisezeit nicht mit Besuchsdauer gleichsetzen.','Unbelegte Reisezeit nicht als erfüllt ausgeben.']],
  ['dinner-clock','Zeit','Ich möchte heute um 19 Uhr in Basel Abendessen gehen.',['Abendessen heute um 19:00 Uhr Europe/Zurich in Basel.','Keine zusätzliche Richtung oder Pflicht erfinden.']],
 ];
 return rows.map(([key,field,query,obligations],index)=>({id:`german-diag-${String(index+1).padStart(2,'0')}-${key}`,field,query,obligations,reference:GERMAN_REFERENCE,task:'COMPACT_SEARCH_V7',kind:'AUTHORED_GERMAN_DEVELOPMENT_DIAGNOSTIC',independentHumanGold:false,trainingPermission:false}));
}
