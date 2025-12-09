// lib/ai/localAreas.ts
// Schweizer Städte – AI-optimierte Quartier-Datenbank
// Perfekt für computeAreaContext(), classifyArea(), Flow-Priorities & Vibe-Matching

export const localAreas = [
  /* ============================================================
     BASEL – vollständige Quartierliste
  ============================================================ */

  {
    id: "st-johann",
    city: "Basel",
    name: "St. Johann",
    center: { lat: 47.5692, lng: 7.5886 },
    vibes: ["cozy", "nachbarschaftlich", "authentisch", "creative"],
    strengths: ["Bars", "kleine Restaurants", "Nachbarschaftsgefühl", "Cafés"],
    avoidIn: ["starker Regen"],
  },
  {
    id: "gundeli",
    city: "Basel",
    name: "Gundeldingen (Gundeli)",
    center: { lat: 47.5458, lng: 7.5890 },
    vibes: ["urban", "kreativ", "jung", "international"],
    strengths: ["Brunch", "Cafés", "Bars", "Art Spaces"],
    avoidIn: [],
  },
  {
    id: "claraplatz",
    city: "Basel",
    name: "Claraplatz / Kleinbasel",
    center: { lat: 47.5636, lng: 7.6008 },
    vibes: ["lebhaft", "international", "divers", "nightlife"],
    strengths: ["Bars", "Restaurants", "Nachtleben"],
    avoidIn: [],
  },
  {
    id: "altstadt-grossbasel",
    city: "Basel",
    name: "Altstadt Grossbasel",
    center: { lat: 47.5575, lng: 7.5870 },
    vibes: ["romantisch", "historisch", "ruhig", "malerisch"],
    strengths: ["Date Spots", "Cozy Restaurants", "Schöne Wege", "Aussicht"],
    avoidIn: [],
  },
  {
    id: "altstadt-kleinbasel",
    city: "Basel",
    name: "Altstadt Kleinbasel",
    center: { lat: 47.5604, lng: 7.5961 },
    vibes: ["jung", "kulturell", "barszene", "lebendig"],
    strengths: ["Bars", "Rheinnähe", "Streetfood", "Events"],
    avoidIn: [],
  },
  {
    id: "klybeck",
    city: "Basel",
    name: "Klybeck",
    center: { lat: 47.5809, lng: 7.5875 },
    vibes: ["industrial", "alternativ", "experimentell"],
    strengths: ["Events", "Streetfood", "Open-Air", "Rhein"],
    avoidIn: ["Winter"],
  },
  {
    id: "iselin",
    city: "Basel",
    name: "Iselin",
    center: { lat: 47.555, lng: 7.569 },
    vibes: ["lokal", "ruhig", "familienfreundlich"],
    strengths: ["Cafés", "Kleine Lokale"],
    avoidIn: [],
  },
  {
    id: "breite",
    city: "Basel",
    name: "Breite",
    center: { lat: 47.546, lng: 7.61 },
    vibes: ["grün", "ruhig"],
    strengths: ["Spaziergänge", "Wohnquartier"],
    avoidIn: [],
  },

  /* ============================================================
     ZÜRICH – wichtigste & AI-relevante Quartiere
  ============================================================ */

  {
    id: "zuerich-kreis1",
    city: "Zürich",
    name: "Kreis 1 – Altstadt",
    center: { lat: 47.37174, lng: 8.54348 },
    vibes: ["romantisch", "historisch", "edel", "klassisch"],
    strengths: ["Fine Dining", "Museen", "Date Spots", "Spaziergänge"],
    avoidIn: [],
  },
  {
    id: "zuerich-kreis4",
    city: "Zürich",
    name: "Kreis 4 – Langstrasse",
    center: { lat: 47.377, lng: 8.527 },
    vibes: ["nightlife", "lebhaft", "divers", "urban"],
    strengths: ["Bars", "Clubs", "Streetfood"],
    avoidIn: [],
  },
  {
    id: "zuerich-kreis5",
    city: "Zürich",
    name: "Kreis 5 – Industriequartier",
    center: { lat: 47.385, lng: 8.52 },
    vibes: ["industrial", "artsy", "hipster"],
    strengths: ["Bars", "Innovative Restaurants", "Kunst", "Events"],
    avoidIn: [],
  },
  {
    id: "zuerich-kreis6",
    city: "Zürich",
    name: "Kreis 6 – Universität / ETH",
    center: { lat: 47.376, lng: 8.548 },
    vibes: ["intellektuell", "ruhig", "kulturell"],
    strengths: ["Museen", "Cafés", "Aussichtspunkte"],
    avoidIn: [],
  },
  {
    id: "zuerich-seefeld",
    city: "Zürich",
    name: "Seefeld",
    center: { lat: 47.354, lng: 8.553 },
    vibes: ["edel", "lake vibes", "romantisch", "entspannt"],
    strengths: ["Promenade", "Bars am Wasser", "Spaziergänge"],
    avoidIn: ["Winter"],
  },
  {
    id: "zuerich-wiedikon",
    city: "Zürich",
    name: "Wiedikon",
    center: { lat: 47.366, lng: 8.52 },
    vibes: ["cozy", "wohnquartier", "lokal"],
    strengths: ["Cafés", "Brunch", "kleine Bars"],
    avoidIn: [],
  },

  /* ============================================================
     BERN – wichtigste Quartiere
  ============================================================ */

  {
    id: "bern-altstadt",
    city: "Bern",
    name: "Altstadt",
    center: { lat: 46.94809, lng: 7.44744 },
    vibes: ["historisch", "romantisch", "klassisch"],
    strengths: ["Aussicht", "Restaurants", "Weinbars"],
    avoidIn: [],
  },
  {
    id: "bern-lorraine",
    city: "Bern",
    name: "Lorraine",
    center: { lat: 46.955, lng: 7.45 },
    vibes: ["alternativ", "jung", "creative"],
    strengths: ["Bars", "Events", "Cafés"],
    avoidIn: [],
  },
  {
    id: "bern-breitenrain",
    city: "Bern",
    name: "Breitenrain",
    center: { lat: 46.96, lng: 7.46 },
    vibes: ["lokal", "nachbarschaftlich"],
    strengths: ["kleine Bars", "lokale Restaurants"],
    avoidIn: [],
  },

  /* ============================================================
     LUZERN
  ============================================================ */

  {
    id: "luzern-altstadt",
    city: "Luzern",
    name: "Altstadt",
    center: { lat: 47.052, lng: 8.307 },
    vibes: ["romantisch", "touristisch", "historisch"],
    strengths: ["Seepromenade", "Date Nights", "Restaurants"],
    avoidIn: [],
  },
  {
    id: "luzern-neustadt",
    city: "Luzern",
    name: "Neustadt",
    center: { lat: 47.048, lng: 8.31 },
    vibes: ["urban", "jung"],
    strengths: ["Bars", "Cafés"],
    avoidIn: [],
  },

  /* ============================================================
     WINTERTHUR
  ============================================================ */

  {
    id: "winti-altstadt",
    city: "Winterthur",
    name: "Altstadt",
    center: { lat: 47.5, lng: 8.73 },
    vibes: ["cozy", "lokal"],
    strengths: ["Bars", "Restaurants"],
    avoidIn: [],
  },

  /* ============================================================
     ST. GALLEN
  ============================================================ */

  {
    id: "stgallen-altstadt",
    city: "St. Gallen",
    name: "Altstadt",
    center: { lat: 47.424, lng: 9.376 },
    vibes: ["historisch", "ruhig", "romantisch"],
    strengths: ["Cafés", "Museen", "Restaurants"],
    avoidIn: [],
  },

  /* ============================================================
     LAUSANNE
  ============================================================ */

  {
    id: "lausanne-flon",
    city: "Lausanne",
    name: "Flon",
    center: { lat: 46.520, lng: 6.632 },
    vibes: ["trendy", "nightlife", "modern"],
    strengths: ["Bars", "Clubs", "Events"],
    avoidIn: [],
  },

  /* ============================================================
     GENF
  ============================================================ */

  {
    id: "geneve-lespaces",
    city: "Genf",
    name: "Les Pâquis",
    center: { lat: 46.211, lng: 6.15 },
    vibes: ["international", "lebhaft", "divers"],
    strengths: ["Bars", "Essen", "Nightlife"],
    avoidIn: [],
  },
];
