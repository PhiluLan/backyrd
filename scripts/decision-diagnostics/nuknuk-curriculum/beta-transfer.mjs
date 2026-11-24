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
  "Meine Freundin wiedersehen und bei einem Kaffee reden können. Ein bisschen Musik ist okay.",
  "Mini Fründin wiederseh und bi mene Kafi rede chönne. Es bitzeli Musig isch okay.",
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
      C("budget.scope", { scope: "GROUP_TOTAL" }, []),
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
  "Mit beide Chind uf en Spielplatz. Mir bringed s Ässe mit, es Restaurant isch nöd nötig.",
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
    R("offer.kind", "MEETING_ROOM"),
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
  "Meine Tochter ist fünf und meine Tante kommt mit ins Museum. Bitte nicht das Kinderalter meiner Tante zuordnen.",
  "Mini Tochter isch füf und mini Tante chunnt mit is Museum. Bitte nöd s Chinderalter minere Tante zueordne.",
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
    X("offer.kind", "CLUB"),
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
  "Erst Minigolf, danach am selben Ort essen. Meine Freundin braucht glutenfreie Optionen, ich nicht.",
  "Zerscht Minigolf, nachher am gliiche Ort ässe. Mini Fründin brucht glutenfreii Optione, ich nöd.",
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
    R("offer.kind", "HOTEL"),
    R("food.meal", "meal"),
    R("participation.permission", "public_day_access"),
    R("food.diet", "vegetarian"),
  ]),
  "Restaurantnutzung und Zugang externer Gäste, keine Zimmerbuchung statt Essenswunsch.",
  "TEST",
);

export const everydayCompositions = Object.freeze(cases);
