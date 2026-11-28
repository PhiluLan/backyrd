/** Individually authored everyday compositions. No slot multiplication. */
import {
  R,
  P,
  C,
  X,
  O,
  B,
  AND,
  ANY,
  F,
  age,
  money,
  date,
  phase,
  clock,
  duration,
  adult,
  accompany,
  bundle,
} from "./beta-cases.mjs";
const cases = [];
const ref = { now: "2026-11-24T10:00:00Z", timezone: "Europe/Zurich" };
function add(id, theme, de, ch, target, rubric, split = "TRAIN") {
  cases.push({
    id: "everyday-" + id,
    theme: "everyday-" + theme,
    label: "Alltagskompositionen: " + theme,
    split,
    custom: true,
    render: () => ({ de, "de-CH": ch }),
    target: () => target,
    rubric,
    tags: ["compositional", "individually-authored"],
    reference: ref,
  });
}
const activity = (v) => R("experience.activity", v),
  meal = R("food.meal", "meal");
add(
  "daughter-rain",
  "Familie",
  "Bei Regen mit meiner vierjährigen Tochter etwas unternehmen, am liebsten drinnen. Essen gehen ist nicht der Zweck.",
  "Bi Räge mit minere vierjährige Tochter öppis underneh, am liebschte drinne. Go ässe isch nöd s Ziel.",
  bundle(
    [
      activity("offene Entdeckung"),
      R("condition.children", "children_activity"),
      P("offer.area", "indoor"),
      adult,
      C("people.relationship", "daughter", ["p1"]),
      C("people.age", age(4), ["p1"]),
      accompany,
      X("food.meal", "meal"),
    ],
    {
      weatherConditions: [
        { id: "w1", state: "RAIN", role: "CONTEXT", detail: null },
      ],
    },
  ),
  "Bekanntes Entwicklungsproblem: Kindererlebnis, eigenes Alter und Gastronomie nicht verwechseln.",
);
add(
  "grown-son",
  "Familie",
  "Mein Sohn ist 24. Wir möchten Billard spielen und ein Bier trinken, aber keinen Kindergeburtstag buchen.",
  "Min Sohn isch 24. Mir wänd Billard spiele und es Bier trinke, aber kei Chindergeburtstag bueche.",
  bundle([
    activity("billiards"),
    R("food.drink", "beer", ["a2"]),
    adult,
    C("people.relationship", "son", ["p1"]),
    C("people.age", age(24), ["p1"]),
    X("participation.format", "Kindergeburtstag"),
  ]),
  "Bekannter Entwicklungsfall: erwachsener Sohn ist keine minderjährige Person.",
);
add(
  "mum-stairs",
  "Zugang",
  "Mit meiner Mutter ins Museum. Sie schafft keine Treppen, ein stufenloser Eingang ist nötig; einen Rollstuhl hat sie nicht.",
  "Mit minere Mueter is Museum. Sie schafft kei Träp­pe, en stufelose Iigang isch nötig; en Rollstuhl het sie nöd.",
  bundle([
    R("offer.kind", "MUSEUM"),
    adult,
    C("people.relationship", "mother", ["p1"]),
    R("participation.accessibility", "step_free"),
    C("people.mobility_aid", "kein Rollstuhl", ["p1"]),
  ]),
  "Konkrete Zugangsbedingung erhalten; weder Diagnose noch vollständige Rollstuhlgängigkeit behaupten.",
);
add(
  "four-vegan",
  "Ernährung",
  "Wir sind vier zum Essen, nur meine Schwester isst vegan. Für die anderen muss es nicht vegan sein.",
  "Mir sind vier zum Ässe, nur mini Schwöster isst vegan. Für die andere muess es nöd vegan sii.",
  bundle([
    meal,
    R("people.count", { amount: 4, operator: "EQ", unit: "PEOPLE" }, ["g1"]),
    C("people.relationship", "sister", ["p1"]),
    R("food.diet", "vegan", ["p1"]),
  ]),
  "Teilgruppen-Diät nicht auf alle Teilnehmenden ausweiten.",
);
add(
  "birthday-no-luxury",
  "Anlass",
  "Meine Frau hat Geburtstag. Wir wollen gemütlich essen, höchstens 80 Franken zusammen. Teuer muss es gerade nicht sein.",
  "Mini Frau het Geburtstag. Mir wänd gmüetlich ässe, höchstens 80 Franke zäme. Tüür muess es grad nöd sii.",
  bundle([
    meal,
    adult,
    C("people.relationship", "wife", ["p1"]),
    C("experience.occasion", "Geburtstag"),
    R("atmosphere.character", "cozy"),
    R("budget.maximum", money(80)),
    C("budget.scope", { scope: "GROUP_TOTAL" }, []),
    O("budget.qualitative", "expensive"),
  ]),
  "Anlass, Gemütlichkeit und harte Gesamtgrenze erhalten, keine Luxuspflicht.",
);
add(
  "last-minute-snack",
  "Zeit",
  "Ich bin am Bahnhof und habe noch 35 Minuten bis zum Zug. Einen kleinen Snack in der Nähe, ohne Umweg.",
  "Ich bi am Bahnhof und ha no 35 Minute bis zum Zug. En chline Snack i de Nöchi, ohni Umwäg.",
  bundle([
    R("food.meal", "snacks"),
    R("location.proximity", "Bahnhof"),
    R(
      "time.duration",
      duration(35, "AVAILABLE_TOTAL", ["TRAVEL", "ACTIVITY", "RETURN"]),
    ),
  ]),
  "Gesamtzeit vor Zugabfahrt, keine 35 Minuten reine Essensdauer.",
);
add(
  "visit-versus-appointment",
  "Zeit",
  "Heute Abend vegetarisch essen. Morgen um acht muss ich zur Arbeit, das ist nicht die Besuchszeit.",
  "Hüt am Abig vegetarisch ässe. Morn um achti muessi go schaffe, das isch nöd d Bsuechsziit.",
  bundle([
    meal,
    R("food.diet", "vegetarian"),
    R("time.date", date("2026-11-24"), []),
    R("time.day_phase", phase("EVENING"), []),
    C("time.reference", "Arbeit morgen um acht", []),
  ]),
  "Bekannte Zeitverwechslung bleibt Lehrmaterial, kein neuer Blindtest.",
);
add(
  "coffee-read",
  "Ruhe",
  "Allein mit einem Buch Kaffee trinken. Ruhe brauche ich wirklich, ein privater Raum ist nicht nötig.",
  "Elei mit eme Buech Kafi trinke. Rueh bruuchi würkli, en private Ruum isch nöd nötig.",
  bundle([
    R("food.drink", "coffee"),
    C("people.relationship", "alone"),
    C("experience.purpose", "lesen"),
    R("atmosphere.noise", "quiet"),
    O("atmosphere.privacy", "private Raum"),
  ]),
  "Ruhe als Pflicht; allein bedeutet keine exklusive Nutzung.",
);
add(
  "coffee-conversation",
  "Gespräch",
  "Eine gute Freundin wiedersehen und bei einem Kaffee reden können. Ein bisschen Musik ist okay.",
  "E gueti Kollegin wiederseh und bi mene Kafi rede chönne. Es bitzeli Musig isch okay.",
  bundle([
    R("food.drink", "coffee"),
    adult,
    C("people.relationship", "female friend", ["p1"]),
    R("atmosphere.conversation", "conversation_possible"),
    C("atmosphere.music", "Musik akzeptabel"),
  ]),
  "Gesprächsbedingungen erhalten, Musik nicht ausschliessen.",
);
add(
  "rain-fallback",
  "Bedingung",
  "Bei Regen ins Museum, sonst spazieren. Beides ist mit meinem sechsjährigen Sohn geplant.",
  "Bi Räge is Museum, suscht spaziere. Beides isch mit mim sechsjährige Sohn plant.",
  bundle(
    [
      R("offer.kind", "MUSEUM"),
      R("experience.activity", "walking", ["a2"]),
      adult,
      C("people.relationship", "son", ["p1"]),
      C("people.age", age(6), ["p1"]),
      accompany,
    ],
    {
      logic: { kind: "IF", conditionFactId: "w1", then: F(1), else: F(2) },
      weatherConditions: [
        { id: "w1", state: "RAIN", role: "CONDITIONAL", detail: null },
      ],
    },
  ),
  "Wetterzweige und gemeinsame Begleitung getrennt erhalten.",
);
add(
  "bowling-pizza",
  "Kombination",
  "Bowling und danach Pizza am selben Ort. Wir sind fünf und haben zusammen höchstens 150 Franken für beides.",
  "Bowling und nachher Pizza am gliiche Ort. Mir sind füf und händ zäme höchstens 150 Franke für beides.",
  bundle(
    [
      activity("bowling"),
      R("food.dish", "Pizza", ["a2"]),
      R("people.count", { amount: 5, operator: "EQ", unit: "PEOPLE" }, ["g1"]),
      R("budget.maximum", money(150), ["a1", "a2"]),
      C("budget.scope", { scope: "GROUP_TOTAL" }, ["a1", "a2"]),
    ],
    {
      logic: AND(1, 2),
      bindings: [B("SEQUENCE", 1, 2), B("SAME_PLACE", 1, 2)],
    },
  ),
  "Gesamtbudget für beide Angebote statt zweimal 150 Franken.",
);
add(
  "pool-no-hotel",
  "Zugang",
  "Schwimmen in einem Hotel, ohne Übernachtung. Ich brauche Zugang als externer Gast, keinen Wellnessaufenthalt.",
  "Schwümme i mene Hotel, ohni Übernachtig. Ich bruuche Zuegang als externe Gascht, kei Wellnessufenthalt.",
  bundle([
    activity("swimming"),
    R("offer.kind", "HOTEL"),
    R("participation.permission", "public_day_access"),
    O("experience.activity", "wellness"),
  ]),
  "Externer Tageszugang ist eine Pflicht; Hotelaufenthalt nicht hinzufügen.",
);
add(
  "play-own-food",
  "Familie",
  "Mit beiden Kindern auf einen Spielplatz. Wir bringen das Essen mit, ein Restaurant ist nicht nötig.",
  "Mit beidne Chind uf en Spielplatz. Mir bringed s Ässe mit, es Restaurant isch nöd nötig.",
  bundle([
    activity("playground"),
    adult,
    C("people.relationship", "child", ["p1"]),
    C("people.relationship", "child", ["p2"]),
    accompany,
    R("participation.permission", "own_food"),
    O("offer.kind", "RESTAURANT"),
  ]),
  "Kinderanzahl nicht als gesamte Gruppe behandeln, Mitbringen als Erlaubnis.",
);
add(
  "bike-radius",
  "Mobilität",
  "Ein Museum, maximal drei Kilometer von mir entfernt. Ich komme mit dem Velo; die Besuchsdauer ist offen.",
  "Es Museum, maximal drei Kilometer vo mir ewäg. Ich chum mit em Velo; d Bsuechsduur isch offe.",
  bundle(
    [
      R("offer.kind", "MUSEUM"),
      R("location.distance", {
        amount: 3000,
        operator: "LTE",
        unit: "METERS",
        referenceEntityId: null,
      }),
      R("travel.mode", "bicycle"),
    ],
    {
      uncertainties: [
        { description: "Die Besuchsdauer ist offen.", relatedIds: [] },
      ],
    },
  ),
  "Entfernung nicht in Reisezeit umrechnen und keine Dauer ergänzen.",
);
add(
  "entry-budget",
  "Preisumfang",
  "Eine Ausstellung anschauen, Eintritt höchstens zwölf Franken pro Person. Kaffee danach zahlen wir separat.",
  "E Usstellig aluege, Iitritt höchstens zwölf Franke pro Person. Kafi nachher zahled mir separat.",
  bundle(
    [
      activity("exhibition"),
      R("budget.maximum", money(12)),
      C("budget.scope", { scope: "PER_PERSON" }, []),
      C("budget.coverage", "entry_only"),
      R("food.drink", "coffee", ["a2"]),
    ],
    { bindings: [B("SEQUENCE", 1, 5)] },
  ),
  "Eintrittsgrenze gilt nicht für späteren Kaffee; ausgeschriebene Zahl erhalten.",
);
add(
  "gift-taste-unknown",
  "Geschenk",
  "Für meinen Bruder zum Abschied etwas Besonderes. Seine Interessen kenne ich nicht und ob ich mitgehe, ist noch offen.",
  "Für min Brüeder zum Abschied öppis Bsunders. Sini Interesse kenn ich nöd und ob ich mitgah, isch no offe.",
  bundle(
    [
      C("people.relationship", "brother", ["p1"]),
      C("experience.occasion", "Abschied"),
      P("experience.character", "besonders"),
    ],
    {
      uncertainties: [
        {
          description: "Interessen und gemeinsame Teilnahme sind offen.",
          relatedIds: ["p1"],
        },
      ],
      clarification: {
        dimension: "EXPERIENCE_DIRECTION",
        question: "Welche Erlebnisrichtung könnte deinem Bruder gefallen?",
        options: ["Essen und Trinken", "Kultur", "Aktiv werden"],
      },
    },
  ),
  "Keine gemeinsame Teilnahme oder bestimmte Aktivität erfinden.",
);
add(
  "meeting-two-hours",
  "Arbeit",
  "Für unser Team zu sechst einen ruhigen Raum für zwei Stunden. Essen brauchen wir nicht, WLAN schon.",
  "Für euses Team z sechst en ruhige Ruum für zwei Stunde. Ässe bruuched mir nöd, WLAN scho.",
  bundle([
    R("offer.facility", "meeting_room"),
    R("people.count", { amount: 6, operator: "EQ", unit: "PEOPLE" }, ["g1"]),
    R("atmosphere.noise", "quiet"),
    R("time.duration", {
      amount: 120,
      operator: "EQ",
      unit: "MINUTES",
      measurementScope: "VISIT",
      includes: ["ACTIVITY"],
    }),
    O("food.meal", "meal"),
    R("offer.feature", "wifi"),
  ]),
  "Arbeitsraum mit Dauer und Ausstattung, keine Gastronomiepflicht.",
  "DEV",
);
add(
  "two-budgets",
  "Preisumfang",
  "Fürs Kino höchstens 20 Franken, danach für das Essen höchstens 30 Franken.",
  "Fürs Kino höchstens 20 Franke, nachher fürs Ässe höchstens 30 Franke.",
  bundle(
    [
      activity("cinema"),
      R("budget.maximum", money(20)),
      R("food.meal", "meal", ["a2"]),
      R("budget.maximum", money(30), ["a2"]),
    ],
    { bindings: [B("SEQUENCE", 1, 3)] },
  ),
  "Zwei getrennte Angebotsbudgets mit ihren Bezügen erhalten.",
  "DEV",
);
add(
  "toddler-optional-food",
  "Familie",
  "Mit meiner zweijährigen Tochter drinnen spielen, ein Snack vor Ort wäre praktisch, aber wir können ihn auch mitbringen.",
  "Mit minere zweijährige Tochter drinne spiele, en Snack vor Ort wär praktisch, aber mir chönd en au mitbringe.",
  bundle(
    [
      activity("playing"),
      R("condition.children", "children_activity"),
      R("offer.area", "indoor"),
      adult,
      C("people.relationship", "daughter", ["p1"]),
      C("people.age", age(2), ["p1"]),
      accompany,
      P("food.meal", "snacks", ["a2"]),
    ],
    { bindings: [B("SAME_PLACE", 1, 8)] },
  ),
  "Kinderspiel ist Hauptzweck; Snack-Verkauf ist nur optional, keine ungenannte Mitbringerlaubnis garantieren.",
  "DEV",
);
add(
  "jazz-not-any",
  "Musik",
  "Live-Jazz mit meiner Mutter, und wir müssen sitzen können. Eine Playlist reicht uns nicht.",
  "Live-Jazz mit minere Mueter, und mir müend sitze chönne. E Playlist längt eus nöd.",
  bundle([
    R("atmosphere.music", "live_jazz"),
    adult,
    C("people.relationship", "mother", ["p1"]),
    R("offer.facility", "seating"),
  ]),
  "Live-Jazz nicht durch beliebige Musik oder eine Playlist ersetzen.",
  "DEV",
);
add(
  "outdoor-no-sport",
  "Erholung",
  "Draussen etwas erleben, aber kein Sport und keine Wanderung. Mein Vater kommt mit.",
  "Dusse öppis erlebe, aber kei Sport und kei Wanderig. Min Vater chunnt mit.",
  bundle([
    activity("offene Entdeckung"),
    R("offer.area", "outdoor"),
    X("experience.activity", "sport"),
    X("experience.activity", "hiking"),
    adult,
    C("people.relationship", "father", ["p1"]),
  ]),
  "Offener Aussenwunsch mit Aktivitätsausschlüssen, kein Sport-Standardvorschlag.",
  "DEV",
);
add(
  "vegetarian-not-vegan",
  "Ernährung",
  "Zu zweit vegetarisch essen. Vegan muss es nicht sein und ein Glas Wein wäre schön.",
  "Z zweit vegetarisch ässe. Vegan muess es nöd sii und es Glas Wii wär schön.",
  bundle([
    meal,
    R("people.count", { amount: 2, operator: "EQ", unit: "PEOPLE" }, ["g1"]),
    R("food.diet", "vegetarian"),
    O("food.diet", "vegan"),
    P("food.drink", "wine", ["a2"]),
  ]),
  "Vegetarisch erforderlich, vegan nicht erforderlich, Wein nur bevorzugt.",
  "DEV",
);
add(
  "bad-weather-backup",
  "Alternative",
  "Am liebsten eine Führung draussen, nur bei schlechtem Wetter eine Ausstellung drinnen.",
  "Am liebschte e Füehrig dusse, nur bi schlächtem Wätter e Usstellig drinne.",
  bundle(
    [
      activity("guided_tour"),
      R("offer.area", "outdoor"),
      R("experience.activity", "exhibition", ["a2"]),
      R("offer.area", "indoor", ["a2"]),
    ],
    {
      logic: {
        kind: "IF",
        conditionFactId: "w1",
        then: AND(3, 4),
        else: AND(1, 2),
      },
      weatherConditions: [
        {
          id: "w1",
          state: "UNSUITABLE",
          role: "CONDITIONAL",
          detail: "schlechtes Wetter",
        },
      ],
    },
  ),
  "Wetterzweige mit ihren eigenen Bereichen erhalten.",
  "DEV",
);
add(
  "small-child-no-stairs",
  "Zugang",
  "Mit dem Kinderwagen Kaffee trinken. Ein ebenerdiger Zugang ist Pflicht, eine Wickelmöglichkeit wäre zusätzlich schön.",
  "Mit em Chinderwage Kafi trinke. En ebenerdige Zuegang isch Pflicht, e Wickelmöglichkeit wär zusätzlich schön.",
  bundle([
    R("food.drink", "coffee"),
    C("people.mobility_aid", "stroller"),
    R("participation.accessibility", "step_free"),
    P("offer.facility", "baby_changing"),
  ]),
  "Zugang hart und Ausstattung weich unterscheiden; kein Kinderalter aus dem Wagen erfinden.",
  "DEV",
);
add(
  "basel-before-train",
  "Ort",
  "In Basel vor der Zugfahrt frühstücken. Der Ort muss nahe am Bahnhof sein; ich habe insgesamt 45 Minuten.",
  "Z Basel vor de Zugfahrt zmörgele. De Ort muess nöch bim Bahnhof sii; ich ha insgesamt 45 Minute.",
  bundle([
    R("food.meal", "breakfast"),
    R("location.destination", "Basel"),
    R("location.proximity", "Bahnhof"),
    R("time.duration", duration(45, "AVAILABLE_TOTAL", ["TRAVEL", "ACTIVITY"])),
  ]),
  "Stadt, Bezugspunkt und Gesamtzeit erhalten; keine Zugverbindung erfinden.",
  "DEV",
);
add(
  "solo-course",
  "Aktivität",
  "Allein einen Keramikkurs besuchen. Ich möchte mich einzeln anmelden können; ich verlange keinen Einzelunterricht.",
  "Elei en Keramikkurs bsueche. Ich möcht mich einzeln aamälde chönne; ich verlange kei Einzelunterricht.",
  bundle([
    activity("ceramics_course"),
    C("people.relationship", "alone"),
    R("participation.group_access", "individual_registration"),
    O("participation.format", "private_lesson"),
  ]),
  "Allein anmelden ist kein privater Unterricht.",
  "DEV",
);
add(
  "daughter-and-aunt",
  "Familie",
  "Meine Tochter ist fünf. Sie und meine Tante kommen mit mir ins Museum.",
  "Mini Tochter isch füf. Sie und mini Tante chömed mit mir is Museum.",
  bundle([
    R("offer.kind", "MUSEUM"),
    adult,
    C("people.relationship", "daughter", ["p1"]),
    C("people.age", age(5), ["p1"]),
    C("people.relationship", "aunt", ["p2"]),
    accompany,
  ]),
  "Drei Rollen ohne erfundene vollständige Gruppenzahl oder Erwachsenenalter.",
  "TEST",
);
add(
  "night-no-club",
  "Abend",
  "Morgen Abend mit Freunden etwas unternehmen, aber weder Club noch Bar. Essen ist nicht unser Ziel.",
  "Morn am Abig mit Fründe öppis underneh, aber weder Club no Bar. Ässe isch nöd euses Ziel.",
  bundle([
    activity("offene Entdeckung"),
    C("people.relationship", "friends", ["g1"]),
    R("time.date", date("2026-11-25"), []),
    R("time.day_phase", phase("EVENING"), []),
    X("offer.kind", "NIGHTCLUB"),
    X("offer.kind", "BAR"),
    X("food.meal", "meal"),
  ]),
  "Abend mit Freunden nicht pauschal in Nachtleben oder Gastronomie übersetzen.",
  "TEST",
);
add(
  "grandpa-capability",
  "Personen",
  "Mein Grossvater spielt gern Billard. Sein Alter habe ich nicht genannt und er braucht keine besondere Betreuung.",
  "Min Grossvater spielt gern Billard. Sis Alter hani nöd gnennt und er brucht kei bsunderi Betreuig.",
  bundle(
    [
      activity("billiards"),
      C("people.relationship", "grandfather", ["p1"]),
      O("participation.requirement", "special_assistance"),
    ],
    {
      uncertainties: [
        {
          description: "Das genaue Alter wurde nicht genannt.",
          relatedIds: ["p1"],
        },
      ],
    },
  ),
  "Keine Gebrechlichkeit, Alterszahl oder Zugangsbedingung aus Grossvater ableiten.",
  "TEST",
);
add(
  "food-same-site-diet",
  "Kombination",
  "Erst Minigolf, danach am selben Ort essen. Eine gute Freundin von mir braucht glutenfreie Optionen, ich nicht.",
  "Zerscht Minigolf, nachher am gliiche Ort ässe. E gueti Kollegin vo mir brucht glutenfreii Optione, ich nöd.",
  bundle(
    [
      activity("mini_golf"),
      R("food.meal", "meal", ["a2"]),
      adult,
      C("people.relationship", "female friend", ["p1"]),
      R("food.diet", "gluten_free", ["p1"]),
    ],
    { bindings: [B("SEQUENCE", 1, 2), B("SAME_PLACE", 1, 2)] },
  ),
  "Ernährung betrifft eine Person im Essensangebot, nicht die Sportaktivität oder alle Gäste.",
  "TEST",
);
add(
  "total-free-transport",
  "Budget",
  "Ein kostenloser Ausflug mit den Kindern, aber das Zugbillett darf etwas kosten. Vor Ort möchte ich nichts bezahlen.",
  "En gratis Usflug mit de Chind, aber s Zugbillet darf öppis choschte. Vor Ort möcht ich nüt zahle.",
  bundle([
    activity("offene Entdeckung"),
    R("condition.children", "children_activity"),
    adult,
    C("people.relationship", "children", ["g1"]),
    accompany,
    R("budget.maximum", money(0, "LTE", "UNSPECIFIED")),
    C("budget.coverage", "on_site_only"),
  ]),
  "Nullgrenze betrifft den Besuch vor Ort, keine kostenlose Anreise verlangen.",
  "TEST",
);
add(
  "friday-time-window",
  "Zeit",
  "Am 27. November zwischen 15 und 17 Uhr eine Ausstellung besuchen; danach brauche ich keine weitere Aktivität.",
  "Am 27. November zwüsche 15 und 17 Uhr e Usstellig bsueche; nachher bruuchi kei wiiteri Aktivität.",
  bundle([
    activity("exhibition"),
    R("time.date", date("2026-11-27"), []),
    R("time.clock_start", clock("15:00", "GTE"), []),
    R("time.clock_end", clock("17:00", "LTE"), []),
  ]),
  "Explizites Zeitfenster, keine Besuchsdauer von genau zwei Stunden oder Zusatzaktivität erfinden.",
  "TEST",
);
add(
  "restaurant-no-cuisine",
  "Essen",
  "Ein Restaurant für heute Abend. Welche Küche, ist uns egal; draussen sitzen müssen wir nicht.",
  "Es Restaurant für hüt am Abig. Weli Chuchi isch eus egal; dusse sitze müemer nöd.",
  bundle([
    R("offer.kind", "RESTAURANT"),
    R("time.date", date("2026-11-24"), []),
    R("time.day_phase", phase("EVENING"), []),
    O("offer.area", "outdoor"),
  ]),
  "Keine konkrete Küche, keine Outdoor-Pflicht und keine zusätzliche Speise erfinden.",
  "TEST",
);
add(
  "specific-beer-tour",
  "Aktivität",
  "Eine geführte Brauereibesichtigung, nicht bloss eine Bar mit Bier. Alkohol trinken ist für mich nicht nötig.",
  "E gfüehrti Brauereibesichtigung, nöd bloss e Bar mit Bier. Alkohol trinke isch für mich nöd nötig.",
  bundle([
    activity("brewery_tour"),
    R("participation.format", "guided"),
    O("food.drink", "alcohol"),
  ]),
  "Gewünschte Führung nicht durch Bierkonsum ersetzen; nicht erforderlicher Alkohol ist kein Alkoholverbot.",
  "TEST",
);
add(
  "birthday-personality",
  "Anlass",
  "Zum Geburtstag meiner Schwester etwas Kreatives, einen Töpferkurs fände sie schön. Ein teures Dinner möchte sie nicht.",
  "Zum Geburtstag vo minere Schwöster öppis Kreativs, en Töpferkurs fänd sie schön. Es tüürs Dinner will sie nöd.",
  bundle([
    C("people.relationship", "sister", ["p1"]),
    C("experience.occasion", "Geburtstag"),
    R("experience.character", "creative"),
    P("experience.activity", "ceramics_course"),
    X("food.meal", "teures Dinner"),
  ]),
  "Kreative Richtung erhalten; konkreter Kurs ist bevorzugt und Dinnerausschluss darf keine Geldgrenze erfinden.",
  "TEST",
);
add(
  "no-exact-venue",
  "Ort",
  "Eine ruhige Bibliothek, nicht unbedingt die, in der ich früher war. Den Namen weiss ich nicht mehr.",
  "E ruhigi Bibliothek, nöd unbedingt die, woni früener gsi bi. De Name weiss ich nüm.",
  bundle([R("offer.kind", "LIBRARY"), R("atmosphere.noise", "quiet")], {
    uncertainties: [
      {
        description:
          "Der Name der früher besuchten Bibliothek ist unbekannt und kein verbindliches Suchziel.",
        relatedIds: [],
      },
    ],
  }),
  "Keine frühere Ortsidentität erfinden und die Suche nicht unnötig daran blockieren.",
  "TEST",
);
add(
  "hotel-breakfast",
  "Hotel",
  "Ein Hotel für zwei Personen, Frühstück am selben Ort ist Pflicht, ein Spa brauchen wir nicht.",
  "Es Hotel für zwei Persone, Zmorge am gliiche Ort isch Pflicht, es Spa bruuched mir nöd.",
  bundle(
    [
      R("offer.kind", "HOTEL"),
      R("food.meal", "breakfast", ["a2"]),
      R("people.count", { amount: 2, operator: "EQ", unit: "PEOPLE" }, ["g1"]),
      O("offer.facility", "spa"),
    ],
    { bindings: [B("SAME_PLACE", 1, 2)] },
  ),
  "Hoteltyp, Personenzahl und Frühstückspflicht erhalten; keine Spa-Pflicht und keine Verfügbarkeit erfinden.",
);
add(
  "hotel-dates",
  "Hotel",
  "Vom 27. bis 29. November ein Hotel in Basel. Ein genaues Zimmerbudget habe ich noch nicht genannt.",
  "Vom 27. bis 29. November es Hotel z Basel. Es genaues Zimmerbudget hani no nöd gnennt.",
  bundle(
    [
      R("offer.kind", "HOTEL"),
      R("location.destination", "Basel"),
      R("time.date_start", { ...date("2026-11-27"), operator: "GTE" }, []),
      R("time.date_end", { ...date("2026-11-29"), operator: "LTE" }, []),
    ],
    {
      uncertainties: [
        { description: "Das Zimmerbudget ist noch offen.", relatedIds: [] },
      ],
    },
  ),
  "Datumsbereich am Referenzjahr binden; keine Check-in-Uhrzeit oder freie Zimmer behaupten.",
  "DEV",
);
add(
  "hotel-restaurant-external",
  "Hotel",
  "In einem Hotelrestaurant essen, obwohl wir nicht im Hotel übernachten. Vegetarisch muss möglich sein.",
  "I mene Hotelrestaurant ässe, obwohl mir nöd im Hotel übernachtet. Vegetarisch muess möglich sii.",
  bundle([
    R("offer.kind", "RESTAURANT"),
    R("food.meal", "meal"),
    R("participation.permission", "public_day_access"),
    R("food.diet", "vegetarian"),
    X("experience.activity", "overnight_stay"),
  ], {
    extensions: [{description: "Das Restaurant soll sich in einem Hotel befinden.", modality: "REQUIRED", basis: "EXPLICIT", subjectIds: ["a1"]}],
  }),
  "Restaurantnutzung und Zugang externer Gäste, keine Zimmerbuchung statt Essenswunsch.",
  "TEST",
);


// Individually composed after the Philipp/Tobi role reviews. No activity-slot cross product.
// These personas are review lenses, never unspoken preferences or inferred user identity.
const daughter4 = () => [adult, C("people.relationship", "daughter", ["p1"]), C("people.age", age(4), ["p1"]), accompany, R("condition.children", "children_activity")];
const openActivity = () => activity("offene Entdeckung");
const basel = () => R("location.destination", "Basel");
const todayEvening = () => [R("time.date", date("2026-11-24"), []), R("time.day_phase", phase("EVENING"), [])];
const tomorrow = () => R("time.date", date("2026-11-25"), []);
const ext = (description, modality = "PREFERRED", subjectIds = ["a1"]) => ({description, modality, subjectIds, basis: "EXPLICIT"});
function everyday(id, theme, de, ch, facts, rubric, extra = {}, split = "TRAIN") {
  add(id, "Alltagsreview: " + theme, de, ch, bundle(facts, extra), rubric, split);
}
everyday("kita-discovery", "Familie",
  "Was können wir nach der Kita in Basel noch machen? Meine Tochter ist vier, wir haben insgesamt 90 Minuten. Sie will etwas entdecken, ich lieber nichts Aufwendiges. Bitte nicht schon wieder Spielplatz.",
  "Was chönnte mir nach dr Kita z Basel no mache? Mini Tochter isch vier, mir händ insgesamt 90 Minute. Sie will öppis entdecke, ich lieber nüt Ufwendigs. Bitte nöd scho wieder Spielplatz.",
  [openActivity(), ...daughter4(), basel(), R("time.duration", duration(90, "AVAILABLE_TOTAL", ["TRAVEL", "ACTIVITY", "RETURN"])), X("experience.activity", "playground")],
  "Gemeinsame Entdeckung mit Vierjähriger, Gesamtzeit und Ausschluss erhalten. Geringer Aufwand ist Wunsch, keine Diagnose oder Ruhepflicht.",
  {extensions: [ext("Das Kind möchte etwas entdecken.", "REQUIRED", ["p1"]), ext("Die Unternehmung soll möglichst wenig Aufwand erfordern.")]});
everyday("both-participate", "Familie",
  "Hast du für Samstag etwas, wo meine vierjährige Tochter selbst etwas ausprobieren kann und ich mitmachen darf, statt nur daneben zu warten?",
  "Hesch für Samschtig öppis, wo mini vierjährigi Tochter selber öppis usprobiere cha und ich mitmache dörf, statt nur denäbe z warte?",
  [openActivity(), ...daughter4(), R("time.date", date("2026-11-28"), [])],
  "Aktive Beteiligung von Kind und Erwachsenem erhalten, keine bestimmte Werkstatt oder Zulassung erfinden.",
  {extensions: [ext("Das Kind soll selbst etwas ausprobieren können.", "REQUIRED", ["p1"]), ext("Auch die anfragende erwachsene Person soll aktiv mitmachen dürfen.", "REQUIRED", ["p0"])]});
everyday("rain-not-playpark", "Familie",
  "Es regnet. Wo kann ich mit meiner vierjährigen Tochter drinnen etwas anschauen oder selbst machen? Heute bitte weder Indoor-Spielpark noch Restaurant.",
  "Es rägnet. Wo cha ich mit minere vierjährige Tochter drinne öppis aluege oder selber mache? Hüt bitte weder Indoor-Spielpark no Restaurant.",
  [openActivity(), ...daughter4(), R("offer.area", "indoor"), R("time.date", date("2026-11-24"), []), X("offer.kind", "INDOOR_PLAY_PARK"), X("offer.kind", "RESTAURANT")],
  "Regen ist Kontext; Indoor ausdrücklich Pflicht. Anschauen oder Selbermachen sind Alternativen, kein erzwungenes Museum.",
  {weatherConditions:[{id:"w1", state:"RAIN", role:"CONTEXT", detail:null}], extensions:[ext("Das Kind soll entweder etwas anschauen oder selbst etwas machen können.", "REQUIRED", ["p1"])]});
everyday("quiet-not-sitting", "Familie",
  "Etwas eher Ruhiges mit meiner vierjährigen Tochter wäre schön. Sie soll aber etwas entdecken können, nur still sitzen passt heute nicht.",
  "Öppis eher Ruehigs mit minere vierjährige Tochter wär schön. Sie söll aber öppis entdecke chönne, nur still sitze passt hüt nöd.",
  [openActivity(), ...daughter4(), P("atmosphere.noise", "quiet"), R("time.date", date("2026-11-24"), [])],
  "Ruhe bleibt Präferenz, Entdeckung fürs Kind und Ausschluss reiner Sitzaktivität getrennt erhalten.",
  {extensions:[ext("Das Kind muss etwas entdecken können.", "REQUIRED", ["p1"]), ext("Ein Angebot, bei dem man nur still sitzt, ist ausgeschlossen.", "EXCLUDED")]});
everyday("family-toilet", "Familie",
  "Was könnten meine vierjährige Tochter und ich draussen machen? Eine Toilette vor Ort brauchen wir unbedingt, ein Café wäre nur praktisch.",
  "Was chönnte mini vierjährigi Tochter und ich dusse mache? Es WC vor Ort bruuche mir unbedingt, es Café wär nur praktisch.",
  [openActivity(), ...daughter4(), R("offer.area", "outdoor"), R("offer.facility", "toilet"), P("offer.kind", "CAFE", ["a2"])],
  "Toilette Pflicht, Café nur Zusatzwunsch, kein Restaurantbesuch statt Kinderaktivität.",
  {bindings:[B("SAME_PLACE", 1, 9)]});
everyday("grandmother-and-child", "Familie",
  "Wir drei, meine Mutter, meine vierjährige Tochter und ich, suchen einen Ausflug. Mama braucht einen stufenlosen Eingang und die Kleine soll sich dort beschäftigen können.",
  "Mir drei, mini Mueter, mini vierjährigi Tochter und ich, sueche en Usflug. Mini Mueter brucht en stufelose Iigang und d Chlii söll sich det beschäftige chönne.",
  [openActivity(), ...daughter4(), C("people.relationship", "mother", ["p2"]), R("people.count", {amount:3, operator:"EQ", unit:"PEOPLE"}, ["g1"]), R("participation.accessibility", "step_free")],
  "Drei explizite Personen; Kinderalter nur Tochter, Zugangsbedarf nicht zum Alter der Mutter umdeuten.",
  {extensions:[ext("Das Kind muss sich am Ausflugsort beschäftigen können.", "REQUIRED", ["p1"])]});
everyday("child-movement", "Familie",
  "Meine Vierjährige hat nach der Kita noch viel Energie. Wo können wir gemeinsam etwas machen, bei dem sie sich bewegen kann? Heute lieber drinnen.",
  "Mini Vierjährigi het nach dr Kita no viel Energie. Wo chönnte mir zäme öppis mache, wo sie sich bewege cha? Hüt lieber drinne.",
  [openActivity(), ...daughter4(), P("offer.area", "indoor"), R("time.date", date("2026-11-24"), []), C("people.capability", "viel Energie", ["p1"])],
  "Energie ist Kinderkontext, Bewegung erforderlich, Indoor Wunsch; keine automatische Sportkategorie.",
  {extensions:[ext("Das Kind soll sich aktiv bewegen können.", "REQUIRED", ["p1"])]});
everyday("family-not-weekend-repeat", "Familie",
  "Mit meiner vierjährigen Tochter wieder etwas entdecken, aber bitte etwas anderes als den Spielplatz vom letzten Wochenende. Ein anderer Spielplatz ist nicht ausgeschlossen.",
  "Mit minere vierjährige Tochter wieder öppis entdecke, aber bitte öppis anders als de Spielplatz vom letschte Wuchenänd. En andere Spielplatz isch nöd usgschlosse.",
  [openActivity(), ...daughter4()],
  "Ausschluss betrifft einen früheren Ort, nicht die ganze Kategorie. Fehlende Besuchshistorie nicht erfinden.",
  {extensions:[ext("Der konkrete Spielplatz vom letzten Wochenende soll nicht wieder vorgeschlagen werden.", "EXCLUDED")], uncertainties:[{description:"Welcher konkrete Spielplatz zuletzt besucht wurde, ist ohne Verlauf unbekannt.", relatedIds:[]}], clarification:{dimension:"OTHER",question:"Welchen Spielplatz habt ihr letztes Wochenende besucht?",options:["Name nennen","Lage beschreiben"]}});
everyday("family-covered-break", "Familie",
  "Hast du eine Idee für draussen mit meiner vierjährigen Tochter, wo wir bei einem Schauer kurz unter ein Dach können?",
  "Hesch e Idee für dusse mit minere vierjährige Tochter, wo mir bi eme Schauer churz under es Dach chönd?",
  [openActivity(), ...daughter4(), R("offer.area", "outdoor"), R("condition.weather_protection", "covered")],
  "Outdoor plus erforderliche Schutzmöglichkeit; kein aktueller Regen und keine vollständige Indoor-Aktivität ableiten.");
everyday("daughter-tram-window", "Familie",
  "Am Sonntag etwas mit meiner vierjährigen Tochter in Basel unternehmen. Mit dem Tram höchstens 20 Minuten hin, danach möchten wir noch Zeit vor Ort haben.",
  "Am Sunntig öppis mit minere vierjährige Tochter z Basel underneh. Mit em Tram höchstens 20 Minute hi, nachher wänd mir no Ziit vor Ort ha.",
  [openActivity(), ...daughter4(), basel(), R("time.date", date("2026-11-29"), []), R("travel.mode", "public_transport"), R("time.duration", duration(20, "TRAVEL", ["TRAVEL"]))],
  "Sonntag am Referenzkalender, nur Hinweg auf 20 Minuten begrenzen. Dauer vor Ort bleibt offen.");
everyday("solo-hidden-calm", "Allein",
  "Hast du einen Tipp in Basel für mich allein? Ruhig muss es sein. Schön, eher unbekannt und abseits der Touristenströme wäre mir lieb. Luxus muss nicht sein.",
  "Hesch en Tipp z Basel für mich elei? Ruehig muess s sii. Schön, eher unbekannt und abseits vo de Tourischteström wär mir lieb. Luxus muess nöd sii.",
  [openActivity(), basel(), C("people.relationship", "alone"), R("atmosphere.noise", "quiet"), O("budget.qualitative", "luxury")],
  "Allein ist keine Privatbuchung. Geheimtipp und wenig touristisch bleiben Wünsche ohne erfundene Besuchsdaten.",
  {extensions:[ext("Ein schöner, wenig touristischer und eher unbekannter Ort wird bevorzugt.")]});
everyday("solo-half-hour", "Allein",
  "Ich habe insgesamt nur 30 Minuten für mich. Gibt es in der Nähe vom Bahnhof Basel etwas Ruhiges zum Abschalten, ohne Konsumzwang?",
  "Ich ha insgesamt nur 30 Minute für mich. Git s i dr Nöchi vom Bahnhof Basel öppis Ruehigs zum Abschalte, ohni Konsumzwang?",
  [openActivity(), basel(), R("location.proximity", "Bahnhof Basel"), C("people.relationship", "alone"), R("atmosphere.noise", "quiet"), R("time.duration", duration(30, "AVAILABLE_TOTAL", ["TRAVEL", "ACTIVITY", "RETURN"]))],
  "Gesamtzeit und fehlenden Konsumzwang erhalten. Daraus weder kostenfreien Eintritt noch Cafézwang ableiten.",
  {extensions:[ext("Es darf keine Pflicht zum Konsumieren geben.", "REQUIRED")]});
everyday("solo-not-private", "Allein",
  "Allein ins Thermalbad, einfach abschalten. Andere Leute stören mich nicht, ich brauche keinen privaten Bereich. Nur laut soll es nicht sein.",
  "Elei is Thermalbad, eifach abschalte. Anderi Lüüt störed mich nöd, ich bruuche kei private Bereich. Nur luut söll s nöd sii.",
  [R("offer.kind", "THERMAL_BATH"), C("people.relationship", "alone"), C("experience.purpose", "abschalten"), O("atmosphere.privacy", "private Raum"), X("atmosphere.noise", "loud")],
  "Solo mit öffentlichem Angebot vereinbar; kein exklusiver Bereich oder menschenleerer Ort.");
everyday("solo-small-exhibition", "Allein",
  "Ich hätte Lust auf eine kleine Ausstellung, allein und ohne Führung. Eher gemütlich als ein riesiges Museum.",
  "Ich hätt Luscht uf e chlini Usstellig, elei und ohni Füehrig. Eher gmüetlich als es riesigs Museum.",
  [activity("exhibition"), C("people.relationship", "alone"), X("participation.format", "guided_tour"), P("atmosphere.character", "cozy")],
  "Kleine Ausstellung erwünscht, keine feste Museumsart oder Uhrzeit erfinden.",
  {extensions:[ext("Eine kleine Ausstellung statt eines sehr grossen Museums wird bevorzugt.")]});
everyday("solo-near-rhine", "Allein",
  "Wo kann ich am Rhein in Basel einfach eine Weile sitzen und schauen? Lieber wenig Trubel, ein Getränk brauche ich nicht.",
  "Wo cha ich am Rhy z Basel eifach e Wili sitze und luege? Lieber wenig Trubel, es Getränk bruuchi nöd.",
  [openActivity(), basel(), R("location.proximity", "Rhein"), C("experience.purpose", "sitzen und schauen"), P("atmosphere.noise", "quiet"), O("food.drink", "Getränk")],
  "Rheinnähe und ruhige Präferenz erhalten; keine konkrete Bank, freie Plätze oder gastronomischen Zwang behaupten.");
everyday("discovery-surprise", "Entdecken",
  "Überrasch mich für heute Abend in Basel. Am liebsten etwas, das ich noch nicht kenne, maximal 60 Franken und kein Club.",
  "Überrasch mich für hüt Abig z Basel. Am liebschte öppis, wo ich no nöd kenn, maximal 60 Franke und kei Club.",
  [openActivity(), basel(), ...todayEvening(), R("budget.maximum", money(60)), X("offer.kind", "NIGHTCLUB")],
  "Offene Entdeckung, Budget und Clubausschluss; Neuigkeitswunsch nicht als gefährlichen Kick oder teuer interpretieren.",
  {extensions:[ext("Ein für mich noch unbekanntes Erlebnis wird bevorzugt.")]});
everyday("spontaneous-tram", "Entdecken",
  "Was kann ich jetzt spontan machen? Höchstens 20 Minuten mit dem Tram hin und ohne Reservation.",
  "Was cha ich jetzt spontan mache? Höchstens 20 Minute mit em Tram hi und ohni Reservation.",
  [openActivity(), R("time.date", date("2026-11-24"), []), R("time.clock", clock("11:00"), []), R("travel.mode", "public_transport"), R("time.duration", duration(20, "TRAVEL", ["TRAVEL"])), R("participation.booking", "walk_in")],
  "Jetzt ist Referenzzeit 11 Uhr lokal, nicht erfundene Verfügbarkeit. Hinweg und Walk-in getrennt prüfen.");
everyday("food-new-not-pricey", "Food",
  "Wo könnte ich etwas essen? Am liebsten etwas, das ich noch nie probiert habe. Darf besonders sein, aber bitte nicht luxuriös. Höchstens 40 Franken pro Person.",
  "Wo chönnt ich öppis ässe? Am liebschte öppis, wo ich no nie probiert ha. Darf bsunders sii, aber bitte nöd luxuriös. Höchstens 40 Franke pro Person.",
  [meal, P("experience.character", "special"), X("budget.qualitative", "luxury"), R("budget.maximum", money(40)), C("budget.scope", {scope:"PER_PERSON"}, [])],
  "Besonders und neu bedeuten keine bestimmte Küche, Luxus oder Hochpreisigkeit.",
  {extensions:[ext("Ein Gericht oder eine Küche, die ich noch nicht probiert habe, wird bevorzugt.")]});
everyday("bar-conversation", "Ausgehen",
  "Kennst du eine Bar im Kleinbasel, wo wir uns gut unterhalten können? Musik gern, aber kein Club.",
  "Kennsch e Bar im Kleinbasel, wo mir eus guet underhalte chönd? Musig gern, aber kei Club.",
  [R("offer.kind", "BAR"), R("location.area", "Kleinbasel"), R("atmosphere.conversation", "conversation_possible"), P("atmosphere.music", "music"), X("offer.kind", "NIGHTCLUB")],
  "Gesprächsmöglichkeit ist Pflicht, Musik Wunsch. Nicht automatisch stille Bar oder bestimmte Getränke verlangen.");
everyday("bar-alcohol-free", "Ausgehen",
  "Cocktailbar für heute Abend, bitte auch gute alkoholfreie Cocktails. Wir wollen weder tanzen noch einen privaten Raum buchen.",
  "Cocktailbar für hüt Abig, bitte au gueti alkoholfreii Cocktails. Mir wänd weder tanze no en private Ruum bueche.",
  [R("offer.kind", "COCKTAIL_BAR"), R("food.drink", "alcohol_free_cocktail"), ...todayEvening(), X("experience.activity", "dancing"), X("atmosphere.privacy", "private Raum")],
  "Alkoholfreies Angebot erforderlich; daraus keine ausschliesslich alkoholfreie Gruppe oder ein Alkoholverbot im Lokal machen.");
everyday("after-late-cinema-food", "Ausgehen",
  "Wenn das Kino um 22 Uhr aus ist, möchten wir in Basel noch etwas Warmes essen. Ein offenes Lokal allein reicht nicht, die warme Küche muss um 22 Uhr noch offen sein.",
  "Wenn s Kino um 22 Uhr us isch, wänd mir z Basel no öppis Warms ässe. Es offes Lokal elei längt nöd, d warmi Chuchi muess um 22 Uhr no offe sii.",
  [meal, basel(), R("time.clock", clock("22:00"), []), C("experience.occasion", "nach dem Kino")],
  "Kino ist vorausgehender Kontext, kein zusätzlicher Suchauftrag. Küchenverfügbarkeit um 22 Uhr als harte Bedingung.",
  {extensions:[ext("Die Küche muss um 22 Uhr noch warme Speisen anbieten.", "REQUIRED")]});
everyday("live-music-not-dance", "Ausgehen",
  "Hast du für morgen Abend Live-Musik in Basel, wo man sitzen kann? Tanzen müssen wir nicht, Eintritt höchstens 25 Franken pro Person.",
  "Hesch für morn Abig Livemusig z Basel, wo me sitze cha? Tanze müemer nöd, Iitritt höchstens 25 Franke pro Person.",
  [activity("live_music"), basel(), tomorrow(), R("time.day_phase", phase("EVENING"), []), R("offer.facility", "seating"), O("experience.activity", "dancing", ["a2"]), R("budget.maximum", money(25)), C("budget.scope", {scope:"PER_PERSON"}, ["a1"]), C("budget.coverage", "entry_only")],
  "Sitzmöglichkeit erforderlich, Tanzen nicht erforderlich und nicht verboten; Eintrittsbudget nicht Gesamtausgaben.");
everyday("spa-tired", "Wellness",
  "Ich bin völlig platt. Wo kann ich morgen zwei Stunden ruhig im Spa abschalten, höchstens 80 Franken?",
  "Ich bi völlig platt. Wo cha ich morn zwei Stund ruehig im Spa abschalte, höchstens 80 Franke?",
  [R("offer.kind", "SPA"), tomorrow(), R("time.duration", {...duration(120, "ACTIVITY", ["ACTIVITY"]), operator:"EQ"}), R("atmosphere.noise", "quiet"), R("budget.maximum", money(80)), C("experience.purpose", "erschöpft abschalten")],
  "Erschöpfung ist Kontext, keine Diagnose. Zwei Stunden vor Ort und harter Preisdeckel erhalten.");
everyday("wellness-clothed", "Wellness",
  "Ein Wellnessnachmittag zu zweit wäre schön. Nur Angebote, bei denen wir Badebekleidung tragen können, bitte keine textilfreie Sauna.",
  "En Wellnessnamittag z zweit wär schön. Nur Agebot, wo mir Badchleider träge chönd, bitte kei textilfreii Sauna.",
  [activity("wellness"), R("time.day_phase", phase("AFTERNOON"), []), R("people.count", {amount:2, operator:"EQ", unit:"PEOPLE"}, ["g1"])],
  "Bekleidungsbedingung ist Pflicht; keine Paarbeziehung oder private Buchung aus zwei Personen ableiten.",
  {extensions:[ext("Badebekleidung muss im gewünschten Wellnessbereich zulässig sein.", "REQUIRED"), ext("Textilfreie Saunabereiche sind ausgeschlossen.", "EXCLUDED")]});
everyday("massage-no-hotel", "Wellness",
  "Wo kann ich eine Massage buchen, ohne Hotelzimmer und ohne Wellnesspaket? Nur die Behandlung, maximal 100 Franken.",
  "Wo cha ich e Massage bueche, ohni Hotelzimmer und ohni Wellnesspaket? Nur d Behandlig, maximal 100 Franke.",
  [activity("massage"), X("participation.format", "wellness_package"), R("budget.maximum", money(100))],
  "Massage ohne Zimmerbuchung oder Paket; Hotels als Behandlungsort bleiben erlaubt. Keine zusätzliche Übernachtungsabsicht ableiten.", {extensions:[ext("Eine Hotelzimmerbuchung für die Massage.", "EXCLUDED")]});
everyday("wellness-alternative", "Wellness",
  "Thermalbad oder Spa für morgen, eines reicht. Ein ruhiger Bereich wäre super, zusammen höchstens 120 Franken für uns zwei.",
  "Thermalbad oder Spa für morn, eis längt. En ruehige Bereich wär super, zäme höchstens 120 Franke für eus zwei.",
  [R("offer.kind", "THERMAL_BATH"), R("offer.kind", "SPA", ["a2"]), tomorrow(), P("atmosphere.noise", "quiet", ["a1", "a2"]), R("budget.maximum", money(120), ["a1", "a2"]), C("budget.scope", {scope:"GROUP_TOTAL"}, ["a1", "a2"]), R("people.count", {amount:2, operator:"EQ", unit:"PEOPLE"}, ["g1"])],
  "Zwei alternative Ziele, nicht zwei Besuche. Gemeinsames Budget und Ruhepräferenz gelten für die gewählte Alternative.", {logic:ANY(1,2)});
everyday("action-beginner", "Aktivität",
  "Ich möchte etwas ausprobieren, am liebsten mit Action. Ich bin Anfänger. Bitte mit einer Einführung vor Ort. Ich habe keine eigene Ausrüstung und muss passende Ausrüstung dort ausleihen können.",
  "Ich möcht öppis usprobiere, am liebschte mit Action. Ich bi Afänger. Bitte mit ere Iifüehrig vor Ort. Ich ha kei eigeti Usrüstig und muess passendi Usrüstig det chönne uslehne.",
  [openActivity(), P("experience.character", "action"), C("people.experience", "beginner"), R("participation.format", "introductory_briefing"), C("offer.equipment_source", "keine eigene Ausrüstung"), R("offer.service", "equipment_rental")],
  "Einführung und Ausleihe ausdrücklich erforderlich, fehlende eigene Ausrüstung ist Kontext. Keine Risikostufe oder konkrete Sportart erfinden.");
everyday("date-not-romantic", "Zusammen",
  "Ein Date in Basel, bei dem wir etwas zusammen machen und reden können. Muss nicht romantisch sein, maximal 70 Franken insgesamt.",
  "Es Date z Basel, wo mir öppis zäme mache und rede chönd. Muess nöd romantisch sii, maximal 70 Franke insgesamt.",
  [openActivity(), basel(), C("experience.occasion", "Date"), R("atmosphere.conversation", "conversation_possible"), O("atmosphere.character", "romantic"), R("budget.maximum", money(70)), C("budget.scope", {scope:"GROUP_TOTAL"}, [])],
  "Gemeinsame Aktivität und Gespräch erhalten. Romantik weder Pflicht noch Ausschluss; keine Restaurantpflicht.");
everyday("friends-different-energy", "Zusammen",
  "Wir sind vier Freunde. Zwei wollen Action, zwei lieber etwas Entspanntes, aber wir möchten zusammenbleiben. Hast du eine Idee?",
  "Mir sind vier Fründe. Zwei wänd Action, zwei lieber öppis Entspannts, aber mir wänd zämeblibe. Hesch e Idee?",
  [openActivity(), R("people.count", {amount:4, operator:"EQ", unit:"PEOPLE"}, ["g1"]), C("people.relationship", "friends", ["g1"]), P("experience.character", "action", ["g2"]), P("atmosphere.character", "relaxed", ["g3"]), C("people.count", {amount:2, operator:"EQ", unit:"PEOPLE"}, ["g2"]), C("people.count", {amount:2, operator:"EQ", unit:"PEOPLE"}, ["g3"])],
  "Zwei Teilgruppen mit unterschiedlichen Wünschen, aber ein gemeinsames Erlebnis. Keine Aufteilung in zwei Touren.",
  {extensions:[ext("Die gesamte Gruppe muss während der Unternehmung zusammenbleiben.", "REQUIRED", ["g1"])]});
everyday("visitor-not-tourist-hotspot", "Zusammen",
  "Ein Kollege besucht mich in Basel. Was könnten wir machen, das typisch für die Stadt ist, aber nicht völlig überlaufen?",
  "En Arbeitskolleg bsuecht mich z Basel. Was chönnte mir mache, wo typisch für d Stadt isch, aber nöd völlig überloffe?",
  [openActivity(), basel(), adult, C("people.relationship", "colleague", ["p1"])],
  "Stadtbezug, gemeinsame Teilnahme und geringe Überfüllung erhalten, keine Sehenswürdigkeit oder tatsächliche Besucherzahl erfinden.",
  {extensions:[ext("Ein stadtcharakteristisches Erlebnis wird bevorzugt."), ext("Völlig überlaufene Angebote sind ausgeschlossen.", "EXCLUDED")]});
everyday("market-short-visit", "Entdecken",
  "Gibt es am Samstag einen Markt in Basel, wo ich einfach ein bisschen schlendern kann? Kaufen muss ich nichts, Eintritt am liebsten gratis.",
  "Git s am Samschtig en Markt z Basel, wo ich eifach es bitzeli schländere cha? Chaufe muessi nüt, Iitritt am liebschte gratis.",
  [R("offer.kind", "MARKET"), basel(), R("time.date", date("2026-11-28"), []), P("budget.maximum", money(0)), C("budget.coverage", "entry_only"), O("experience.activity", "shopping")],
  "Marktbesuch, kein Kaufzwang; Gratiswunsch gilt Eintritt, nicht automatisch alle Waren.");
everyday("spontaneous-saved", "Entdecken",
  "Zeig mir etwas Ähnliches wie meine gespeicherten Orte, aber bitte keines, das schon in meiner Liste steht.",
  "Zeig mir öppis Ähnlichs wie mini gspeicherete Ort, aber bitte keis, wo scho i minere Liste stoht.",
  [openActivity()],
  "Referenz auf gespeicherte Orte erhalten, ohne Listeninhalte zu erfinden. Ohne Zugriff ist eine Rückfrage oder ehrliche Grenze nötig.",
  {extensions:[ext("Die gespeicherten Orte sollen als Ähnlichkeitsreferenz dienen.", "PREFERRED"), ext("Bereits gespeicherte Orte dürfen nicht erneut empfohlen werden.", "EXCLUDED")], uncertainties:[{description:"Die gespeicherten Orte sind im Anfragekontext nicht enthalten.", relatedIds:[]}], clarification:{dimension:"OTHER",question:"Welche gespeicherten Orte meinst du? Nenne mir ein oder zwei als Beispiel.",options:["Beispielort nennen","Beispiellink nennen"]}});
everyday("weather-change", "Entdecken",
  "Eigentlich wollten wir draussen etwas machen, aber jetzt regnet es. Hast du spontan etwas drinnen in Basel, ohne Voranmeldung?",
  "Eigentlich wänd mir dusse öppis mache, aber jetzt rägnet s. Hesch spontan öppis drinne z Basel, ohni Voraamäldig?",
  [openActivity(), basel(), R("offer.area", "indoor"), R("participation.booking", "walk_in")],
  "Aktueller Indoor-Wunsch ersetzt verworfenen Outdoor-Plan; Wetter bleibt Kontext, keine gleichzeitige Bereichspflicht.",
  {weatherConditions:[{id:"w1",state:"RAIN",role:"CONTEXT",detail:null}]});
everyday("money-self-correction", "Selbstkorrektur",
  "Morgen mit Freunden essen gehen, maximal 80 Franken zusammen. Ach nein, 80 pro Person, nicht insgesamt.",
  "Morn mit Fründe go ässe, maximal 80 Franke zäme. Ah nei, 80 pro Person, nöd insgesamt.",
  [meal, tomorrow(), C("people.relationship", "friends", ["g1"]), R("budget.maximum", money(80)), C("budget.scope", {scope:"PER_PERSON"}, [])],
  "Letzte explizite Korrektur entscheidet Preisbasis, nicht zwei widersprüchliche Budgets.");
everyday("voice-short", "Sprache",
  "hast du was für morgen drinnen mit meiner 4 jährigen tochter nicht schon wieder essen gehen",
  "hesch öppis für morn drinne mit minere 4 jährige tochter nöd scho wieder go ässe",
  [openActivity(), tomorrow(), ...daughter4(), R("offer.area", "indoor"), X("food.meal", "meal")],
  "Sprachnahes Fragment ohne Interpunktion; keine Kürzung, Altersverwechslung oder Gastronomiepflicht.");
everyday("mixed-short", "Sprache",
  "Irgendwas zum Runterkommen, Basel, heute Abend. Kein fancy Dinner, lieber etwas Kleines Neues.",
  "Öppis zum Runtercho, Basel, hüt Abig. Kei fancy Dinner, lieber öppis Chliises Neus.",
  [openActivity(), basel(), ...todayEvening(), C("experience.purpose", "runterkommen")],
  "Code-Switch und Entspannungsabsicht erhalten; Dinnerausschluss nicht zum Ausschluss jedes Essens ausweiten.",
  {extensions:[ext("Eine kleine, neue Unternehmung wird bevorzugt."), ext("Ein luxuriöses Dinner.", "EXCLUDED")]});
everyday("supervision-unknown", "Familie",
  "Meine Tochter ist vier und soll ohne mich an einem Angebot teilnehmen. Wer dort auf sie aufpasst, weiss ich noch nicht. Kannst du mir helfen?",
  "Mini Tochter isch vier und söll ohni mich a mene Agebot teilneh. Wer det uf sie ufpasst, weiss ich no nöd. Chasch mir hälfe?",
  [openActivity(), C("people.relationship", "daughter", ["p1"]), C("people.age", age(4), ["p1"]), C("people.relationship", "unaccompanied", ["p1"])],
  "Vierjähriges Kind ohne geklärte Verantwortung ist keine freigegebene Empfehlung; erst Betreuung und Zulassung klären.",
  {uncertainties:[{description:"Geeignete Aufsicht und Anbieterzulassung sind ungeklärt.",relatedIds:["p1"]}], clarification:{dimension:"OTHER",question:"Wer übernimmt die verantwortliche Betreuung? Ohne geklärte Aufsicht und Zulassung kann ich kein Angebot zur Teilnahme ohne dich empfehlen.",options:["Betreuung durch den Anbieter klären","Erwachsene Begleitung organisieren"]}});
everyday("youth-provider-permission", "Familie",
  "Meine 14-jährige Tochter möchte ohne mich einen Töpferkurs besuchen. Bitte nur Angebote, die sie in diesem Alter ohne Eltern und mit Betreuung durch den Anbieter ausdrücklich zulassen.",
  "Mini 14-jährigi Tochter möcht ohni mich en Töpferkurs bsueche. Bitte nur Agebot, wo sie i dem Alter ohni Eltere und mit Betreuig dur de Aabüter ausdrücklich zuelönd.",
  [activity("ceramics_course"), C("people.relationship","daughter",["p1"]), C("people.age",age(14),["p1"]), C("people.relationship","unaccompanied",["p1"])],
  "Keine pauschale Freigabe ab 14. Anbieterbetreuung und explizite Alterszulassung als zwingende Bedingungen erhalten.",
  {extensions:[ext("Der Anbieter muss die Teilnahme ohne Eltern im Alter von 14 Jahren ausdrücklich zulassen und die Betreuung übernehmen.","REQUIRED",["p1"])]});


// Recorded synthetic assistant questions are input context, never live inventory evidence.
function conversation(id, de, ch, previous, deTurns, chTurns, update, rubric) {
  add("conversation-" + id, "Alltagsdialog", de, ch, {
    previous: bundle(previous),
    turns: locale => structuredClone(locale === "de" ? deTurns : chTurns),
    change: locale => {
      const result = update(locale);
      if (result.additions) result.additions = {
        entities: [], facts: [], logic: null, bindings: [], extensions: [],
        uncertainties: [], weatherConditions: [], ...result.additions,
      };
      return result;
    },
  }, rubric);
}
const turn = (question, answer) => ({question, answer});
const changeFact = (id, quote, fact) => ({id, quote, fact: fact === null ? null : {id, ...fact}});
conversation("how-many",
  "Morgen in Basel etwas unternehmen.", "Morn z Basel öppis underneh.",
  [openActivity(), basel(), tomorrow()],
  [turn("Wie viele Personen seid ihr?", "Zu dritt.")],
  [turn("Wie vieli Persone sind ihr?", "Mir sind z dritt.")],
  () => ({changes:[], additions:{entities:[{id:"g1",kind:"GROUP",label:"gemeinsame Gruppe",members:[]}], facts:[{id:"f4",...R("people.count",{amount:3,operator:"EQ",unit:"PEOPLE"},["g1"])}]}}),
  "Echte Rückfrage beantworten; Besuchstag und Stadt behalten. Gruppengrösse nicht als Kinderzahl deuten.");
conversation("family-weather-plan",
  "Morgen mit meiner vierjährigen Tochter in Basel etwas Ruhiges, am liebsten draussen.",
  "Morn mit minere vierjährige Tochter z Basel öppis Ruehigs, am liebschte dusse.",
  [openActivity(), basel(), tomorrow(), ...daughter4(), P("offer.area","outdoor"), R("atmosphere.noise","quiet")],
  [turn("Wäre ein Garten als Richtung interessant?", "Ja, aber morgen soll es regnen. Bitte drinnen, wo sie selber etwas machen kann.")],
  [turn("Wär en Garte als Richtig interessant?", "Ja, aber morn söll s rägne. Bitte drinne, wo sie selber öppis mache cha.")],
  locale => ({changes:[changeFact("f9",locale === "de" ? "Bitte drinnen" : "Bitte drinne",R("offer.area","indoor"))], additions:{extensions:[{id:"e1",...ext("Das Kind soll selbst etwas machen können.","REQUIRED",["p1"])}],weatherConditions:[{id:"w1",state:"RAIN",role:"CONTEXT",basis:"EXPLICIT",subjectIds:[],detail:"Vom Nutzer berichtete Regenprognose für morgen."}]}}),
  "Vorschlagsreaktion mit pronomenhaftem Kindbezug; morgen, Ort, Alter und Ruhe behalten. Prognose ist Nutzerkontext, keine bestätigte Wetterinformation.");
conversation("money-scope",
  "Wir sind zwei zum Essen, höchstens 80 Franken zusammen.",
  "Mir sind zwei zum Ässe, höchstens 80 Franke zäme.",
  [meal,R("budget.maximum",money(80)),C("budget.scope",{scope:"GROUP_TOTAL"},[]),R("people.count",{amount:2,operator:"EQ",unit:"PEOPLE"},["g1"])],
  [turn("Sind die 80 Franken für euch zusammen?", "Nein, die 80 Franken sind pro Person, nicht für uns beide zusammen.")],
  [turn("Sind die 80 Franke für euch zäme?", "Nei, die 80 Franke sind pro Person, nöd für eus beidi zäme.")],
  () => ({changes:[changeFact("f3","pro Person",C("budget.scope",{scope:"PER_PERSON"},[]))]}),
  "Korrektur der Preisbasis ändert weder Betrag noch Gruppengrösse.");
conversation("two-date-corrections",
  "Heute etwas unternehmen, maximal 40 Franken.", "Hüt öppis underneh, maximal 40 Franke.",
  [openActivity(),R("time.date",date("2026-11-24"),[]),R("budget.maximum",money(40))],
  [turn("Bleibt es bei heute?", "Morgen passt doch besser."),turn("Also morgen?", "Nein, Freitag um 18 Uhr. Das Budget bleibt gleich.")],
  [turn("Bliibt s bi hüt?", "Morn passt doch besser."),turn("Also morn?", "Nei, Friitig um 18 Uhr. S Budget bliibt gliich.")],
  locale => ({changes:[changeFact("f2",locale === "de" ? "Freitag um 18 Uhr" : "Friitig um 18 Uhr",R("time.date",date("2026-11-27"),[]))],additions:{facts:[{id:"f4",...R("time.clock",clock("18:00"),[])}]}}),
  "Zwei aufeinanderfolgende Korrekturen: letzte gilt. Freitag bezieht sich auf feste Referenz, Geldgrenze bleibt erhalten.");
conversation("talk-not-silence",
  "Eine Bar in Basel, es muss ruhig sein.", "E Bar z Basel, es muess ruehig sii.",
  [R("offer.kind","BAR"),basel(),R("atmosphere.noise","quiet")],
  [turn("Muss es ganz still sein?", "Nein, muss nicht ruhig sein. Wir müssen uns einfach gut unterhalten können.")],
  [turn("Muess s ganz still sii?", "Nei, muess nöd ruehig sii. Mir müend eus eifach guet underhalte chönne.")],
  locale => ({changes:[changeFact("f3",locale === "de" ? "muss nicht ruhig sein" : "muess nöd ruehig sii",null)], additions:{facts:[{id:"f4",...R("atmosphere.conversation","conversation_possible")}]}}),
  "Ruhebedingung wird aufgehoben, Gesprächsbedingung ergänzt. Weder laute Musik verlangen noch Bar und Basel verlieren.");
conversation("only-sister-vegan",
  "Wir sind vier zum Essen, alle brauchen vegane Optionen. Meine Schwester kommt mit.",
  "Mir sind vier zum Ässe, alli bruuche vegani Optione. Mini Schwöster chunnt mit.",
  [meal,R("people.count",{amount:4,operator:"EQ",unit:"PEOPLE"},["g1"]),R("food.diet","vegan",["g1"]),C("people.relationship","sister",["p1"])],
  [turn("Brauchen wirklich alle veganes Essen?", "Nein, nur meine Schwester isst vegan. Für uns anderen muss es nicht vegan sein.")],
  [turn("Bruuche würkli alli vegans Ässe?", "Nei, nur mini Schwöster isst vegan. Für eus andere muess s nöd vegan sii.")],
  locale => ({changes:[changeFact("f3",locale === "de" ? "nur meine Schwester isst vegan" : "nur mini Schwöster isst vegan",R("food.diet","vegan",["p1"]))]}),
  "Diät an bestehende Schwester statt Gesamtgruppe binden. Vier Personen bleiben erhalten.");
conversation("drop-add-on",
  "Morgen ins Kino und danach Kaffee trinken.", "Morn is Kino und nachher Kafi trinke.",
  [activity("cinema"),R("food.drink","coffee",["a2"]),tomorrow()],
  [turn("Soll ich beides einplanen?", "Den Kaffee lassen wir weg. Kino bleibt.")],
  [turn("Söll ich beides iiplane?", "De Kafi lömmer weg. Kino bliibt.")],
  locale => ({changes:[changeFact("f2",locale === "de" ? "Den Kaffee lassen wir weg" : "De Kafi lömmer weg",null)]}),
  "Zusatzauftrag entfernen, nicht sämtlichen Kaffeekonsum verbieten. Besuchstag und Kino behalten.");
conversation("same-area-less-touristy",
  "Etwas unternehmen im Kleinbasel, maximal 40 Franken.", "Öppis underneh im Kleinbasel, maximal 40 Franke.",
  [openActivity(),R("location.area","Kleinbasel"),R("budget.maximum",money(40))],
  [turn("Wäre eine grosse geführte Altstadttour eine passende Richtung?", "Zu touristisch. Lieber etwas Kleineres, aber gleiche Gegend und gleiches Budget.")],
  [turn("Wär e grossi gfüehrti Altstadttour e passendi Richtig?", "Z touristisch. Lieber öppis Chliiners, aber gliichi Gägend und gliichs Budget.")],
  () => ({changes:[], additions:{extensions:[{id:"e1",...ext("Eine weniger touristische, kleinere Unternehmung wird bevorzugt.")}]}}),
  "Ablehnungsgrund ergänzen, Quartier und Budget explizit behalten; keinen konkreten vorherigen Ort erfinden.");
conversation("second-option",
  "Morgen in Basel etwas unternehmen.", "Morn z Basel öppis underneh.",
  [openActivity(),basel(),tomorrow()],
  [turn("Welche Richtung passt: erstens Museum, zweitens Minigolf?", "Die zweite, also Minigolf. Eine Toilette vor Ort brauchen wir auch.")],
  [turn("Weli Richtig passt: erschtens Museum, zweitens Minigolf?", "Die zweiti, also Minigolf. Es WC vor Ort bruuche mir au.")],
  () => ({changes:[changeFact("f1","Minigolf",activity("mini_golf"))],additions:{facts:[{id:"f4",...R("offer.facility","toilet")}]}}),
  "Referenz auf sichtbare synthetische Auswahl mit expliziter Auflösung; Anbieterfakten, Öffnung und Verfügbarkeit bleiben ungeprüft.");
conversation("partial-people-answer",
  "Morgen mit Freunden essen gehen, insgesamt sind wir drei.",
  "Morn mit Fründe go ässe, insgesamt sind mir drei.",
  [meal,tomorrow(),R("people.count",{amount:3,operator:"EQ",unit:"PEOPLE"},["g1"])],
  [turn("Essen alle drei mit?", "Nur zwei essen, die dritte Person kommt nur mit.")],
  [turn("Ässe alli drei mit?", "Nur zwei ässe, d dritti Person chunnt nur mit.")],
  () => ({changes:[], additions:{entities:[{id:"g2",kind:"GROUP",label:"essende Teilgruppe",members:[]}],facts:[{id:"f4",...C("people.count",{amount:2,operator:"EQ",unit:"PEOPLE"},["g2"])},{id:"f5",...C("people.participation","nur zwei der drei Personen essen",["g2"])}]}}),
  "Drei Gesamtteilnehmende bleiben drei, zwei bilden essende Teilgruppe; kein Pro-Person-Budget oder Kinderalter erfinden.");
conversation("wellness-duration-answer",
  "Morgen ins Thermalbad, maximal 80 Franken.", "Morn is Thermalbad, maximal 80 Franke.",
  [R("offer.kind","THERMAL_BATH"),tomorrow(),R("budget.maximum",money(80))],
  [turn("Wie viel Zeit hast du insgesamt?", "Insgesamt zwei Stunden, mit Hin- und Rückweg.")],
  [turn("Wie viel Ziit hesch insgesamt?", "Insgesamt zwei Stund, mit Hi- und Rückwäg.")],
  () => ({changes:[],additions:{facts:[{id:"f4",...R("time.duration",duration(120,"AVAILABLE_TOTAL",["TRAVEL","ACTIVITY","RETURN"]))}]}}),
  "Antwort übernimmt Geltungsbereich der Frage. Keine zwei Stunden reine Badezeit; Tag, Angebot und Geld bleiben.");
conversation("booking-not-new-date",
  "Morgen Abend in Basel spontan ohne Reservation essen, höchstens 50 Franken.", "Morn Abig z Basel spontan ohni Reservation ässe, höchstens 50 Franke.",
  [meal,basel(),tomorrow(),R("time.day_phase",phase("EVENING"),[]),R("budget.maximum",money(50)),R("participation.booking","walk_in")],
  [turn("Wäre eine Reservation für dich auch in Ordnung?", "Ja, reservieren wäre okay. Aber morgen Abend bleibt, und maximal 50 Franken.")],
  [turn("Wär e Reservation für dich au i Ornig?", "Ja, reserviere wär okay. Aber morn Abig bliibt, und maximal 50 Franke.")],
  locale => ({changes:[changeFact("f6",locale === "de" ? "reservieren wäre okay" : "reserviere wär okay",O("participation.booking","spontaneous"))]}),
  "Reservationserlaubnis hebt Walk-in-Pflicht auf, erzeugt keine Reservationspflicht oder neue Besuchszeit.");

// Reserve independently composed review families before any model run. No paraphrase split.
const reviewedDevFamilies = new Set([
  "family-toilet", "child-movement", "grandmother-and-child", "solo-small-exhibition",
  "spa-tired", "wellness-alternative", "action-beginner", "after-late-cinema-food",
  "friends-different-energy", "conversation-booking-not-new-date",
]);
const reviewedTestFamilies = new Set([
  "both-participate", "quiet-not-sitting", "family-covered-break", "solo-hidden-calm",
  "solo-not-private", "live-music-not-dance", "wellness-clothed", "visitor-not-tourist-hotspot",
  "conversation-family-weather-plan", "conversation-only-sister-vegan",
]);
for (const row of cases) {
  const id = row.id.slice("everyday-".length);
  if (reviewedDevFamilies.has(id)) row.split = "DEV";
  if (reviewedTestFamilies.has(id)) row.split = "TEST";
}
for (const id of [...reviewedDevFamilies, ...reviewedTestFamilies])
  if (!cases.some(row => row.id === "everyday-" + id)) throw Error("review_split_missing_family:" + id);

export const everydayCompositions = Object.freeze(cases);
