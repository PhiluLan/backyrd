// lib/ai/localAreas.ts

export const localAreas = [
  {
    id: "st-johann",
    name: "St. Johann",
    center: { lat: 47.5692, lng: 7.5886 },
    vibes: ["cozy", "nachbarschaftlich", "authentisch"],
    strengths: ["Bars", "Kleine Restaurants", "Lässige Drinks"],
    avoidIn: ["starker Regen"], // weniger gut für Outdoor
  },

  {
    id: "gundeli",
    name: "Gundeldingen",
    center: { lat: 47.5458, lng: 7.5890 },
    vibes: ["urban", "kreativ", "jung"],
    strengths: ["Cafés", "Brunch", "kleine Lokale", "Art Spaces"],
    avoidIn: [],
  },

  {
    id: "claraplatz",
    name: "Claraplatz / Kleinbasel",
    center: { lat: 47.5636, lng: 7.6008 },
    vibes: ["lebhaft", "gemischt", "international"],
    strengths: ["Bars", "Restaurant-Dichte", "Nachtleben"],
    avoidIn: [],
  },

  {
    id: "altstadt",
    name: "Altstadt Grossbasel",
    center: { lat: 47.5575, lng: 7.5870 },
    vibes: ["romantisch", "historisch", "ruhig"],
    strengths: ["Date Spots", "Cozy Restaurants", "Schöne Wege"],
    avoidIn: [],
  },

  {
    id: "klybeck",
    name: "Klybeck",
    center: { lat: 47.5809, lng: 7.5875 },
    vibes: ["industrial", "alternativ", "kreativ", "experimentell"],
    strengths: ["Bars", "Events", "Streetfood"],
    avoidIn: ["Winter"], // outdoor-lastig
  },
];
