// Frozen before baseline/adapter outputs are inspected. Same author as corpus;
// related wordings are transfer checks, not independent blind generalization.
export const transferCases = Object.freeze([
  {id:'transfer-special-mother',query:'Für meine Mutter einen besonderen Abend mit gutem Essen, sie hasst steife Restaurants.',
    expectation:'Essen am Abend, Mutterbezug, besonderer Zweck und Ablehnung steifer Atmosphäre erhalten. Kein Alter, Luxus, Romantik, Datum oder genaue Personenzahl erfinden.'},
  {id:'transfer-unique-open',query:'Etwas Einzigartiges mit meinem Partner erleben, möglichst unter 30 Franken pro Person, die Richtung ist noch offen.',
    expectation:'Einzigartiges Ziel erhalten, Erlebnisrichtung offen lassen, relativen Budgetwunsch und Pro-Person-Bezug erhalten. Keine bestimmte Tätigkeit oder harte Luxus-/Romantikpflicht erfinden; höchstens eine sinnvolle Richtungsfrage.'},
  {id:'transfer-special-vegetarian',query:'Ein spezielles Mittagessen mit Freunden, kein Luxus, vegetarische Option nötig.',
    expectation:'Mittagessen, Freundeskontext, notwendige vegetarische Option und Luxusausschluss erhalten. Speziell darf nicht Luxus oder einen komplett vegetarischen Betrieb voraussetzen.'},
  {id:'transfer-not-special',query:'Nichts Besonderes: einfach einen Kaffee und ein Stück Kuchen.',
    expectation:'Kaffee UND Kuchen erhalten. Verneinte Besonderheit darf nicht als besondere oder exklusive Ortskategorie zur Pflicht werden.'},
  {id:'transfer-special-quiet',query:'Für uns ist ein ruhiges Essen besonders. Ohne Ruhe geht es nicht; ausgefallene Küche ist uns egal.',
    expectation:'Essen und funktional notwendige Ruhe erhalten. Besonderer Wert liegt laut Eingabe in Ruhe; ausgefallene Küche wird nicht benötigt, ist aber nicht automatisch verboten.'},
  {id:'transfer-unique-not-required',query:'Einzigartig muss es nicht sein; Hauptsache ein Mittagessen unter 25 Franken.',
    expectation:'Mittagessen und Preis strikt unter CHF 25 erhalten. Einzigartigkeit ist nicht erforderlich; einzigartige Orte sind dadurch nicht verboten. Keine Personenzahl oder fehlenden Budgetumfang erfinden.'},
]);
