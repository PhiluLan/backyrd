// Deliberately small Product registry for explicit Basel Decision language.
// This is not a general geocoding platform: every entry is a reviewed,
// deterministic request anchor and every candidate is checked against its
// existing Product coordinates.
export const BASEL_DECISION_LOCATIONS = Object.freeze({
  GUNDELI:Object.freeze({kind:"QUARTER",label:"Gundeli",latitude:47.5414,longitude:7.5894,defaultRadiusKm:1.15,aliases:["gundeli","gundeldingen"]}),
  KLEINBASEL:Object.freeze({kind:"QUARTER",label:"Kleinbasel",latitude:47.5652,longitude:7.5977,defaultRadiusKm:1.35,aliases:["kleinbasel","klein basel"]}),
  BASEL_SBB:Object.freeze({kind:"LANDMARK",label:"Basel SBB",latitude:47.54757,longitude:7.58956,defaultRadiusKm:.8,aliases:["basel sbb","bahnhof sbb","beim sbb","nahe sbb"]}),
  MARKTPLATZ:Object.freeze({kind:"LANDMARK",label:"Marktplatz",latitude:47.55839,longitude:7.58818,defaultRadiusKm:1,aliases:["marktplatz"]}),
});

// WGS84 reference points for the municipality of Basel. A point on a named
// street axis or at a ferry landing represents a search origin.
const sourceUrls = Object.freeze({
  BASEL_STREET_NAMES: 'https://data.bs.ch/explore/dataset/100189/information/',
  BASEL_POI: 'https://data.bs.ch/explore/dataset/100015/information/',
  WIKIDATA: 'https://www.wikidata.org/wiki/',
  GEONAMES: 'https://www.geonames.org/',
});

// Adapted from the Nomenklaturkommission and Grundbuch- und Vermessungsamt
// of Basel-Stadt, and GeoNames, under https://creativecommons.org/licenses/by/4.0/.
// Selected names, rounded coordinates and editorial aliases are included.
// Wikidata coordinates are released under https://creativecommons.org/publicdomain/zero/1.0/.
const rows = [
  ["BAHNHOF_PASSERELLE", "Bahnhof-Passerelle", "BRIDGE", 47.546592, 7.588735, "BASEL_STREET_NAMES", "1831", []],
  ["BIRSKOPFSTEG", "Birskopfsteg", "BRIDGE", 47.557296, 7.617277, "BASEL_STREET_NAMES", "668", []],
  ["DORENBACHVIADUKT", "Dorenbachviadukt", "BRIDGE", 47.544131, 7.578392, "BASEL_STREET_NAMES", "126", []],
  ["DREIROSENBRUCKE", "Dreirosenbrücke", "BRIDGE", 47.570754, 7.585129, "BASEL_STREET_NAMES", "739", ["Drei-Rosen-Brücke", "Drei Rosen Brücke"]],
  ["EISENBAHNBRUCKE", "Eisenbahnbrücke", "BRIDGE", 47.557404, 7.61498, "BASEL_STREET_NAMES", "740", ["Rhein-Eisenbahnbrücke", "Basler Eisenbahnbrücke"]],
  ["EISERNER_STEG", "Eiserner Steg", "BRIDGE", 47.576085, 7.618803, "BASEL_STREET_NAMES", "792", []],
  ["ERLENPARKSTEG", "Erlenparksteg", "BRIDGE", 47.57551, 7.609668, "BASEL_STREET_NAMES", "791", []],
  ["FLAMINGOSTEG", "Flamingosteg", "BRIDGE", 47.548862, 7.583601, "BASEL_STREET_NAMES", "721", []],
  ["FREIBURGERSTEG", "Freiburgersteg", "BRIDGE", 47.57434, 7.602067, "BASEL_STREET_NAMES", "815", []],
  ["GUNDELI_PASSERELLE", "Gundeli-Passerelle", "BRIDGE", 47.545305, 7.595774, "BASEL_STREET_NAMES", "703", []],
  ["HEUWAAGE_VIADUKT", "Heuwaage-Viadukt", "BRIDGE", 47.550838, 7.587466, "BASEL_STREET_NAMES", "691", []],
  ["HOCHBERGERSTEG", "Hochbergersteg", "BRIDGE", 47.574736, 7.598401, "BASEL_STREET_NAMES", "995", []],
  ["HOHE_WINDE_STEG", "Hohe Winde-Steg", "BRIDGE", 47.533624, 7.588018, "BASEL_STREET_NAMES", "693", []],
  ["JOHANNITERBRUCKE", "Johanniterbrücke", "BRIDGE", 47.564865, 7.585601, "BASEL_STREET_NAMES", "741", ["Johanniter-Brücke"]],
  ["LUZERNERRING_BRUCKE", "Luzernerring-Brücke", "BRIDGE", 47.569976, 7.572571, "BASEL_STREET_NAMES", "1842", []],
  ["MARGARETHENBRUCKE", "Margarethenbrücke", "BRIDGE", 47.548095, 7.585343, "BASEL_STREET_NAMES", "1839", []],
  ["MARKTHALLENBRUCKE", "Markthallenbrücke", "BRIDGE", 47.549461, 7.588681, "BASEL_STREET_NAMES", "409", []],
  ["MITTLERE_RHEINBRUCKE", "Mittlere Rheinbrücke", "BRIDGE", 47.560189, 7.589806, "BASEL_STREET_NAMES", "742", ["Mittlere Brücke", "Mittelrheinbrücke", "Mittlere Rhein Brücke"]],
  ["MUNCHENSTEINERBRUCKE", "Münchensteinerbrücke", "BRIDGE", 47.543933, 7.599081, "BASEL_STREET_NAMES", "1841", []],
  ["NEUSATZSTEG", "Neusatzsteg", "BRIDGE", 47.545996, 7.61721, "BASEL_STREET_NAMES", "429", []],
  ["PASSWANGSTEG", "Passwangsteg", "BRIDGE", 47.537993, 7.594632, "BASEL_STREET_NAMES", "455", []],
  ["PETER_MERIAN_BRUCKE", "Peter Merian-Brücke", "BRIDGE", 47.545854, 7.592968, "BASEL_STREET_NAMES", "1840", []],
  ["REDINGBRUCKE", "Redingbrücke", "BRIDGE", 47.54738, 7.622582, "BASEL_STREET_NAMES", "508", []],
  ["SCHLACHTHOFBRUCKE", "Schlachthofbrücke", "BRIDGE", 47.575299, 7.563893, "BASEL_STREET_NAMES", "1505", []],
  ["SCHWARZWALDBRUCKE", "Schwarzwaldbrücke", "BRIDGE", 47.557697, 7.614009, "BASEL_STREET_NAMES", "743", ["Schwarzwald-Brücke"]],
  ["STEINENMUHLESTEG", "Steinenmühlesteg", "BRIDGE", 47.552225, 7.587361, "BASEL_STREET_NAMES", "683", []],
  ["STUCKI_STEG", "Stücki-Steg", "BRIDGE", 47.579584, 7.594333, "BASEL_STREET_NAMES", "1891", []],
  ["THIERSTEINERSTEG", "Thiersteinersteg", "BRIDGE", 47.537596, 7.597821, "BASEL_STREET_NAMES", "685", []],
  ["WETTSTEINBRUCKE", "Wettsteinbrücke", "BRIDGE", 47.556427, 7.596071, "BASEL_STREET_NAMES", "744", ["Wettstein-Brücke"]],
  ["WIESENSTEG", "Wiesensteg", "BRIDGE", 47.577758, 7.59552, "BASEL_STREET_NAMES", "989", []],
  ["SPALENTOR", "Spalentor", "CITY_GATE", 47.558111, 7.581389, "WIKIDATA", "Q667144", ["Spalen-Tor"]],
  ["ST_ALBAN_TOR", "St. Alban-Tor", "CITY_GATE", 47.553389, 7.603306, "WIKIDATA", "Q392077", ["St Alban Tor", "Sankt Alban Tor", "Dalbedoor"]],
  ["ST_JOHANNS_TOR", "St. Johanns-Tor", "CITY_GATE", 47.56632, 7.58191, "GEONAMES", "6957214", ["St Johanns Tor", "Sankt Johanns Tor", "Johannstor", "Santihansdoor"]],
  ["KLINGENTAL_FAHRE_VOGEL_GRYFF", "Klingental-Fähre Vogel Gryff", "FERRY", 47.562489, 7.587632, "BASEL_POI", "Klingental-Fähre Vogel Gryff", ["Klingentalfähre"]],
  ["MUNSTER_FAHRE_LEU", "Münster-Fähre Leu", "FERRY", 47.557565, 7.593662, "BASEL_POI", "Münster-Fähre Leu", ["Münsterfähre", "Leu Fähre"]],
  ["ST_ALBAN_FAHRE_WILD_MAA", "St. Alban-Fähre Wild Maa", "FERRY", 47.556072, 7.602474, "BASEL_POI", "St. Alban-Fähre Wild Maa", ["St. Alban-Fähre", "Dalbefähri"]],
  ["ST_JOHANN_FAHRE_UELI", "St. Johann-Fähre Ueli", "FERRY", 47.569421, 7.584885, "BASEL_POI", "St. Johann-Fähre Ueli", ["St. Johann-Fähre", "Ueli Fähre"]],
  ["BASLER_MUNSTER", "Basler Münster", "LANDMARK", 47.556389, 7.5925, "WIKIDATA", "Q666479", ["Münster", "Basel Minster"]],
  ["BASLER_RATHAUS", "Basler Rathaus", "LANDMARK", 47.558306, 7.588306, "WIKIDATA", "Q688984", ["Rathaus Basel", "Rathaus"]],
  ["KASERNE_BASEL", "Kaserne Basel", "LANDMARK", 47.563172, 7.590793, "BASEL_POI", "Kasernenareal", ["Kasernenareal", "Basler Kaserne"]],
  ["KUNSTMUSEUM_BASEL_GEGENWART", "Kunstmuseum Basel Gegenwart", "LANDMARK", 47.554478, 7.601462, "BASEL_POI", "Kunstmuseum Basel | Gegenwart", []],
  ["KUNSTMUSEUM_BASEL_HAUPTBAU", "Kunstmuseum Basel Hauptbau", "LANDMARK", 47.554228, 7.593997, "BASEL_POI", "Kunstmuseum Basel | Hauptbau", []],
  ["KUNSTMUSEUM_BASEL_NEUBAU", "Kunstmuseum Basel Neubau", "LANDMARK", 47.55451, 7.595066, "BASEL_POI", "Kunstmuseum Basel | Neubau", []],
  ["MUSEUM_TINGUELY", "Museum Tinguely", "LANDMARK", 47.55942, 7.611839, "BASEL_POI", "Museum Tinguely", ["Tinguely Museum"]],
  ["ROCHE_TURM_BAU_1", "Roche-Turm Bau 1", "LANDMARK", 47.558311, 7.60765, "WIKIDATA", "Q15712780", ["Roche Turm", "Roche Türme", "Roche Tower"]],
  ["ST_JAKOB_PARK", "St. Jakob-Park", "LANDMARK", 47.541619, 7.620037, "BASEL_POI", "St. Jakob-Park", ["Joggeli", "Stadion St. Jakob-Park"]],
  ["STADTCASINO_BASEL", "Stadtcasino Basel", "LANDMARK", 47.554263, 7.589876, "BASEL_POI", "Stadtcasino", ["Stadtcasino"]],
  ["TINGUELY_BRUNNEN", "Tinguely-Brunnen", "LANDMARK", 47.55364, 7.59062, "BASEL_POI", "Fasnachts-Brunnen (\"Tinguely-Brunnen\")", ["Fasnachtsbrunnen", "Fasnachts-Brunnen"]],
  ["VOLKSHAUS_BASEL", "Volkshaus Basel", "LANDMARK", 47.561016, 7.593663, "BASEL_POI", "Volkshaus Basel", ["Volkshaus"]],
  ["ZOO_BASEL", "Zoo Basel", "LANDMARK", 47.547222, 7.578889, "WIKIDATA", "Q220009", ["Basler Zolli", "Zolli", "Zoologischer Garten Basel"]],
  ["BOTANISCHER_GARTEN_DER_UNIVERSITAT_BASEL", "Botanischer Garten der Universität Basel", "PARK", 47.558611, 7.581667, "WIKIDATA", "Q600792", ["Botanischer Garten Basel"]],
  ["ERLENMATTPARK", "Erlenmattpark", "PARK", 47.571881, 7.600983, "BASEL_POI", "Erlenmattpark", []],
  ["KANNENFELDPARK", "Kannenfeldpark", "PARK", 47.565555, 7.570364, "BASEL_STREET_NAMES", "331", []],
  ["SCHUTZENMATTPARK", "Schützenmattpark", "PARK", 47.552722, 7.574511, "BASEL_STREET_NAMES", "534", []],
  ["SOLITUDE_PARK", "Solitude-Park", "PARK", 47.558434, 7.60955, "BASEL_POI", "Solitude", ["Solitudepark"]],
  ["ST_JOHANNS_PARK", "St. Johanns-Park", "PARK", 47.568243, 7.58165, "BASEL_POI", "St. Johanns-Park", ["Johannspark"]],
  ["TIERPARK_LANGE_ERLEN", "Tierpark Lange Erlen", "PARK", 47.574389, 7.607806, "WIKIDATA", "Q1693413", ["Lange Erlen", "Tierpark Erlen"]],
  ["AESCHENPLATZ", "Aeschenplatz", "SQUARE", 47.551518, 7.59579, "BASEL_STREET_NAMES", "4", ["Äschenplatz"]],
  ["ALLSCHWILERPLATZ", "Allschwilerplatz", "SQUARE", 47.557251, 7.570726, "BASEL_STREET_NAMES", "18", []],
  ["AMPEREPLATZ", "Ampereplatz", "SQUARE", 47.570516, 7.581544, "BASEL_STREET_NAMES", "1878", []],
  ["ANDREASPLATZ", "Andreasplatz", "SQUARE", 47.558165, 7.586453, "BASEL_STREET_NAMES", "24", []],
  ["ANNE_FRANK_PLATZ", "Anne Frank-Platz", "SQUARE", 47.570718, 7.601451, "BASEL_STREET_NAMES", "1939", []],
  ["BARFUSSERPLATZ", "Barfüsserplatz", "SQUARE", 47.554669, 7.589349, "BASEL_STREET_NAMES", "46", ["Barfi", "Barfüßerplatz"]],
  ["BUNDESPLATZ", "Bundesplatz", "SQUARE", 47.551202, 7.575037, "BASEL_STREET_NAMES", "93", []],
  ["BURGFELDERPLATZ", "Burgfelderplatz", "SQUARE", 47.561952, 7.573936, "BASEL_STREET_NAMES", "677", []],
  ["CENTRALBAHNPLATZ", "Centralbahnplatz", "SQUARE", 47.548211, 7.590267, "BASEL_STREET_NAMES", "108", ["Zentralbahnplatz"]],
  ["CHRISTOPH_MERIAN_PLATZ", "Christoph Merian-Platz", "SQUARE", 47.549311, 7.612393, "BASEL_STREET_NAMES", "110", []],
  ["CLARAPLATZ", "Claraplatz", "SQUARE", 47.561806, 7.593846, "BASEL_STREET_NAMES", "782", ["Klaraplatz"]],
  ["ERASMUSPLATZ", "Erasmusplatz", "SQUARE", 47.565919, 7.589113, "BASEL_STREET_NAMES", "798", []],
  ["ERLENMATTPLATZ", "Erlenmattplatz", "SQUARE", 47.570254, 7.598204, "BASEL_STREET_NAMES", "1921", []],
  ["FISCHMARKT", "Fischmarkt", "SQUARE", 47.559232, 7.586981, "BASEL_STREET_NAMES", "172", []],
  ["GOTTHELFPLATZ", "Gotthelfplatz", "SQUARE", 47.553969, 7.568199, "BASEL_STREET_NAMES", "210", []],
  ["HEBELPLATZ", "Hebelplatz", "SQUARE", 47.564816, 7.576026, "BASEL_STREET_NAMES", "238", []],
  ["HELVETIAPLATZ", "Helvetiaplatz", "SQUARE", 47.559479, 7.567084, "BASEL_STREET_NAMES", "246", []],
  ["HERMANN_HESSE_PLATZ", "Hermann Hesse-Platz", "SQUARE", 47.559121, 7.593606, "BASEL_STREET_NAMES", "1943", []],
  ["HOCHBERGERPLATZ", "Hochbergerplatz", "SQUARE", 47.581695, 7.592642, "BASEL_STREET_NAMES", "834", []],
  ["HOLBEINPLATZ", "Holbeinplatz", "SQUARE", 47.555635, 7.584113, "BASEL_STREET_NAMES", "266", []],
  ["HORBURGPLATZ", "Horburgplatz", "SQUARE", 47.570957, 7.594644, "BASEL_STREET_NAMES", "1500", []],
  ["IRIS_VON_ROTEN_PLATZ", "Iris von Roten-Platz", "SQUARE", 47.53883, 7.609134, "BASEL_STREET_NAMES", "1947", []],
  ["IRENE_ZURKINDEN_PLATZ", "Irène Zurkinden-Platz", "SQUARE", 47.537753, 7.608366, "BASEL_STREET_NAMES", "1912", []],
  ["KANNENFELDPLATZ", "Kannenfeldplatz", "SQUARE", 47.565574, 7.573408, "BASEL_STREET_NAMES", "300", []],
  ["KARL_BARTH_PLATZ", "Karl Barth-Platz", "SQUARE", 47.547967, 7.609627, "BASEL_STREET_NAMES", "329", []],
  ["KASERNENVORPLATZ", "Kasernenvorplatz", "SQUARE", 47.562369, 7.589172, "BASEL_POI", "Kasernenvorplatz (Buvette)", []],
  ["KLYBECKPLATZ", "Klybeckplatz", "SQUARE", 47.574123, 7.59034, "BASEL_STREET_NAMES", "1979", []],
  ["KRONENPLATZ", "Kronenplatz", "SQUARE", 47.583069, 7.59242, "BASEL_STREET_NAMES", "863", []],
  ["KUNIGUNDE_PLATZ", "Kunigunde-Platz", "SQUARE", 47.537746, 7.609788, "BASEL_STREET_NAMES", "1962", []],
  ["LEONHARDSKIRCHPLATZ", "Leonhardskirchplatz", "SQUARE", 47.555284, 7.587795, "BASEL_STREET_NAMES", "349", []],
  ["LETZIPLATZ", "Letziplatz", "SQUARE", 47.554357, 7.603831, "BASEL_STREET_NAMES", "368", []],
  ["LOTHRINGERPLATZ", "Lothringerplatz", "SQUARE", 47.571076, 7.574857, "BASEL_STREET_NAMES", "1502", []],
  ["LYSBUCHELPLATZ", "Lysbüchelplatz", "SQUARE", 47.573059, 7.573427, "BASEL_STREET_NAMES", "1944", []],
  ["MAJA_SACHER_PLATZ", "Maja Sacher-Platz", "SQUARE", 47.554331, 7.601997, "BASEL_STREET_NAMES", "395", []],
  ["MARTINSKIRCHPLATZ", "Martinskirchplatz", "SQUARE", 47.55887, 7.588529, "BASEL_STREET_NAMES", "385", []],
  ["MATTHAUSPLATZ", "Matthäusplatz", "SQUARE", 47.567312, 7.592995, "BASEL_STREET_NAMES", "1980", []],
  ["MAX_KAMPF_PLATZ", "Max Kämpf-Platz", "SQUARE", 47.569514, 7.599332, "BASEL_STREET_NAMES", "1916", []],
  ["MERET_OPPENHEIM_PLATZ", "Meret Oppenheim-Platz", "SQUARE", 47.545901, 7.587565, "BASEL_STREET_NAMES", "1827", []],
  ["MESSEPLATZ", "Messeplatz", "SQUARE", 47.563967, 7.600714, "BASEL_STREET_NAMES", "988", []],
  ["MUNSTERPLATZ", "Münsterplatz", "SQUARE", 47.55655, 7.591569, "BASEL_STREET_NAMES", "402", []],
  ["NEUWEILERPLATZ", "Neuweilerplatz", "SQUARE", 47.5469, 7.564877, "BASEL_STREET_NAMES", "422", []],
  ["PETERSKIRCHPLATZ", "Peterskirchplatz", "SQUARE", 47.559302, 7.585121, "BASEL_STREET_NAMES", "453", []],
  ["PETERSPLATZ", "Petersplatz", "SQUARE", 47.558974, 7.583282, "BASEL_STREET_NAMES", "454", []],
  ["PICASSOPLATZ", "Picassoplatz", "SQUARE", 47.553236, 7.594859, "BASEL_STREET_NAMES", "467", []],
  ["RUMELINSPLATZ", "Rümelinsplatz", "SQUARE", 47.5568, 7.587363, "BASEL_STREET_NAMES", "500", []],
  ["RUTIMEYERPLATZ", "Rütimeyerplatz", "SQUARE", 47.549192, 7.575792, "BASEL_STREET_NAMES", "501", []],
  ["SEVOGELPLATZ", "Sevogelplatz", "SQUARE", 47.550635, 7.604119, "BASEL_STREET_NAMES", "542", []],
  ["ST_JOHANNS_PLATZ", "St. Johanns-Platz", "SQUARE", 47.566149, 7.581588, "BASEL_STREET_NAMES", "288", []],
  ["STEINBUHLPLATZ", "Steinbühlplatz", "SQUARE", 47.548683, 7.55883, "BASEL_STREET_NAMES", "567", []],
  ["TELLPLATZ", "Tellplatz", "SQUARE", 47.542915, 7.594262, "BASEL_STREET_NAMES", "593", []],
  ["THEATERPLATZ", "Theaterplatz", "SQUARE", 47.553458, 7.5904, "BASEL_STREET_NAMES", "1974", []],
  ["THEODORSKIRCHPLATZ", "Theodorskirchplatz", "SQUARE", 47.5588, 7.597256, "BASEL_STREET_NAMES", "942", []],
  ["VOGESENPLATZ", "Vogesenplatz", "SQUARE", 47.570212, 7.573202, "BASEL_STREET_NAMES", "1882", []],
  ["VOLTAPLATZ", "Voltaplatz", "SQUARE", 47.57076, 7.577987, "BASEL_STREET_NAMES", "619", []],
  ["WETTSTEINPLATZ", "Wettsteinplatz", "SQUARE", 47.559217, 7.598377, "BASEL_STREET_NAMES", "958", []],
  ["WIELANDPLATZ", "Wielandplatz", "SQUARE", 47.552755, 7.571478, "BASEL_STREET_NAMES", "642", []],
  ["WIESENPLATZ", "Wiesenplatz", "SQUARE", 47.576983, 7.591844, "BASEL_STREET_NAMES", "962", []],
  ["WINKELRIEDPLATZ", "Winkelriedplatz", "SQUARE", 47.543337, 7.588565, "BASEL_STREET_NAMES", "646", []],
  ["BASEL_BADISCHER_BAHNHOF", "Basel Badischer Bahnhof", "STATION", 47.567308, 7.60692, "WIKIDATA", "Q666725", ["Badischer Bahnhof", "Basel Bad Bf", "Badischer Bhf"]],
  ["PFALZ", "Pfalz", "VIEWPOINT", 47.556837, 7.592819, "BASEL_POI", "Pfalz", []],
  ["ELSASSERRHEINWEG", "Elsässerrheinweg", "WAYPOINT", 47.57145, 7.583328, "BASEL_STREET_NAMES", "144", []],
  ["KASERNENHOF", "Kasernenhof", "WAYPOINT", 47.563081, 7.590501, "BASEL_STREET_NAMES", "1953", []],
  ["OBERER_RHEINWEG", "Oberer Rheinweg", "WAYPOINT", 47.558678, 7.593988, "BASEL_STREET_NAMES", "901", []],
  ["SPALENBERG", "Spalenberg", "WAYPOINT", 47.55699, 7.585486, "BASEL_STREET_NAMES", "553", []],
  ["ST_ALBAN_RHEINWEG", "St. Alban-Rheinweg", "WAYPOINT", 47.555581, 7.605145, "BASEL_STREET_NAMES", "12", []],
  ["ST_JOHANNS_RHEINWEG", "St. Johanns-Rheinweg", "WAYPOINT", 47.564113, 7.584639, "BASEL_STREET_NAMES", "289", []],
  ["STEINENVORSTADT", "Steinenvorstadt", "WAYPOINT", 47.552575, 7.588263, "BASEL_STREET_NAMES", "575", []],
  ["UNTERER_RHEINWEG", "Unterer Rheinweg", "WAYPOINT", 47.566804, 7.587594, "BASEL_STREET_NAMES", "902", []],
];

export const BASEL_REFERENCE_POINTS = Object.freeze(Object.fromEntries(rows.map(
  ([id, label, category, latitude, longitude, source, sourceRef, aliases]) => [
    id,
    Object.freeze({
      kind: "LANDMARK", label, category, municipality: "Basel", latitude, longitude,
      aliases: Object.freeze(aliases),
      source: Object.freeze({
        dataset: source,
        reference: sourceRef,
        url: sourceUrls[source] + (source === "WIKIDATA" || source === "GEONAMES" ? sourceRef : ""),
      }),
    }),
  ],
)));

const referenceKey = name => name.normalize("NFKD").toLocaleLowerCase("de-CH")
  .replace(/\p{M}/gu, "").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
const referenceIndex = new Map();
for (const [id, point] of Object.entries(BASEL_REFERENCE_POINTS)) {
  for (const name of [point.label, ...point.aliases]) {
    const key = referenceKey(name);
    const previous = referenceIndex.get(key);
    if (previous && previous.id !== id) throw new Error("basel_reference_alias_conflict");
    referenceIndex.set(key, Object.freeze({ id, ...point }));
  }
}

export function findBaselReferencePoint(name) {
  return referenceIndex.get(referenceKey(name)) ?? null;
}
