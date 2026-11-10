// SYNTHETIC authored everyday learning situations by fictional reviewer Tobi.
// No user logs, live venue facts, personal histories or model-run results.
import {A,M,D,dish,R,P,C,X,O,person,accompanied,age,count,cash,scope,date,same} from './authoring.mjs';

export const adviceTobi = [
  {
    "id": "advice-tobi-child-move-adult-rest",
    "family": "child-move-adult-rest",
    "split": "TRAIN",
    "domain": "family",
    "query": "Meine Tochter ist vier und muss mal raus zum Toben. Ich würde gern zwischendurch sitzen.",
    "goal": "Bewegung für das Kind, Sitzpause als Wunsch der Begleitung.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "movement"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Tochter"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.age",
        "value": {
          "amount": 4,
          "operator": "EQ",
          "unit": "YEARS"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      },
      {
        "key": "offer.feature",
        "value": {
          "text": "Sitzmöglichkeit"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Bewegung für das Kind, Sitzpause als Wunsch der Begleitung.",
        "purpose": "Bewegung für das Kind, Sitzpause als Wunsch der Begleitung.",
        "quotes": [
          "Meine Tochter ist vier und muss mal raus zum Toben. Ich würde gern zwischendurch sitzen."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Ist das konkrete Bewegungsangebot für Vierjährige mit Begleitung zugelassen?"
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Hasel",
        "category": "SPORT",
        "kind": "MOVEMENT_PLAY",
        "areaKind": "PLAYGROUND",
        "spotProperties": [],
        "offerProperties": [
          [
            "participation.age_suitability",
            "Alle Altersgruppen"
          ]
        ],
        "areaProperties": [
          [
            "amenity.playground",
            true
          ],
          [
            "amenity.rest_seating",
            true
          ],
          [
            "offer.feature",
            "Sitzmöglichkeit"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt eine Bewegungsmöglichkeit für deine Tochter und Sitzmöglichkeiten für deine Pause. Du musst daraus kein gemeinsames Sportprogramm machen.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Dann sucht ihr beide einen anstrengenden Sportkurs.",
      "why": "Kindlicher Bewegungsdrang verlangt keine sportliche Teilnahme der erwachsenen Begleitung."
    },
    "why": "Kindlicher Bewegungsdrang verlangt keine sportliche Teilnahme der erwachsenen Begleitung.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ]
  },
  {
    "id": "advice-tobi-rain-family-rollator",
    "family": "rain-family-rollator",
    "split": "TRAIN",
    "domain": "family",
    "query": "Mit unserem Sohn ins Museum, Oma mit Rollator kommt mit. Treppen gehen geht nicht.",
    "goal": "Gemeinsamer Museumsbesuch mit zwingend stufenlosem Zugang.",
    "facts": [
      {
        "key": "offer.kind",
        "value": {
          "text": "MUSEUM"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Sohn"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Oma"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.accessibility",
        "value": {
          "text": "stufenloser Ausstellungsbereich"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gemeinsamer Museumsbesuch mit zwingend stufenlosem Zugang.",
        "purpose": "Gemeinsamer Museumsbesuch mit zwingend stufenlosem Zugang.",
        "quotes": [
          "Mit unserem Sohn ins Museum, Oma mit Rollator kommt mit. Treppen gehen geht nicht."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Weide",
        "category": "MUSEUM",
        "kind": "SELF_GUIDED_VISIT",
        "areaKind": "EXHIBITION",
        "spotProperties": [],
        "offerProperties": [
          [
            "participation.age_suitability",
            "Alle Altersgruppen"
          ]
        ],
        "areaProperties": [
          [
            "amenity.step_free",
            true
          ],
          [
            "participation.accessibility",
            "stufenloser Ausstellungsbereich"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt.",
        "worldFacts": [
          {
            "key": "accessibility.step_free_entrance",
            "value": true,
            "extra": {
              "resolution": "KNOWN_TRUE"
            }
          },
          {
            "key": "accessibility.accessible_indoor",
            "value": true,
            "extra": {
              "resolution": "KNOWN_TRUE"
            }
          }
        ]
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt einen Museumsbesuch mit stufenlosem Ausstellungsbereich. Das trägt eure gemeinsame Richtung, ohne Oma aus dem Besuch auszuschliessen.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Oma kann beim Eingang warten, während ihr die Ausstellung besucht.",
      "why": "Die gemeinsame Teilnahme darf nicht durch Aussondern einer Person ersetzt werden."
    },
    "why": "Die gemeinsame Teilnahme darf nicht durch Aussondern einer Person ersetzt werden.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ]
  },
  {
    "id": "advice-tobi-stroller-nap-coffee",
    "family": "stroller-nap-coffee",
    "split": "TRAIN",
    "domain": "family",
    "query": "Das Baby schläft im Kinderwagen. Ich möchte einfach einen Kaffee, mit Platz für den Wagen.",
    "goal": "Kaffee und ausdrücklich benötigter Wagenplatz; kein Kinderprogramm.",
    "facts": [
      {
        "key": "food.drink",
        "value": {
          "text": "coffee"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Baby"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.feature",
        "value": {
          "text": "Platz für Kinderwagen"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Kaffee und ausdrücklich benötigter Wagenplatz; kein Kinderprogramm.",
        "purpose": "Kaffee und ausdrücklich benötigter Wagenplatz; kein Kinderprogramm.",
        "quotes": [
          "Das Baby schläft im Kinderwagen. Ich möchte einfach einen Kaffee, mit Platz für den Wagen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Lärche",
        "category": "RESTAURANT",
        "kind": "DRINKS",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.drink",
            "Kaffee"
          ]
        ],
        "areaProperties": [
          [
            "offer.feature",
            "Platz für Kinderwagen"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort hat Kaffee und ausgewiesenen Platz für Kinderwagen. Eine einfache Kaffeepause passt hier besser als ein zusätzliches Kinderprogramm.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Ein Indoor-Spielpark wäre perfekt, damit das Baby beschäftigt ist.",
      "why": "Ein schlafendes Baby begründet keinen Wunsch nach Bespassung."
    },
    "why": "Ein schlafendes Baby begründet keinen Wunsch nach Bespassung.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ]
  },
  {
    "id": "advice-tobi-teen-and-parent-no-course",
    "family": "teen-and-parent-no-course",
    "split": "TRAIN",
    "domain": "family",
    "query": "Mein Sohn ist fünfzehn, wir wollen zusammen Tischtennis spielen. Keinen Kurs bitte.",
    "goal": "Selbst gemeinsam Tischtennis spielen statt Unterricht.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "table_tennis"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Sohn"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.age",
        "value": {
          "amount": 15,
          "operator": "EQ",
          "unit": "YEARS"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      },
      {
        "key": "experience.activity",
        "value": {
          "text": "course"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Selbst gemeinsam Tischtennis spielen statt Unterricht.",
        "purpose": "Selbst gemeinsam Tischtennis spielen statt Unterricht.",
        "quotes": [
          "Mein Sohn ist fünfzehn, wir wollen zusammen Tischtennis spielen. Keinen Kurs bitte."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Kann ein Fünfzehnjähriger dort mit erwachsener Begleitung frei spielen?",
          "Alterszugang und freie Spielnutzung noch prüfen."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Esche",
        "category": "SPORT",
        "kind": "BALL_SPORT",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "experience.activity",
            "Tischtennis"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Freies Tischtennisspielen wäre die richtige Richtung. Alterszugang und freie Spielnutzung noch prüfen.",
      "question": null,
      "caveat": "Alterszugang und freie Spielnutzung noch prüfen."
    },
    "wrong": {
      "text": "Ich buche euch einen Kinder-Tischtenniskurs.",
      "why": "Ein ausdrücklich ausgeschlossener Kurs wird durch passende Sportart nicht zulässig."
    },
    "why": "Ein ausdrücklich ausgeschlossener Kurs wird durch passende Sportart nicht zulässig.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ]
  },
  {
    "id": "advice-tobi-siblings-different-ages",
    "family": "siblings-different-ages",
    "split": "VALIDATION",
    "domain": "family",
    "query": "Mit den Kindern etwas zusammen machen, die Kleine ist drei, der Grosse zehn. Es soll für beide passen.",
    "goal": "Gemeinsame Unternehmung für beide genannten Altersgruppen finden.",
    "facts": [
      {
        "key": "condition.children",
        "value": {
          "text": "children_activity"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Kind"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.age",
        "value": {
          "amount": 3,
          "operator": "EQ",
          "unit": "YEARS"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Kind"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.age",
        "value": {
          "amount": 10,
          "operator": "EQ",
          "unit": "YEARS"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gemeinsame Unternehmung für beide genannten Altersgruppen finden.",
        "purpose": "Gemeinsame Unternehmung für beide genannten Altersgruppen finden.",
        "quotes": [
          "Mit den Kindern etwas zusammen machen, die Kleine ist drei, der Grosse zehn. Es soll für beide passen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kastanie",
        "category": "SPORT",
        "kind": "MOVEMENT_PLAY",
        "areaKind": "CHILDREN_AREA",
        "spotProperties": [],
        "offerProperties": [
          [
            "participation.age_suitability",
            "Alle Altersgruppen"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt ein passendes Kinderangebot für eure gemeinsame Unternehmung. Das ist eine Richtung für eure drei- und zehnjährigen Kinder; gleiche persönliche Begeisterung kann ich daraus nicht garantieren.",
      "question": null,
      "caveat": "Freie Plätze zum Besuchszeitpunkt sind nicht bestätigt."
    },
    "wrong": {
      "text": "Ein Angebot ab acht ist familienfreundlich, also passt es für beide.",
      "why": "Ein Familienlabel ersetzt weder die jüngere Altersgrenze noch die gemeinsame Nutzbarkeit."
    },
    "why": "Ein Familienlabel ersetzt weder die jüngere Altersgrenze noch die gemeinsame Nutzbarkeit.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family",
      "synthetic-compositional-not-field-validation"
    ]
  },
  {
    "id": "advice-tobi-packed-snacks-no-shop",
    "family": "packed-snacks-no-shop",
    "split": "TRAIN",
    "domain": "family",
    "query": "Familienausflug zu Tieren. Wir haben die Brotbox dabei und brauchen keinen Imbiss.",
    "goal": "Tiererlebnis mit Mitbringerlaubnis statt Imbisspflicht.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "animals"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      },
      {
        "key": "participation.permission",
        "value": {
          "text": "own_food"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "food.meal",
        "value": {
          "text": "snacks"
        },
        "modality": "NOT_REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Tiererlebnis mit Mitbringerlaubnis statt Imbisspflicht.",
        "purpose": "Tiererlebnis mit Mitbringerlaubnis statt Imbisspflicht.",
        "quotes": [
          "Familienausflug zu Tieren. Wir haben die Brotbox dabei und brauchen keinen Imbiss."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Ahorn",
        "category": "ZOO",
        "kind": "ANIMAL_OBSERVATION",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "participation.age_suitability",
            "Alle Altersgruppen"
          ],
          [
            "participation.permission",
            "eigene Speisen erlaubt"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort bietet Tierbeobachtung und erlaubt eigene Speisen im Besuchsbereich. Eure Brotbox passt dazu; einen Imbiss müsst ihr nicht zusätzlich suchen.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Das Tierangebot hat keine Gastronomie, deshalb scheidet es aus.",
      "why": "Ein nicht benötigter Imbiss darf kein Ausschluss werden; entscheidend ist die Erlaubnis für eigene Speisen."
    },
    "why": "Ein nicht benötigter Imbiss darf kein Ausschluss werden; entscheidend ist die Erlaubnis für eigene Speisen.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ]
  },
  {
    "id": "advice-tobi-water-play-change-clothes",
    "family": "water-play-change-clothes",
    "split": "TRAIN",
    "domain": "family",
    "query": "Mit meinem Kind auf einen Spielplatz ohne Wasserspiele, Wechselkleider haben wir keine dabei.",
    "goal": "Spielplatz ohne Wasserspielnutzung; Alter offen.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "playground"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Kind"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      },
      {
        "key": "offer.feature",
        "value": {
          "text": "Wasserspiele"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Spielplatz ohne Wasserspielnutzung; Alter offen.",
        "purpose": "Spielplatz ohne Wasserspielnutzung; Alter offen.",
        "quotes": [
          "Mit meinem Kind auf einen Spielplatz ohne Wasserspiele, Wechselkleider haben wir keine dabei."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Wasserspielabgrenzung und altersbezogene Nutzbarkeit fehlen."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kastanie",
        "category": "SPORT",
        "kind": "MOVEMENT_PLAY",
        "areaKind": "PLAYGROUND",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "amenity.playground",
            true
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein trockener Spielbereich wäre die Suchrichtung. Wasserspielabgrenzung und altersbezogene Nutzbarkeit fehlen.",
      "question": null,
      "caveat": "Wasserspielabgrenzung und altersbezogene Nutzbarkeit fehlen."
    },
    "wrong": {
      "text": "Der Wasserspielplatz ist besonders spannend, nehmt den.",
      "why": "Attraktivität darf einen ausdrücklichen Ausschluss nicht überstimmen."
    },
    "why": "Attraktivität darf einen ausdrücklichen Ausschluss nicht überstimmen.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ]
  },
  {
    "id": "advice-tobi-adult-children-family",
    "family": "adult-children-family",
    "split": "TRAIN",
    "domain": "family",
    "query": "Meine erwachsenen Töchter und ich wollen mal wieder etwas als Familie machen. Gern bowlen.",
    "goal": "Gemeinsame Familienzeit mit erwachsenen Töchtern beim konkret gewünschten Bowling.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "Bowling"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Töchter"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.role",
        "value": {
          "text": "erwachsen"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gemeinsame Familienzeit mit erwachsenen Töchtern beim konkret gewünschten Bowling.",
        "purpose": "Gemeinsame Familienzeit mit erwachsenen Töchtern beim konkret gewünschten Bowling.",
        "quotes": [
          "Meine erwachsenen Töchter und ich wollen mal wieder etwas als Familie machen. Gern bowlen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kastanie",
        "category": "SPORT",
        "kind": "BOWLING",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Bowling wäre mein Vorschlag für eure gemeinsame Familienzeit. Der Lernort belegt das Angebot; ein Kinderprogramm leite ich aus euren erwachsenen Töchtern nicht ab.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Für Familien nehme ich grundsätzlich einen Kleinkinderspielplatz.",
      "why": "Familie bezeichnet hier ausdrücklich Erwachsene und ist kein Beleg für Kinderbedarf."
    },
    "why": "Familie bezeichnet hier ausdrücklich Erwachsene und ist kein Beleg für Kinderbedarf.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ]
  },
  {
    "id": "advice-tobi-child-reward-no-show",
    "family": "child-reward-no-show",
    "split": "TRAIN",
    "domain": "family",
    "query": "Meine Tochter hat etwas Schwieriges geschafft. Sie möchte Tiere sehen, aber keine Tiershow.",
    "goal": "Tierbeobachtung als gewünschtes Erlebnis ohne Show.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "animals"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Tochter"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.format",
        "value": {
          "text": "Tiershow"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.occasion",
        "value": {
          "text": "etwas Schwieriges geschafft"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Tierbeobachtung als gewünschtes Erlebnis ohne Show.",
        "purpose": "Tierbeobachtung als gewünschtes Erlebnis ohne Show.",
        "quotes": [
          "Meine Tochter hat etwas Schwieriges geschafft. Sie möchte Tiere sehen, aber keine Tiershow."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Ist eine Tierbeobachtung ohne Showteilnahme ausdrücklich möglich?",
          "Welche Regeln gelten für die tatsächlich teilnehmenden Personen?"
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Buche",
        "category": "ZOO",
        "kind": "ANIMAL_OBSERVATION",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Tiere in einem normalen Besuchsangebot beobachten wäre eine passende Idee. Für eine Empfehlung fehlen noch die Bestätigung eurer gewünschten Nutzung ohne Show und die passenden Teilnahmebedingungen.",
      "question": null,
      "caveat": "Showfreiheit der eigenen Nutzung und passende Teilnahmebedingungen sind nicht bestätigt."
    },
    "wrong": {
      "text": "Eine spektakuläre Tiershow passt besonders gut als Belohnung.",
      "why": "Der Anlass berechtigt nicht dazu, den ausdrücklichen Wunsch der Tochter umzudeuten."
    },
    "why": "Der Anlass berechtigt nicht dazu, den ausdrücklichen Wunsch der Tochter umzudeuten.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ]
  },
  {
    "id": "advice-tobi-hot-play-shade",
    "family": "hot-play-shade",
    "split": "TRAIN",
    "domain": "family",
    "query": "Heute ist es heiss. Mit meinem sechsjährigen Sohn auf einen Spielplatz, aber nur mit Schatten beim Spielen.",
    "goal": "Schatten muss zum tatsächlich genutzten Spielbereich gehören.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "playground"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Sohn"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.age",
        "value": {
          "amount": 6,
          "operator": "EQ",
          "unit": "YEARS"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      },
      {
        "key": "offer.shade",
        "value": {
          "text": "shade"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "time.date",
        "value": {
          "date": "2026-11-12",
          "operator": "EQ",
          "timezone": "Europe/Zurich"
        },
        "modality": "REQUIRED",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Schatten muss zum tatsächlich genutzten Spielbereich gehören.",
        "purpose": "Schatten muss zum tatsächlich genutzten Spielbereich gehören.",
        "quotes": [
          "Heute ist es heiss. Mit meinem sechsjährigen Sohn auf einen Spielplatz, aber nur mit Schatten beim Spielen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Linde",
        "category": "SPORT",
        "kind": "MOVEMENT_PLAY",
        "areaKind": "PLAYGROUND",
        "spotProperties": [],
        "offerProperties": [
          [
            "participation.age_suitability",
            "Alle Altersgruppen"
          ]
        ],
        "areaProperties": [
          [
            "amenity.playground",
            true
          ],
          [
            "offer.shade",
            true
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort hat einen Spielbereich mit ausdrücklich dort belegtem Schatten. Das passt zu deinem Sohn; der Schatten eines anderen Bereichs wäre kein Ersatz.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Die Terrasse des Restaurants hat Sonnenschirme, also ist der Spielplatz schattig.",
      "why": "Schatten in einem anderen Bereich erfüllt den ausdrücklich genannten Nutzungsbereich nicht."
    },
    "why": "Schatten in einem anderen Bereich erfüllt den ausdrücklich genannten Nutzungsbereich nicht.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ]
  },
  {
    "id": "advice-tobi-teen-animals-alone",
    "family": "teen-animals-alone",
    "split": "TRAIN",
    "domain": "family",
    "query": "Meine Tochter ist sechzehn und will mit ihrer Freundin Tiere anschauen. Ich gehe nicht mit.",
    "goal": "Tierbesuch der Tochter und Freundin; die anfragende Person kommt nicht mit, weitere Begleitung bleibt offen.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "animals"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Tochter"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.age",
        "value": {
          "amount": 16,
          "operator": "EQ",
          "unit": "YEARS"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Freundin"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.role",
        "value": {
          "text": "self"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "pSelf"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.participation",
        "value": {
          "text": "nimmt nicht teil"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "pSelf"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Tierbesuch der Tochter und Freundin; die anfragende Person kommt nicht mit, weitere Begleitung bleibt offen.",
        "purpose": "Tierbesuch der Tochter und Freundin; die anfragende Person kommt nicht mit, weitere Begleitung bleibt offen.",
        "quotes": [
          "Meine Tochter ist sechzehn und will mit ihrer Freundin Tiere anschauen. Ich gehe nicht mit."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Unbegleiteter Zugang nicht bestätigt; Alter der Freundin offen."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kiefer",
        "category": "ZOO",
        "kind": "ANIMAL_OBSERVATION",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein Tierbesuch kann passen. Vor einer konkreten Empfehlung fehlen die Besuchsregeln für die tatsächliche Gruppe; dass du nicht mitgehst, beweist noch nicht, dass niemand Erwachsenes dabei ist.",
      "question": null,
      "caveat": "Alter der Freundin, sonstige Begleitung und passende Besuchsregeln sind offen."
    },
    "wrong": {
      "text": "Da du die Anfrage stellst, ist eine erwachsene Begleitung bestätigt.",
      "why": "Die suchende Person gehört ausdrücklich nicht zur Besuchsgruppe."
    },
    "why": "Die suchende Person gehört ausdrücklich nicht zur Besuchsgruppe.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family"
    ],
    "uncertainties": [
      {
        "description": "Alter der Freundin und sonstige erwachsene Begleitung sind nicht angegeben.",
        "relatedIds": [
          "p2"
        ]
      }
    ]
  },
  {
    "id": "advice-tobi-family-short-exit",
    "family": "family-short-exit",
    "split": "TEST",
    "domain": "family",
    "query": "Mit Kind kurz etwas unternehmen, aber wir möchten jederzeit unkompliziert aufhören können.",
    "goal": "Eine flexibel beendbare Familienunternehmung statt fester langer Teilnahme.",
    "facts": [
      {
        "key": "people.relationship",
        "value": {
          "text": "Kind"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "kurze flexible Familienunternehmung"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Eine flexibel beendbare Familienunternehmung statt fester langer Teilnahme.",
        "purpose": "Eine flexibel beendbare Familienunternehmung statt fester langer Teilnahme.",
        "quotes": [
          "Mit Kind kurz etwas unternehmen, aber wir möchten jederzeit unkompliziert aufhören können."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Abbruchfreiheit und passende Kinderbedingungen fehlen."
        ],
        "activityIdea": {
          "key": "experience.activity",
          "value": "movement_play"
        }
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kiefer",
        "category": "SPORT",
        "kind": "MOVEMENT_PLAY",
        "areaKind": "PLAYGROUND",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "amenity.playground",
            true
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein frei nutzbarer Spielplatz wäre eine Idee, falls ihr dort ohne festes Programm jederzeit gehen könnt. Abbruchfreiheit und passende Kinderbedingungen fehlen.",
      "question": null,
      "caveat": "Abbruchfreiheit und passende Kinderbedingungen fehlen."
    },
    "wrong": {
      "text": "Ein zweistündiger Workshop ist ideal, dann seid ihr beschäftigt.",
      "why": "Eine feste lange Bindung widerspricht der ausdrücklich gewünschten Abbruchfreiheit."
    },
    "why": "Eine feste lange Bindung widerspricht der ausdrücklich gewünschten Abbruchfreiheit.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "family",
      "synthetic-compositional-not-field-validation"
    ],
    "extensions": [
      "Die Teilnahme muss jederzeit ohne Bindung an ein festes Programm beendet werden können"
    ]
  },
  {
    "id": "advice-tobi-first-boulder-guidance",
    "family": "first-boulder-guidance",
    "split": "TRAIN",
    "domain": "sport",
    "query": "Ich möchte zum ersten Mal bouldern. Eine Einführung wäre gut, einen ganzen Kurs brauche ich nicht.",
    "goal": "Anfängerbouldern mit optionaler Einführung, keine Kurspflicht.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "Bouldern"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.experience",
        "value": {
          "text": "Anfänger"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.format",
        "value": {
          "text": "Einführung"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.activity",
        "value": {
          "text": "course"
        },
        "modality": "NOT_REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Anfängerbouldern mit optionaler Einführung, keine Kurspflicht.",
        "purpose": "Anfängerbouldern mit optionaler Einführung, keine Kurspflicht.",
        "quotes": [
          "Ich möchte zum ersten Mal bouldern. Eine Einführung wäre gut, einen ganzen Kurs brauche ich nicht."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Ahorn",
        "category": "SPORT",
        "kind": "BOULDERING",
        "areaKind": "BOULDER_AREA",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort bietet Bouldern. Für deinen ersten Versuch würde ich eine kurze Einführung als mögliche Hilfe prüfen; einen ganzen Kurs musst du daraus nicht machen.",
      "question": null,
      "caveat": "Einführung und individuelle Teilnahmevoraussetzungen sind noch nicht bestätigt."
    },
    "wrong": {
      "text": "Nur ein mehrwöchiger Kurs kommt für dich infrage.",
      "why": "Anfängererfahrung und gewünschte Einführung erzeugen keine Pflicht zu einem ganzen Kurs."
    },
    "why": "Anfängererfahrung und gewünschte Einführung erzeugen keine Pflicht zu einem ganzen Kurs.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "sport"
    ]
  },
  {
    "id": "advice-tobi-sport-spectator-friend",
    "family": "sport-spectator-friend",
    "split": "TRAIN",
    "domain": "sport",
    "query": "Mein Freund will klettern, ich möchte nur zuschauen. Wir müssen nicht beide mitmachen.",
    "goal": "Klettern für den Freund, eigener Besuch nur als Zuschauer.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "Klettern"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Freund"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.role",
        "value": {
          "text": "self"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.participation",
        "value": {
          "text": "zuschauend"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p2"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Klettern für den Freund, eigener Besuch nur als Zuschauer.",
        "purpose": "Klettern für den Freund, eigener Besuch nur als Zuschauer.",
        "quotes": [
          "Mein Freund will klettern, ich möchte nur zuschauen. Wir müssen nicht beide mitmachen."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Zuschauerzugang und Voraussetzungen der aktiven Person sind nicht belegt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Buche",
        "category": "SPORT",
        "kind": "CLIMBING",
        "areaKind": "CLIMBING_AREA",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Eine Kletteranlage mit erlaubtem Zuschauerzugang wäre die richtige Richtung. Zuschauerzugang und Voraussetzungen der aktiven Person sind nicht belegt.",
      "question": null,
      "caveat": "Zuschauerzugang und Voraussetzungen der aktiven Person sind nicht belegt."
    },
    "wrong": {
      "text": "Ich suche zwei Kletterplätze und zwei Leihgurte für euch.",
      "why": "Der zuschauenden Person darf keine aktive Leistung oder Ausrüstungspflicht zugeordnet werden."
    },
    "why": "Der zuschauenden Person darf keine aktive Leistung oder Ausrüstungspflicht zugeordnet werden.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "sport"
    ]
  },
  {
    "id": "advice-tobi-pingpong-rental",
    "family": "pingpong-rental",
    "split": "TRAIN",
    "domain": "sport",
    "query": "Spontan Tischtennis spielen, Schläger haben wir keine. Die müssen wir dort ausleihen können.",
    "goal": "Freies spontanes Spiel mit erforderlicher Schlägerausleihe.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "table_tennis"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.booking",
        "value": {
          "text": "spontaneous"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.service",
        "value": {
          "text": "Schläger ausleihen"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Freies spontanes Spiel mit erforderlicher Schlägerausleihe.",
        "purpose": "Freies spontanes Spiel mit erforderlicher Schlägerausleihe.",
        "quotes": [
          "Spontan Tischtennis spielen, Schläger haben wir keine. Die müssen wir dort ausleihen können."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Ulme",
        "category": "SPORT",
        "kind": "BALL_SPORT",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "experience.activity",
            "Tischtennis"
          ],
          [
            "offer.service",
            "Schläger ausleihen"
          ],
          [
            "participation.booking",
            "Nicht erforderlich"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort bietet Tischtennis, Schlägerausleihe und Nutzung ohne Pflichtreservation. Das nimmt euch die Ausrüstungsfrage ab; eine aktuell freie Platte ist damit noch nicht zugesagt.",
      "question": null,
      "caveat": "Aktuell freie Spielplätze sind nicht bestätigt."
    },
    "wrong": {
      "text": "Ein Tisch reicht, Schläger könnt ihr bestimmt irgendwo bekommen.",
      "why": "Ein konkret erforderlicher Ausleihservice darf nicht durch Vermutung ersetzt werden."
    },
    "why": "Ein konkret erforderlicher Ausleihservice darf nicht durch Vermutung ersetzt werden.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "sport"
    ]
  },
  {
    "id": "advice-tobi-adventure-no-height",
    "family": "adventure-no-height",
    "split": "VALIDATION",
    "domain": "sport",
    "query": "Etwas Abenteuerliches mit Freunden, aber Höhe kommt für mich nicht infrage.",
    "goal": "Abenteuerwunsch ohne Nutzung in Höhe; konkrete Aktivität offen.",
    "facts": [
      {
        "key": "people.relationship",
        "value": {
          "text": "Freunde"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.character",
        "value": {
          "text": "abenteuerlich"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Abenteuerwunsch ohne Nutzung in Höhe; konkrete Aktivität offen.",
        "purpose": "Abenteuerwunsch ohne Nutzung in Höhe; konkrete Aktivität offen.",
        "quotes": [
          "Etwas Abenteuerliches mit Freunden, aber Höhe kommt für mich nicht infrage."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Höhenfreiheit der konkreten Nutzung ist nicht belegt."
        ],
        "activityIdea": {
          "key": "experience.activity",
          "value": "Minigolf"
        }
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Wacholder",
        "category": "SPORT",
        "kind": "MINI_GOLF",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein spielerisches Abenteuer am Boden wäre eine Suchrichtung. Höhenfreiheit der konkreten Nutzung ist nicht belegt.",
      "question": null,
      "caveat": "Höhenfreiheit der konkreten Nutzung ist nicht belegt."
    },
    "wrong": {
      "text": "Ein Hochseilpark ist die perfekte Herausforderung für deine Höhenangst.",
      "why": "Der Höhenausschluss darf nicht als Aufforderung zur Überwindung umgedeutet werden; eine Diagnose ist ebenfalls nicht genannt."
    },
    "why": "Der Höhenausschluss darf nicht als Aufforderung zur Überwindung umgedeutet werden; eine Diagnose ist ebenfalls nicht genannt.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "sport",
      "synthetic-compositional-not-field-validation"
    ],
    "extensions": [
      "Die eigene Tätigkeit darf keine Nutzung in Höhe verlangen"
    ]
  },
  {
    "id": "advice-tobi-swim-lanes-not-spa",
    "family": "swim-lanes-not-spa",
    "split": "TRAIN",
    "domain": "sport",
    "query": "Ich will Bahnen schwimmen, nicht einfach im warmen Wasser liegen.",
    "goal": "Sportliches Schwimmen mit Bahnen statt Ersatz durch Erholungsbad.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "swimming"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.feature",
        "value": {
          "text": "Schwimmbahnen"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Sportliches Schwimmen mit Bahnen statt Ersatz durch Erholungsbad.",
        "purpose": "Sportliches Schwimmen mit Bahnen statt Ersatz durch Erholungsbad.",
        "quotes": [
          "Ich will Bahnen schwimmen, nicht einfach im warmen Wasser liegen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Tanne",
        "category": "SPORT_MOVEMENT",
        "kind": "SWIMMING",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "offer.feature",
            "Schwimmbahnen"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt.",
        "placeTypes": [
          "SWIMMING_POOL"
        ]
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt Schwimmen mit Schwimmbahnen. Das ist die passendere Richtung als ein reines Entspannungsbad; freie Bahnen zur Wunschzeit sind damit noch nicht zugesagt.",
      "question": null,
      "caveat": "Die aktuelle Belegung der Bahnen ist nicht geprüft."
    },
    "wrong": {
      "text": "Ein warmes Whirlpoolbecken erfüllt deinen Schwimmwunsch genauso.",
      "why": "Baden und sportliches Bahnenschwimmen sind unterschiedliche Ziele."
    },
    "why": "Baden und sportliches Bahnenschwimmen sind unterschiedliche Ziele.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "sport"
    ]
  },
  {
    "id": "advice-tobi-planning-not-physical-energy",
    "family": "planning-not-physical-energy",
    "split": "TRAIN",
    "domain": "sport",
    "query": "Keine Lust mehr zu organisieren. Such du etwas Aktives für mich aus, ich will mich auspowern.",
    "goal": "Planungsarbeit übernehmen und den ausdrücklich aktiven Wunsch erhalten.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "movement"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.character",
        "value": {
          "text": "auspowern"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "Planung delegieren"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Bouldern als vorgeschlagene aktive Richtung",
        "purpose": "Bouldern als eigene Idee zum ausdrücklich aktiven Ziel prüfen; kein behaupteter Nutzerwunsch.",
        "quotes": [
          "Keine Lust mehr zu organisieren. Such du etwas Aktives für mich aus, ich will mich auspowern."
        ],
        "preferences": [
          {
            "key": "experience.activity",
            "value": "Bouldern"
          }
        ],
        "evidenceQuestions": [
          "Welche belegten Angaben zeigen die gewünschte körperliche Herausforderung des Angebots?"
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kiefer",
        "category": "SPORT",
        "kind": "BOULDERING",
        "areaKind": "BOULDER_AREA",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Bouldern würde ich als aktive Idee prüfen. Noch fehlt eine Bestätigung, dass das konkrete Angebot die von dir gewünschte körperliche Herausforderung bietet.",
      "question": null,
      "caveat": "Die gewünschte Intensität des konkreten Angebots ist nicht bestätigt."
    },
    "wrong": {
      "text": "Du bist erschöpft, deshalb kommt nur stilles Teetrinken infrage.",
      "why": "Fehlende Organisationslust ist kein Beleg körperlicher Erschöpfung und widerspricht nicht dem ausdrücklich aktiven Ziel."
    },
    "why": "Fehlende Organisationslust ist kein Beleg körperlicher Erschöpfung und widerspricht nicht dem ausdrücklich aktiven Ziel.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "sport"
    ]
  },
  {
    "id": "advice-tobi-minigolf-no-tournament",
    "family": "minigolf-no-tournament",
    "split": "TRAIN",
    "domain": "sport",
    "query": "Einfach Minigolf mit meiner Schwester, bitte keinen Wettkampf.",
    "goal": "Gemeinsames Minigolf ohne Wettkampfteilnahme.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "Minigolf"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Schwester"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "atmosphere.competition",
        "value": {
          "text": "Wettkampf"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gemeinsames Minigolf ohne Wettkampfteilnahme.",
        "purpose": "Gemeinsames Minigolf ohne Wettkampfteilnahme.",
        "quotes": [
          "Einfach Minigolf mit meiner Schwester, bitte keinen Wettkampf."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Freie Nutzung ohne Wettkampf ist nicht bestätigt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Holunder",
        "category": "SPORT",
        "kind": "MINI_GOLF",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Freies Minigolfspiel wäre passend. Freie Nutzung ohne Wettkampf ist nicht bestätigt.",
      "question": null,
      "caveat": "Freie Nutzung ohne Wettkampf ist nicht bestätigt."
    },
    "wrong": {
      "text": "Der Club richtet auch Turniere aus, deshalb darfst du dort nie spielen.",
      "why": "Ausgeschlossen ist der eigene Wettkampf; andere Angebote eines Betriebs werden dadurch nicht verboten."
    },
    "why": "Ausgeschlossen ist der eigene Wettkampf; andere Angebote eines Betriebs werden dadurch nicht verboten.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "sport"
    ]
  },
  {
    "id": "advice-tobi-sport-shower-commute",
    "family": "sport-shower-commute",
    "split": "VALIDATION",
    "domain": "sport",
    "query": "Nach dem Sport muss ich direkt weiter. Bouldern mit Dusche vor Ort wäre deshalb wichtig.",
    "goal": "Bouldern mit funktional erforderlicher Dusche am selben Betrieb.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "Bouldern"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.feature",
        "value": {
          "text": "Dusche"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "nach dem Sport direkt weiter"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Bouldern mit funktional erforderlicher Dusche am selben Betrieb.",
        "purpose": "Bouldern mit funktional erforderlicher Dusche am selben Betrieb.",
        "quotes": [
          "Nach dem Sport muss ich direkt weiter. Bouldern mit Dusche vor Ort wäre deshalb wichtig."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Buche",
        "category": "SPORT",
        "kind": "BOULDERING",
        "areaKind": "BOULDER_AREA",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "amenity.shower",
            true
          ],
          [
            "offer.feature",
            "Dusche"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt Bouldern und eine Dusche vor Ort. Das passt zu deinem anschliessenden Weitergehen; Öffnung und tatsächliche Duschverfügbarkeit zum Besuch sind damit nicht als Buchung zugesagt.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Die Halle sieht modern aus, sie hat sicher Duschen.",
      "why": "Aus Stil oder Gebäudeeindruck darf keine funktional benötigte Ausstattung erfunden werden."
    },
    "why": "Aus Stil oder Gebäudeeindruck darf keine funktional benötigte Ausstattung erfunden werden.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "sport",
      "synthetic-compositional-not-field-validation"
    ]
  },
  {
    "id": "advice-tobi-rain-walk-chosen",
    "family": "rain-walk-chosen",
    "split": "TRAIN",
    "domain": "nature",
    "query": "Es regnet, trotzdem möchte ich draussen spazieren. Drinnen sitzen kann ich später.",
    "goal": "Den ausdrücklich gewünschten Spaziergang trotz Regen erhalten.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "walk"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.area",
        "value": {
          "text": "outdoor"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "trotz Regen spazieren"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Den ausdrücklich gewünschten Spaziergang trotz Regen erhalten.",
        "purpose": "Den ausdrücklich gewünschten Spaziergang trotz Regen erhalten.",
        "quotes": [
          "Es regnet, trotzdem möchte ich draussen spazieren. Drinnen sitzen kann ich später."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Lärche",
        "category": "OUTDOOR_NATURE",
        "kind": "WALK",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort hat einen Spaziergang draussen als belegtes Angebot. Das entspricht deiner gewählten Richtung; Zustand und Sicherheit des Wegs bei aktuellem Regen sind noch nicht geprüft.",
      "question": null,
      "caveat": "Aktueller Wegzustand ist nicht bestätigt."
    },
    "wrong": {
      "text": "Bei Regen ersetze ich den Spaziergang automatisch durch ein Café.",
      "why": "Wetterkontext darf einen ausdrücklich aufrechterhaltenen Wunsch nicht aufheben."
    },
    "why": "Wetterkontext darf einen ausdrücklich aufrechterhaltenen Wunsch nicht aufheben.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "nature"
    ]
  },
  {
    "id": "advice-tobi-birdwatch-no-sighting-guarantee",
    "family": "birdwatch-no-sighting-guarantee",
    "split": "VALIDATION",
    "domain": "nature",
    "query": "Ich würde gern Vögel beobachten. Mir reicht auch, wenn wir keine besonderen sehen.",
    "goal": "Vogelbeobachtung ohne garantierte seltene Sichtung.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "animals"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "Vögel beobachten ohne Sichtungsgarantie"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.feature",
        "value": {
          "text": "Vögel"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Vogelbeobachtung ohne garantierte seltene Sichtung.",
        "purpose": "Vogelbeobachtung ohne garantierte seltene Sichtung.",
        "quotes": [
          "Ich würde gern Vögel beobachten. Mir reicht auch, wenn wir keine besonderen sehen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Fichte",
        "category": "ZOO",
        "kind": "ANIMAL_OBSERVATION",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "experience.theme",
            "Vögel"
          ],
          [
            "offer.feature",
            "Vögel"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt Vogelbeobachtung. Das passt zu deinem Interesse; weder seltene Arten noch tatsächliche Sichtungen werden dadurch garantiert.",
      "question": null,
      "caveat": "Tatsächliche Sichtungen und seltene Arten sind nicht bestätigt."
    },
    "wrong": {
      "text": "Dort siehst du garantiert seltene Vögel.",
      "why": "Allgemeine Tierbeobachtung beweist weder Vogelarten noch eine tatsächliche Sichtung."
    },
    "why": "Allgemeine Tierbeobachtung beweist weder Vogelarten noch eine tatsächliche Sichtung.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "nature",
      "synthetic-compositional-not-field-validation"
    ],
    "extensions": []
  },
  {
    "id": "advice-tobi-warm-bath-no-sport",
    "family": "warm-bath-no-sport",
    "split": "TRAIN",
    "domain": "water",
    "query": "Ein bisschen im warmen Wasser entspannen, sportlich schwimmen muss ich heute nicht.",
    "goal": "Baden im ausdrücklich gewünschten warmen Wasser; sportliches Schwimmen ist nicht erforderlich.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "bathing"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.temperature",
        "value": {
          "text": "warmes Wasser"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.activity",
        "value": {
          "text": "swimming"
        },
        "modality": "NOT_REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "time.date",
        "value": {
          "date": "2026-11-12",
          "operator": "EQ",
          "timezone": "Europe/Zurich"
        },
        "modality": "REQUIRED",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Baden im ausdrücklich gewünschten warmen Wasser; sportliches Schwimmen ist nicht erforderlich.",
        "purpose": "Baden im ausdrücklich gewünschten warmen Wasser; sportliches Schwimmen ist nicht erforderlich.",
        "quotes": [
          "Ein bisschen im warmen Wasser entspannen, sportlich schwimmen muss ich heute nicht."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Weide",
        "category": "WELLNESS_RELAXATION",
        "kind": "BATHING",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "offer.temperature",
            "warmes Wasser"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt.",
        "placeTypes": [
          "SPA"
        ]
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort bietet Baden mit warmem Wasser. Das passt als ruhige Auszeit; ein sportliches Schwimmprogramm ist dafür keine Voraussetzung.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Du musst zuerst Bahnen schwimmen, sonst zählt es nicht als Badbesuch.",
      "why": "Erholung im Wasser braucht kein sportliches Zusatzprogramm."
    },
    "why": "Erholung im Wasser braucht kein sportliches Zusatzprogramm.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "water"
    ]
  },
  {
    "id": "advice-tobi-non-swimmer-child",
    "family": "non-swimmer-child",
    "split": "TEST",
    "domain": "water",
    "query": "Mein Kind kann noch nicht schwimmen. Zusammen planschen wäre schön; dafür brauche ich einen ausgewiesenen Nichtschwimmerbereich.",
    "goal": "Gemeinsames Baden mit ausdrücklich zu prüfender Nichtschwimmereignung.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "bathing"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Kind"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      },
      {
        "key": "people.capability",
        "value": {
          "text": "kann nicht schwimmen"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.feature",
        "value": {
          "text": "Nichtschwimmerbereich"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gemeinsames Baden mit ausdrücklich zu prüfender Nichtschwimmereignung.",
        "purpose": "Gemeinsames Baden mit ausdrücklich zu prüfender Nichtschwimmereignung.",
        "quotes": [
          "Mein Kind kann noch nicht schwimmen. Zusammen planschen wäre schön; dafür brauche ich einen ausgewiesenen Nichtschwimmerbereich."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Erle",
        "category": "WELLNESS_RELAXATION",
        "kind": "BATHING",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "participation.age_suitability",
            "Alle Altersgruppen"
          ]
        ],
        "areaProperties": [
          [
            "offer.feature",
            "Nichtschwimmerbereich"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt.",
        "placeTypes": [
          "SPA"
        ]
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt Baden und einen ausgewiesenen Nichtschwimmerbereich. Das ist eine passende Richtung für euer gemeinsames Planschen.",
      "question": null,
      "caveat": "Damit ist keine Sicherheits- oder Aufsichtszusage verbunden."
    },
    "wrong": {
      "text": "Ein Familienbad ist automatisch sicher für jedes nicht schwimmende Kind.",
      "why": "Ein Familienlabel ersetzt keine konkrete Eignungsprüfung und verspricht keine Sicherheit."
    },
    "why": "Ein Familienlabel ersetzt keine konkrete Eignungsprüfung und verspricht keine Sicherheit.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "water",
      "synthetic-compositional-not-field-validation"
    ]
  },
  {
    "id": "advice-tobi-animal-welfare-no-touch",
    "family": "animal-welfare-no-touch",
    "split": "TEST",
    "domain": "animals",
    "query": "Tiere anschauen mit meiner Freundin. Streicheln müssen wir sie nicht, eine Show wollen wir nicht.",
    "goal": "Tierbeobachtung ohne Showpflicht; Berühren ist nicht nötig.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "animals"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Freundin"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.format",
        "value": {
          "text": "Streicheln"
        },
        "modality": "NOT_REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.format",
        "value": {
          "text": "Tiershow"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Tierbeobachtung ohne Showpflicht; Berühren ist nicht nötig.",
        "purpose": "Tierbeobachtung ohne Showpflicht; Berühren ist nicht nötig.",
        "quotes": [
          "Tiere anschauen mit meiner Freundin. Streicheln müssen wir sie nicht, eine Show wollen wir nicht."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Besuchsformat ohne Show ist nicht belegt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kiefer",
        "category": "ZOO",
        "kind": "ANIMAL_OBSERVATION",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein normales Beobachtungsangebot wäre passend. Besuchsformat ohne Show ist nicht belegt.",
      "question": null,
      "caveat": "Besuchsformat ohne Show ist nicht belegt."
    },
    "wrong": {
      "text": "Nur ein Streichelangebot kommt für euch infrage.",
      "why": "Nicht benötigtes Berühren darf nicht zur Pflicht werden; die Show bleibt ausdrücklich ausgeschlossen."
    },
    "why": "Nicht benötigtes Berühren darf nicht zur Pflicht werden; die Show bleibt ausdrücklich ausgeschlossen.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "animals",
      "synthetic-compositional-not-field-validation"
    ]
  },
  {
    "id": "advice-tobi-dog-walk-permission",
    "family": "dog-walk-permission",
    "split": "TRAIN",
    "domain": "nature",
    "query": "Ich möchte mit meinem Hund spazieren gehen, nicht in einen Tierpark.",
    "goal": "Spaziergang mit Hund statt Tierpark als vermeintlichem Tierinteresse.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "walk"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.pet",
        "value": {
          "text": "Hund"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.permission",
        "value": {
          "text": "Hund erlaubt"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.kind",
        "value": {
          "text": "ZOO"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Spaziergang mit Hund statt Tierpark als vermeintlichem Tierinteresse.",
        "purpose": "Spaziergang mit Hund statt Tierpark als vermeintlichem Tierinteresse.",
        "quotes": [
          "Ich möchte mit meinem Hund spazieren gehen, nicht in einen Tierpark."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Hundeerlaubnis des konkreten Angebots ist nicht belegt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Pappel",
        "category": "OUTDOOR_NATURE",
        "kind": "WALK",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein Spazierweg mit bestätigter Hundeerlaubnis wäre die Suchrichtung. Hundeerlaubnis des konkreten Angebots ist nicht belegt.",
      "question": null,
      "caveat": "Hundeerlaubnis des konkreten Angebots ist nicht belegt."
    },
    "wrong": {
      "text": "Du hast einen Hund, also empfehle ich dir einen Zoo.",
      "why": "Ein mitgebrachter Hund bedeutet weder Interesse an Tierbeobachtung noch bestätigten Hundezugang."
    },
    "why": "Ein mitgebrachter Hund bedeutet weder Interesse an Tierbeobachtung noch bestätigten Hundezugang.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "nature"
    ]
  },
  {
    "id": "advice-tobi-rhine-sit-not-walk",
    "family": "rhine-sit-not-walk",
    "split": "TRAIN",
    "domain": "nature",
    "query": "Am Rhein sitzen und einfach schauen. Eine grosse Runde laufen will ich nicht.",
    "goal": "Aufenthalt am Rhein statt erzwungenem Spazierprogramm.",
    "facts": [
      {
        "key": "location.waterbody",
        "value": {
          "text": "Rhein"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "sitzen und schauen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Aufenthalt am Rhein statt erzwungenem Spazierprogramm.",
        "purpose": "Aufenthalt am Rhein statt erzwungenem Spazierprogramm.",
        "quotes": [
          "Am Rhein sitzen und einfach schauen. Eine grosse Runde laufen will ich nicht."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Sitzende Nutzung und erforderliche Gehstrecke fehlen."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Ahorn",
        "category": "OUTDOOR_NATURE",
        "kind": "WALK",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "location.waterbody",
            "Rhein"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein Sitzplatz am Rhein wäre eine passende Richtung. Sitzende Nutzung und erforderliche Gehstrecke fehlen.",
      "question": null,
      "caveat": "Sitzende Nutzung und erforderliche Gehstrecke fehlen."
    },
    "wrong": {
      "text": "Ich schlage dir eine lange Rheinwanderung vor.",
      "why": "Die genannte Landschaft rechtfertigt keine unerwünschte lange Gehaktivität."
    },
    "why": "Die genannte Landschaft rechtfertigt keine unerwünschte lange Gehaktivität.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "nature"
    ],
    "extensions": [
      "Eine sitzende Nutzung ohne grosse Gehstrecke muss möglich sein"
    ]
  },
  {
    "id": "advice-tobi-nature-food-separate",
    "family": "nature-food-separate",
    "split": "TRAIN",
    "domain": "nature",
    "query": "Erst spazieren, danach irgendwo etwas trinken. Es muss nicht am gleichen Ort sein.",
    "goal": "Spaziergang vor Getränk, gemeinsame Adresse nicht erforderlich.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "walk"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "food.drink",
        "value": {
          "text": "drinks"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a2"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Spaziergang vor Getränk, gemeinsame Adresse nicht erforderlich.",
        "purpose": "Spaziergang vor Getränk, gemeinsame Adresse nicht erforderlich.",
        "quotes": [
          "Erst spazieren, danach irgendwo etwas trinken. Es muss nicht am gleichen Ort sein."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Die zweite Etappe und ihre Erreichbarkeit sind nicht belegt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Lärche",
        "category": "OUTDOOR_NATURE",
        "kind": "WALK",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Gesucht ist zuerst ein Spaziergang und danach ein Getränk. Die zweite Etappe bleibt Teil deines Wunsches; eine gemeinsame Adresse hast du dafür nicht verlangt. Beide Etappen kann ich hier noch nicht als passenden Plan bestätigen.",
      "question": null,
      "caveat": "Die zweite Etappe und ihre Erreichbarkeit sind nicht belegt."
    },
    "wrong": {
      "text": "Ohne Café direkt am Weg kann der Spaziergang nicht passen.",
      "why": "Die ausdrücklich freie Ortswahl darf nicht zu einer gastronomischen Ausstattungspflicht am Weg werden."
    },
    "why": "Die ausdrücklich freie Ortswahl darf nicht zu einer gastronomischen Ausstattungspflicht am Weg werden.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "nature"
    ],
    "sequence": [
      1,
      2
    ]
  },
  {
    "id": "advice-tobi-winter-outdoor-pool",
    "family": "winter-outdoor-pool",
    "split": "TRAIN",
    "domain": "water",
    "query": "Im November draussen schwimmen, falls tatsächlich ein Bad offen ist. Sonst lieber nichts erzwingen.",
    "goal": "Aussenschwimmen nur mit tatsächlichem Saisonbetrieb.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "swimming"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.area",
        "value": {
          "text": "outdoor"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "im November nur bei bestätigtem Betrieb"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Aussenschwimmen nur mit tatsächlichem Saisonbetrieb.",
        "purpose": "Aussenschwimmen nur mit tatsächlichem Saisonbetrieb.",
        "quotes": [
          "Im November draussen schwimmen, falls tatsächlich ein Bad offen ist. Sonst lieber nichts erzwingen."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Betrieb im November ist ausdrücklich nicht bestätigt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Erle",
        "category": "SPORT_MOVEMENT",
        "kind": "SWIMMING",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt.",
        "placeTypes": [
          "SWIMMING_POOL"
        ]
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Draussen schwimmen ist deine gewählte Richtung, ausdrücklich im November. Diese saisonale Nutzbarkeit kann ich hier noch nicht zuverlässig bestätigen; ich würde deshalb kein anderes Programm erzwingen.",
      "question": null,
      "caveat": "Die Nutzung im November ist nicht bestätigt; ein allgemeiner Wochenplan reicht dafür nicht als konkreter Besuchsnachweis."
    },
    "wrong": {
      "text": "Ein Freibad ist im November bestimmt offen, weil es auf der Karte steht.",
      "why": "Die Existenz eines Angebots beweist keinen saisonalen Betrieb."
    },
    "why": "Die Existenz eines Angebots beweist keinen saisonalen Betrieb.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "water"
    ],
    "extensions": [
      "Die gewünschte Nutzung des Aussenbads muss im November stattfinden können"
    ]
  },
  {
    "id": "advice-tobi-park-step-free-parent",
    "family": "park-step-free-parent",
    "split": "TEST",
    "domain": "nature",
    "query": "Mit meinem Vater in einen Park, die Wege müssen stufenlos sein. Er möchte draussen sein.",
    "goal": "Draussen im Park mit stufenlosen tatsächlich genutzten Wegen.",
    "facts": [
      {
        "key": "location.setting",
        "value": {
          "text": "Park"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Vater"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.accessibility",
        "value": {
          "text": "stufenlose Wege"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.area",
        "value": {
          "text": "outdoor"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Draussen im Park mit stufenlosen tatsächlich genutzten Wegen.",
        "purpose": "Draussen im Park mit stufenlosen tatsächlich genutzten Wegen.",
        "quotes": [
          "Mit meinem Vater in einen Park, die Wege müssen stufenlos sein. Er möchte draussen sein."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Holunder",
        "category": "OUTDOOR_NATURE",
        "kind": "WALK",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "location.setting",
            "Park"
          ],
          [
            "participation.accessibility",
            "stufenlose Wege"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Beim Lernort ist der genutzte Wegbereich im Park als stufenlos belegt. Das passt zu eurem Wunsch, gemeinsam draussen zu sein; ein stufenloser Eingang allein hätte dafür nicht gereicht.",
      "question": null,
      "caveat": "Die Aussage gilt für den belegten Wegbereich, nicht automatisch für jede weitere Route im Park."
    },
    "wrong": {
      "text": "Der Eingang ist stufenlos, damit ist jeder Weg im Park zugänglich.",
      "why": "Zugang am Eingang beweist nicht den Zustand der gesamten gewünschten Nutzung."
    },
    "why": "Zugang am Eingang beweist nicht den Zustand der gesamten gewünschten Nutzung.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "nature",
      "synthetic-compositional-not-field-validation"
    ]
  },
  {
    "id": "advice-tobi-reunion-conversation",
    "family": "reunion-conversation",
    "split": "TRAIN",
    "domain": "friends",
    "query": "Endlich wieder mit meinen alten Freunden reden. Ein Getränk reicht, wir müssen uns gut verstehen können.",
    "goal": "Wiedersehen mit gesichert möglicher Unterhaltung statt Essensprogramm.",
    "facts": [
      {
        "key": "food.drink",
        "value": {
          "text": "drinks"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Freunde"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "atmosphere.conversation",
        "value": {
          "text": "conversation_possible"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "food.meal",
        "value": {
          "text": "meal"
        },
        "modality": "NOT_REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Wiedersehen mit gesichert möglicher Unterhaltung statt Essensprogramm.",
        "purpose": "Wiedersehen mit gesichert möglicher Unterhaltung statt Essensprogramm.",
        "quotes": [
          "Endlich wieder mit meinen alten Freunden reden. Ein Getränk reicht, wir müssen uns gut verstehen können."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Lärche",
        "category": "RESTAURANT",
        "kind": "DRINKS",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.drink",
            "drinks"
          ]
        ],
        "areaProperties": [
          [
            "atmosphere.conversation",
            "Unterhaltung gut möglich"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort bietet Getränke und belegt gute Gesprächsbedingungen. Das passt zu eurem Wiedersehen; ein Abendessen müsst ihr daraus nicht machen.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Ein lautes Konzert mit Bar ist perfekt, weil Getränke vorhanden sind.",
      "why": "Das ausdrücklich funktionale Gesprächsziel muss die Auswahl tatsächlich tragen."
    },
    "why": "Das ausdrücklich funktionale Gesprächsziel muss die Auswahl tatsächlich tragen.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends"
    ]
  },
  {
    "id": "advice-tobi-group-diet-separate-people",
    "family": "group-diet-separate-people",
    "split": "TEST",
    "domain": "friends",
    "query": "Meine Freundin will Pizza, ich brauche glutenfrei. Wir möchten zusammen essen.",
    "goal": "Pizza für Freundin und glutenfreies eigenes Essen am gemeinsamen Besuch.",
    "facts": [
      {
        "key": "food.dish",
        "value": {
          "text": "Pizza"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Freundin"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.role",
        "value": {
          "text": "self"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "food.diet",
        "value": {
          "text": "gluten_free"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "p2"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Pizza für Freundin und glutenfreies eigenes Essen am gemeinsamen Besuch.",
        "purpose": "Pizza für Freundin und glutenfreies eigenes Essen am gemeinsamen Besuch.",
        "quotes": [
          "Meine Freundin will Pizza, ich brauche glutenfrei. Wir möchten zusammen essen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Zeder",
        "category": "RESTAURANT",
        "kind": "DINNER",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.dish",
            "Pizza"
          ],
          [
            "food.diet",
            "glutenfrei"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt Pizza und eine glutenfreie Option zum Essen. Das ist eine passende gemeinsame Richtung, ohne deiner Freundin dieselbe Ernährungsregel aufzuerlegen.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Wenn eine Pizza angeboten wird, ist sie bestimmt glutenfrei.",
      "why": "Gericht und individueller Ernährungsbedarf brauchen jeweils passende Belege."
    },
    "why": "Gericht und individueller Ernährungsbedarf brauchen jeweils passende Belege.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends",
      "synthetic-compositional-not-field-validation"
    ]
  },
  {
    "id": "advice-tobi-bowling-six-spectators",
    "family": "bowling-six-spectators",
    "split": "TRAIN",
    "domain": "friends",
    "query": "Wir sind sechs beim Bowling, aber zwei schauen nur zu.",
    "goal": "Vier aktive Personen und zwei Zuschauende getrennt berücksichtigen.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "Bowling"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.count",
        "value": {
          "amount": 6,
          "operator": "EQ",
          "unit": "PEOPLE"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "gVisit"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.count",
        "value": {
          "amount": 4,
          "operator": "EQ",
          "unit": "PEOPLE"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "gPlayers"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.participation",
        "value": {
          "text": "zuschauend"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "gSpectators"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Vier aktive Personen und zwei Zuschauende getrennt berücksichtigen.",
        "purpose": "Vier aktive Personen und zwei Zuschauende getrennt berücksichtigen.",
        "quotes": [
          "Wir sind sechs beim Bowling, aber zwei schauen nur zu."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Spielkapazität und Zugang der Zuschauenden sind nicht belegt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kiefer",
        "category": "SPORT",
        "kind": "BOWLING",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Bowling für vier Spielende mit zwei erlaubten Zuschauenden wäre passend. Spielkapazität und Zugang der Zuschauenden sind nicht belegt.",
      "question": null,
      "caveat": "Spielkapazität und Zugang der Zuschauenden sind nicht belegt."
    },
    "wrong": {
      "text": "Ihr braucht zwingend sechs aktive Spielerplätze.",
      "why": "Gesamte Anwesenheit und aktive Nutzung sind nicht austauschbar."
    },
    "why": "Gesamte Anwesenheit und aktive Nutzung sind nicht austauschbar.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends"
    ],
    "entityKinds": {
      "gVisit": "GROUP",
      "gPlayers": "GROUP",
      "gSpectators": "GROUP"
    }
  },
  {
    "id": "advice-tobi-alcohol-free-toast",
    "family": "alcohol-free-toast",
    "split": "TRAIN",
    "domain": "friends",
    "query": "Mit Freunden anstossen, für mich aber nur alkoholfrei. Eine Bar ist völlig okay.",
    "goal": "Gemeinsam anstossen mit eigener alkoholfreier Auswahl ohne Barverbot.",
    "facts": [
      {
        "key": "food.drink",
        "value": {
          "text": "drinks"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Freunde"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "food.option",
        "value": {
          "text": "alkoholfrei"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "pSelf"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.role",
        "value": {
          "text": "self"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "pSelf"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gemeinsam anstossen mit eigener alkoholfreier Auswahl ohne Barverbot.",
        "purpose": "Gemeinsam anstossen mit eigener alkoholfreier Auswahl ohne Barverbot.",
        "quotes": [
          "Mit Freunden anstossen, für mich aber nur alkoholfrei. Eine Bar ist völlig okay."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Alkoholfreie Option ist noch nicht belegt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Lärche",
        "category": "RESTAURANT",
        "kind": "DRINKS",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.drink",
            "drinks"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein Ort mit ausdrücklich alkoholfreier Auswahl wäre passend. Alkoholfreie Option ist noch nicht belegt.",
      "question": null,
      "caveat": "Alkoholfreie Option ist noch nicht belegt."
    },
    "wrong": {
      "text": "Weil du alkoholfrei trinkst, müssen sämtliche Bars ausgeschlossen werden.",
      "why": "Der persönliche Konsumwunsch ist kein Verbot anderer Getränke oder eines Ortstyps."
    },
    "why": "Der persönliche Konsumwunsch ist kein Verbot anderer Getränke oder eines Ortstyps.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends"
    ]
  },
  {
    "id": "advice-tobi-group-conflicting-directions",
    "family": "group-conflicting-directions",
    "split": "TRAIN",
    "domain": "friends",
    "query": "Eine von uns will Kultur, die andere Bewegung. Wir haben uns noch nicht entschieden. Frag uns kurz.",
    "goal": "Eine entscheidbare gemeinsame Prioritätsfrage stellen.",
    "facts": [
      {
        "key": "experience.purpose",
        "value": {
          "text": "gemeinsame Richtung bei Kultur- und Bewegungsinteresse finden"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Eine entscheidbare gemeinsame Prioritätsfrage stellen.",
        "purpose": "Eine entscheidbare gemeinsame Prioritätsfrage stellen.",
        "quotes": [
          "Eine von uns will Kultur, die andere Bewegung. Wir haben uns noch nicht entschieden. Frag uns kurz."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Wacholder",
        "category": "MUSEUM",
        "kind": "SELF_GUIDED_VISIT",
        "areaKind": "EXHIBITION",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "CLARIFY",
      "venueKey": null,
      "text": "Ich würde zuerst klären, was ihr gemeinsam ausprobieren möchtet, statt eine von euch still zu übergehen.",
      "question": "Was möchtet ihr heute gemeinsam ausprobieren: Kultur, Bewegung oder etwas, das beides verbindet?",
      "caveat": null
    },
    "wrong": {
      "text": "Dann ist ein Museum für beide eindeutig die beste Wahl.",
      "why": "Unentschiedene unterschiedliche Interessen sind keine bestätigte gemeinsame Kulturpflicht."
    },
    "why": "Unentschiedene unterschiedliche Interessen sind keine bestätigte gemeinsame Kulturpflicht.",
    "expectedIssue": "NEEDS_CLARIFICATION",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends"
    ],
    "missing": [
      {
        "dimension": "EXPERIENCE_DIRECTION",
        "whyItMatters": "Die gemeinsame Richtung ist ausdrücklich noch unentschieden."
      }
    ],
    "question": {
      "dimension": "EXPERIENCE_DIRECTION",
      "question": "Was möchtet ihr heute gemeinsam ausprobieren?",
      "options": [
        "Kultur",
        "Bewegung",
        "Eine Verbindung aus beidem"
      ]
    }
  },
  {
    "id": "advice-tobi-friend-late-arrival",
    "family": "friend-late-arrival",
    "split": "VALIDATION",
    "domain": "friends",
    "query": "Beim Billard stösst eine Freundin erst später dazu. Wir wollen nicht auf sie warten müssen.",
    "goal": "Zeitlich flexibles Dazustossen statt synchroner Startpflicht.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "Billard"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Freundin"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "verspätetes Dazustossen ermöglichen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Zeitlich flexibles Dazustossen statt synchroner Startpflicht.",
        "purpose": "Zeitlich flexibles Dazustossen statt synchroner Startpflicht.",
        "quotes": [
          "Beim Billard stösst eine Freundin erst später dazu. Wir wollen nicht auf sie warten müssen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Hasel",
        "category": "SPORT",
        "kind": "BOWLING",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "NO_MATCH",
      "venueKey": null,
      "text": "Für euren Wunsch ist kein Billardangebot bestätigt. Ich würde gezielt freies Billardspiel prüfen, bei dem eine Person später dazukommen kann; eine andere Sportart ist kein stiller Ersatz.",
      "question": null,
      "caveat": "Kein belegtes Billardangebot in den übergebenen Kandidaten."
    },
    "wrong": {
      "text": "Bowling ist fast dasselbe, also empfehle ich das ohne Rückfrage.",
      "why": "Eine ähnliche Freizeitkategorie ersetzt eine ausdrücklich gewünschte Tätigkeit nicht."
    },
    "why": "Eine ähnliche Freizeitkategorie ersetzt eine ausdrücklich gewünschte Tätigkeit nicht.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends",
      "synthetic-compositional-not-field-validation"
    ],
    "extensions": [
      "Eine Person muss später zur laufenden Nutzung dazukommen können"
    ]
  },
  {
    "id": "advice-tobi-group-total-spending",
    "family": "group-total-spending",
    "split": "TRAIN",
    "domain": "friends",
    "query": "Zu viert etwas trinken, zusammen haben wir höchstens vierzig Franken.",
    "goal": "Getränke für vier innerhalb des gemeinsamen Budgets.",
    "facts": [
      {
        "key": "food.drink",
        "value": {
          "text": "drinks"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.count",
        "value": {
          "amount": 4,
          "operator": "EQ",
          "unit": "PEOPLE"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "gVisit"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "budget.maximum",
        "value": {
          "amount": 40,
          "operator": "LTE",
          "currency": "CHF"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "budget.scope",
        "value": {
          "scope": "GROUP_TOTAL"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Getränke für vier innerhalb des gemeinsamen Budgets.",
        "purpose": "Getränke für vier innerhalb des gemeinsamen Budgets.",
        "quotes": [
          "Zu viert etwas trinken, zusammen haben wir höchstens vierzig Franken."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Weide",
        "category": "RESTAURANT",
        "kind": "DRINKS",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.drink",
            "drinks"
          ],
          [
            "offer.capacity",
            4
          ],
          [
            "food.drink",
            "drinks"
          ]
        ],
        "areaProperties": [
          [
            "offer.capacity",
            4
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt.",
        "price": 6
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt Getränke und die nötige Kapazität für eure Vierergruppe. Die hinterlegte Preisspanne passt zu eurem gemeinsamen Limit von vierzig Franken.",
      "question": null,
      "caveat": "Freie Plätze zum Besuch sind nicht bestätigt."
    },
    "wrong": {
      "text": "Vierzig Franken pro Person sind für euch okay.",
      "why": "Das ausdrücklich gemeinsame Budget darf nicht vervierfacht werden."
    },
    "why": "Das ausdrücklich gemeinsame Budget darf nicht vervierfacht werden.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends"
    ]
  },
  {
    "id": "advice-tobi-new-people-without-party",
    "family": "new-people-without-party",
    "split": "TRAIN",
    "domain": "friends",
    "query": "Ich möchte neue Leute kennenlernen, aber keine Party. Gemeinsam etwas machen wäre mir lieber.",
    "goal": "Begegnung durch gemeinsame Tätigkeit, ohne Partyteilnahme.",
    "facts": [
      {
        "key": "experience.purpose",
        "value": {
          "text": "neue Leute kennenlernen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.activity",
        "value": {
          "text": "party"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Begegnung durch gemeinsame Tätigkeit, ohne Partyteilnahme.",
        "purpose": "Begegnung durch gemeinsame Tätigkeit, ohne Partyteilnahme.",
        "quotes": [
          "Ich möchte neue Leute kennenlernen, aber keine Party. Gemeinsam etwas machen wäre mir lieber."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Offene Gruppenteilnahme und Veranstaltungsformat fehlen."
        ],
        "activityIdea": {
          "key": "experience.activity",
          "value": "Workshop"
        }
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Zeder",
        "category": "MUSEUM",
        "kind": "WORKSHOP",
        "areaKind": "WORKSHOP",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein offener Workshop könnte eine passende Suchrichtung sein. Offene Gruppenteilnahme und Veranstaltungsformat fehlen.",
      "question": null,
      "caveat": "Offene Gruppenteilnahme und Veranstaltungsformat fehlen."
    },
    "wrong": {
      "text": "Eine private Feier passt, weil dort Menschen sind.",
      "why": "Anwesenheit anderer Menschen beweist weder offenes Kennenlernen noch erfüllt sie den Partyausschluss."
    },
    "why": "Anwesenheit anderer Menschen beweist weder offenes Kennenlernen noch erfüllt sie den Partyausschluss.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends"
    ],
    "extensions": [
      "Die Teilnahme darf kein Partyformat sein"
    ]
  },
  {
    "id": "advice-tobi-friends-equal-participation",
    "family": "friends-equal-participation",
    "split": "TEST",
    "domain": "friends",
    "query": "Mit Freunden etwas unternehmen, einer kann gerade nicht sportlich mitmachen. Er soll trotzdem dazugehören.",
    "goal": "Gemeinsame Beteiligung ohne erforderliche sportliche Leistung aller.",
    "facts": [
      {
        "key": "people.relationship",
        "value": {
          "text": "Freunde"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.capability",
        "value": {
          "text": "eine Person kann aktuell nicht sportlich teilnehmen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gemeinsame Beteiligung ohne erforderliche sportliche Leistung aller.",
        "purpose": "Gemeinsame Beteiligung ohne erforderliche sportliche Leistung aller.",
        "quotes": [
          "Mit Freunden etwas unternehmen, einer kann gerade nicht sportlich mitmachen. Er soll trotzdem dazugehören."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Geeignete Beteiligung ist nicht belegt; keine medizinische Ursache genannt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kastanie",
        "category": "SPORT",
        "kind": "MINI_GOLF",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein gemeinsames Spiel mit sinnvoller Rolle ohne sportliche Pflicht wäre eine Idee. Geeignete Beteiligung ist nicht belegt; keine medizinische Ursache genannt.",
      "question": null,
      "caveat": "Geeignete Beteiligung ist nicht belegt; keine medizinische Ursache genannt."
    },
    "wrong": {
      "text": "Der Freund kann draussen warten, dann passt jede Sportaktivität.",
      "why": "Gemeinsames Dazugehören ist der Kern und darf nicht durch Ausschluss der Person ersetzt werden."
    },
    "why": "Gemeinsames Dazugehören ist der Kern und darf nicht durch Ausschluss der Person ersetzt werden.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends",
      "synthetic-compositional-not-field-validation"
    ],
    "extensions": [
      "Eine nicht sportlich teilnehmende Person muss sinnvoll bei der gemeinsamen Unternehmung dabei sein können"
    ]
  },
  {
    "id": "advice-tobi-friends-no-performative-event",
    "family": "friends-no-performative-event",
    "split": "VALIDATION",
    "domain": "friends",
    "query": "Unsere Gruppe will etwas erleben, aber keine Fotosession und nichts zum Vorführen. Einfach zusammen Spass haben.",
    "goal": "Gemeinsames Erlebnis ohne erzwungene Selbstdarstellung.",
    "facts": [
      {
        "key": "experience.purpose",
        "value": {
          "text": "gemeinsam Spass ohne Vorführdruck"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.activity",
        "value": {
          "text": "Fotosession"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Gruppe"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.permission",
        "value": {
          "text": "Teilnahme ohne verpflichtendes Vorführen"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gemeinsames Erlebnis ohne erzwungene Selbstdarstellung.",
        "purpose": "Gemeinsames Erlebnis ohne erzwungene Selbstdarstellung.",
        "quotes": [
          "Unsere Gruppe will etwas erleben, aber keine Fotosession und nichts zum Vorführen. Einfach zusammen Spass haben."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Die gewünschte Nutzung ohne Fotosession ist noch nicht bestätigt."
        ],
        "activityIdea": {
          "key": "experience.activity",
          "value": "Minigolf"
        }
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Hasel",
        "category": "SPORT",
        "kind": "MINI_GOLF",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "participation.permission",
            "Teilnahme ohne verpflichtendes Vorführen"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein gemeinsames Spiel ohne Foto- oder Vorführprogramm wäre eine Idee. Einen konkret passenden Ort kann ich dafür noch nicht belegen.",
      "question": null,
      "caveat": "Die gewünschte Nutzung ohne Fotosession ist noch nicht bestätigt."
    },
    "wrong": {
      "text": "Ich empfehle ein Event, bei dem jede Person einen Clip posten muss.",
      "why": "Gemeinsamer Spass darf nicht durch performative oder verpflichtende Reichweitenmechanik ersetzt werden."
    },
    "why": "Gemeinsamer Spass darf nicht durch performative oder verpflichtende Reichweitenmechanik ersetzt werden.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "friends",
      "synthetic-compositional-not-field-validation"
    ]
  },
  {
    "id": "advice-tobi-solo-social-background",
    "family": "solo-social-background",
    "split": "TRAIN",
    "domain": "alone",
    "query": "Allein einen Kaffee, aber gern mit Menschen um mich. Ich möchte niemanden kennenlernen müssen.",
    "goal": "Gesellschaftliche Umgebung ohne verpflichtende Kontaktaufnahme.",
    "facts": [
      {
        "key": "food.drink",
        "value": {
          "text": "coffee"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "alone"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "atmosphere.character",
        "value": {
          "text": "gesellig"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.permission",
        "value": {
          "text": "Kaffee ohne verpflichtendes Kennenlernen"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gesellschaftliche Umgebung ohne verpflichtende Kontaktaufnahme.",
        "purpose": "Gesellschaftliche Umgebung ohne verpflichtende Kontaktaufnahme.",
        "quotes": [
          "Allein einen Kaffee, aber gern mit Menschen um mich. Ich möchte niemanden kennenlernen müssen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Linde",
        "category": "RESTAURANT",
        "kind": "DRINKS",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.drink",
            "Kaffee"
          ],
          [
            "participation.permission",
            "Kaffee ohne verpflichtendes Kennenlernen"
          ]
        ],
        "areaProperties": [
          [
            "atmosphere.character",
            "gesellig"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort bietet Kaffee in geselliger Atmosphäre und belegt ausdrücklich die Nutzung ohne verpflichtendes Kennenlernen. So kannst du unter Menschen sein, ohne an einem Kontaktprogramm teilnehmen zu müssen.",
      "question": null,
      "caveat": null
    },
    "wrong": {
      "text": "Ich melde dich für ein verbindliches Speed-Dating an.",
      "why": "Allein ausgehen und Menschen um sich mögen sind kein Wunsch nach verpflichtender Interaktion."
    },
    "why": "Allein ausgehen und Menschen um sich mögen sind kein Wunsch nach verpflichtender Interaktion.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "alone"
    ]
  },
  {
    "id": "advice-tobi-solo-photo-discovery",
    "family": "solo-photo-discovery",
    "split": "VALIDATION",
    "domain": "alone",
    "query": "Allein etwas anschauen, das fotografisch interessant ist. Bekannt muss der Ort nicht sein.",
    "goal": "Visuell interessante Entdeckung ohne Popularitätszwang.",
    "facts": [
      {
        "key": "people.relationship",
        "value": {
          "text": "alone"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.character",
        "value": {
          "text": "fotografisch interessant"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.character",
        "value": {
          "text": "Bekanntheit"
        },
        "modality": "NOT_REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Visuell interessante Entdeckung ohne Popularitätszwang.",
        "purpose": "Visuell interessante Entdeckung ohne Popularitätszwang.",
        "quotes": [
          "Allein etwas anschauen, das fotografisch interessant ist. Bekannt muss der Ort nicht sein."
        ],
        "preferences": [],
        "evidenceQuestions": [],
        "activityIdea": {
          "key": "offer.kind",
          "value": "MUSEUM"
        }
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kastanie",
        "category": "MUSEUM",
        "kind": "SELF_GUIDED_VISIT",
        "areaKind": "EXHIBITION",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "atmosphere.character",
            "fotografisch interessant"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Eine Ausstellung wäre meine Suchidee. Beim Lernort ist eine fotografisch interessante Atmosphäre belegt; ein bekannter Ort ist für deine Auswahl kein Muss.",
      "question": null,
      "caveat": "Falls du dort tatsächlich fotografieren möchtest, ist die Fotoerlaubnis noch zu prüfen."
    },
    "wrong": {
      "text": "Der meistgeteilte Ort ist automatisch der passendste.",
      "why": "Reichweite ist weder Beleg visueller Passung noch Fotoerlaubnis."
    },
    "why": "Reichweite ist weder Beleg visueller Passung noch Fotoerlaubnis.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "alone",
      "synthetic-compositional-not-field-validation"
    ]
  },
  {
    "id": "advice-tobi-solo-working-tea",
    "family": "solo-working-tea",
    "split": "TRAIN",
    "domain": "alone",
    "query": "Ich will mit dem Laptop arbeiten und einen Tee trinken. Einen Arbeitstisch brauche ich, WLAN wäre nett.",
    "goal": "Arbeiten und Tee, Tisch funktional erforderlich, WLAN nur Wunsch.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "coworking"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "food.drink",
        "value": {
          "text": "Tee"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.feature",
        "value": {
          "text": "Arbeitsplatz"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.feature",
        "value": {
          "text": "WLAN"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Arbeiten und Tee, Tisch funktional erforderlich, WLAN nur Wunsch.",
        "purpose": "Arbeiten und Tee, Tisch funktional erforderlich, WLAN nur Wunsch.",
        "quotes": [
          "Ich will mit dem Laptop arbeiten und einen Tee trinken. Einen Arbeitstisch brauche ich, WLAN wäre nett."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Eiche",
        "category": "RESTAURANT",
        "kind": "DRINKS",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.drink",
            "Tee"
          ]
        ],
        "areaProperties": [
          [
            "offer.feature",
            "Arbeitsplatz"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt.",
        "offers": [
          {
            "key": "work",
            "kind": "COWORKING",
            "areaKey": "visit",
            "properties": [],
            "price": 0
          },
          {
            "key": "tea",
            "kind": "DRINKS",
            "areaKey": "visit",
            "properties": [
              [
                "food.drink",
                "Tee"
              ]
            ],
            "price": 6
          }
        ]
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort belegt einen Arbeitsplatz und Tee am selben Ort. Das passt zum Arbeiten mit Getränk; WLAN ist noch nicht bestätigt und bleibt dein weicher Wunsch.",
      "question": null,
      "caveat": "WLAN und konkrete Platzverfügbarkeit sind nicht bestätigt."
    },
    "wrong": {
      "text": "Ohne bestätigtes WLAN darf kein Ort überhaupt vorgeschlagen werden.",
      "why": "Ein optionaler Wunsch darf eine belegte funktionale Basis nicht unnötig ausschliessen."
    },
    "why": "Ein optionaler Wunsch darf eine belegte funktionale Basis nicht unnötig ausschliessen.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "alone",
      "synthetic-compositional-not-field-validation"
    ],
    "bindings": [
      {
        "kind": "SAME_PLACE",
        "factIds": [
          "f1",
          "f2"
        ]
      }
    ]
  },
  {
    "id": "advice-tobi-workspace-confidential-call",
    "family": "workspace-confidential-call",
    "split": "TEST",
    "domain": "alone",
    "query": "Ich möchte am Laptop arbeiten und danach in einem separaten Raum privat telefonieren. Tee wäre nett.",
    "goal": "Erst einen Arbeitsplatz nutzen, danach einen separat nutzbaren Raum zum privaten Telefonieren; Tee nur optional.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "coworking"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "offer.area",
        "value": {
          "text": "Privatraum"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "atmosphere.privacy",
        "value": {
          "text": "private Nutzung"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "privat telefonieren"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "a2"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "food.drink",
        "value": {
          "text": "Tee"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "work-then-private",
        "label": "Arbeiten und danach separat telefonieren",
        "purpose": "Eine private Gesprächsphase benötigt einen anderen Nutzungsbereich als der offene Arbeitsplatz.",
        "quotes": [
          "am Laptop arbeiten",
          "danach in einem separaten Raum privat telefonieren",
          "Tee wäre nett"
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Kann die Abfolge von Arbeitsplatz und privatem Raum tatsächlich gemeinsam erfüllt werden?"
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Ahorn",
        "category": "COMMUNITY_SOCIAL",
        "placeTypes": [
          "COWORKING_SPACE"
        ],
        "kind": "COWORKING",
        "areaKind": "WORKSPACE",
        "areas": [
          {
            "key": "desk",
            "kind": "WORKSPACE",
            "properties": [
              [
                "offer.feature",
                "Arbeitsplatz"
              ]
            ]
          },
          {
            "key": "room",
            "kind": "PRIVATE_ROOM",
            "properties": [
              [
                "location.setting",
                "Privatraum"
              ],
              [
                "atmosphere.privacy",
                "private Nutzung"
              ]
            ]
          }
        ],
        "offers": [
          {
            "key": "work",
            "kind": "COWORKING",
            "areaKey": "desk",
            "properties": [],
            "price": 0
          },
          {
            "key": "room",
            "kind": "ROOM_HIRE",
            "areaKey": "room",
            "properties": [],
            "price": 10
          }
        ],
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Arbeitsplatz und separater privat nutzbarer Raum sind unterschiedliche belegte Bereiche. Tee und tatsächliche zeitliche Buchbarkeit sind nicht belegt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Deine zwei Phasen bleiben getrennt: erst am Laptop arbeiten, danach separat privat telefonieren. Die Suche kann diese Abfolge noch nicht als zusammenhängenden Plan bestätigen; Tee bleibt optional.",
      "question": null,
      "caveat": "Die kanonische Suche unterstützt diese zeitliche Abfolge der zwei Nutzungsphasen noch nicht."
    },
    "wrong": {
      "text": "Ein offener Tisch mit WLAN reicht auch für dein privates Telefonat.",
      "why": "Ein Arbeitsplatz ersetzt den ausdrücklich verlangten separaten privaten Gesprächsraum nicht."
    },
    "why": "Zwei aufeinanderfolgende Nutzungsphasen an unterschiedlichen Bereichen erhalten; Getränkewunsch bleibt weich.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "alone",
      "synthetic-compositional-not-field-validation"
    ],
    "sequence": [
      1,
      2
    ]
  },
  {
    "id": "advice-tobi-solo-total-travel-window",
    "family": "solo-total-travel-window",
    "split": "TRAIN",
    "domain": "alone",
    "query": "Ich habe insgesamt vierzig Minuten, inklusive Hinweg und zurück. Ein kurzer Spaziergang wäre schön.",
    "goal": "Gesamtes Zeitfenster einschliesslich beider Wege erhalten.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "walk"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Gesamtes Zeitfenster einschliesslich beider Wege erhalten.",
        "purpose": "Gesamtes Zeitfenster einschliesslich beider Wege erhalten.",
        "quotes": [
          "Ich habe insgesamt vierzig Minuten, inklusive Hinweg und zurück. Ein kurzer Spaziergang wäre schön."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Ausgangspunkt und Gesamtwegezeit sind nicht belegt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Esche",
        "category": "OUTDOOR_NATURE",
        "kind": "WALK",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "CLARIFY",
      "venueKey": null,
      "text": "Die vierzig Minuten gelten insgesamt, einschliesslich Hin- und Rückweg. Ein kurzer Spaziergang bleibt eine mögliche Richtung.",
      "question": "Von wo startest du?",
      "caveat": "Auch mit bekanntem Ausgangspunkt müssen Hinweg, Aufenthalt und Rückweg innerhalb von insgesamt 40 Minuten noch geprüft werden; die Gesamtwegezeit ist nicht bestätigt."
    },
    "wrong": {
      "text": "Der Rundgang dauert vierzig Minuten, also passt er inklusive Anreise.",
      "why": "Zeit vor Ort ist nicht die genannte Gesamtzeit einschliesslich Hin- und Rückweg."
    },
    "why": "Zeit vor Ort ist nicht die genannte Gesamtzeit einschliesslich Hin- und Rückweg.",
    "expectedIssue": "NEEDS_CLARIFICATION",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "alone"
    ],
    "extensions": [
      "Hinweg, Aufenthalt und Rückweg dürfen zusammen höchstens 40 Minuten dauern"
    ],
    "missing": [
      {
        "dimension": "OTHER",
        "whyItMatters": "Ohne Ausgangspunkt lässt sich das gesamte Zeitfenster einschliesslich Hin- und Rückweg nicht prüfen."
      }
    ],
    "question": {
      "dimension": "OTHER",
      "question": "Von wo startest du?",
      "options": [
        "Bahnhof oder Haltestelle nennen",
        "Eine andere Startadresse nennen"
      ]
    },
    "planQuestion": "Von wo startest du?"
  },
  {
    "id": "advice-tobi-solo-new-tea",
    "family": "solo-new-tea",
    "split": "TRAIN",
    "domain": "alone",
    "query": "Mal einen Tee probieren, den ich noch nicht kenne. Die Sorte darfst du vorschlagen.",
    "goal": "Persönlich neue Sorte vorschlagen ohne unbekannte Teehistorie zu erfinden.",
    "facts": [
      {
        "key": "food.drink",
        "value": {
          "text": "Tee"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "Sortenwahl delegieren"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Persönlich neue Sorte vorschlagen ohne unbekannte Teehistorie zu erfinden.",
        "purpose": "Persönlich neue Sorte vorschlagen ohne unbekannte Teehistorie zu erfinden.",
        "quotes": [
          "Mal einen Tee probieren, den ich noch nicht kenne. Die Sorte darfst du vorschlagen."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Sortenangebot und persönliche Vorerfahrung fehlen."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Buche",
        "category": "RESTAURANT",
        "kind": "DRINKS",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.drink",
            "Tee"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Eine kleine Teeentdeckung wäre eine gute Richtung. Sortenangebot und persönliche Vorerfahrung fehlen.",
      "question": null,
      "caveat": "Sortenangebot und persönliche Vorerfahrung fehlen."
    },
    "wrong": {
      "text": "Diesen Tee hast du garantiert noch nie getrunken.",
      "why": "Sortenauswahl und persönliche Neuheit brauchen jeweils Informationen, die hier fehlen."
    },
    "why": "Sortenauswahl und persönliche Neuheit brauchen jeweils Informationen, die hier fehlen.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "alone"
    ],
    "uncertainties": [
      {
        "description": "Persönlich bekannte Teesorten sind nicht angegeben.",
        "relatedIds": []
      }
    ],
    "extensions": [
      "Die vorgeschlagene Teesorte muss für die Person persönlich bisher unbekannt sein"
    ]
  },
  {
    "id": "advice-tobi-solo-free-no-consumption",
    "family": "solo-free-no-consumption",
    "split": "VALIDATION",
    "domain": "alone",
    "query": "Zum Lesen brauche ich Ruhe, aber ich möchte nichts kaufen müssen.",
    "goal": "Funktionale Ruhe zum Lesen und Nutzung ohne Kaufpflicht erhalten.",
    "facts": [
      {
        "key": "experience.purpose",
        "value": {
          "text": "in Ruhe lesen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "atmosphere.noise",
        "value": {
          "text": "quiet"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Lesen ohne Kauf- oder Konsumzwang.",
        "purpose": "Lesen ohne Kauf- oder Konsumzwang.",
        "quotes": [
          "Zum Lesen brauche ich Ruhe, aber ich möchte nichts kaufen müssen."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Lesenutzung und fehlende Kaufpflicht sind nicht belegt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Holunder",
        "category": "MUSEUM",
        "kind": "SELF_GUIDED_VISIT",
        "areaKind": "EXHIBITION",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "atmosphere.noise",
            "ruhig"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein ruhiger frei nutzbarer Lesebereich wäre die Suchrichtung. Lesenutzung und fehlende Kaufpflicht sind nicht belegt.",
      "question": null,
      "caveat": "Lesenutzung und fehlende Kaufpflicht sind nicht belegt."
    },
    "wrong": {
      "text": "Bestell einfach einen Kaffee, dann ist der Besuch kostenlos.",
      "why": "Eine notwendige Bestellung widerspricht dem ausdrücklich ausgeschlossenen Kaufzwang."
    },
    "why": "Eine notwendige Bestellung widerspricht dem ausdrücklich ausgeschlossenen Kaufzwang.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "alone",
      "synthetic-compositional-not-field-validation"
    ],
    "extensions": [
      "Die gewünschte Lesenutzung muss ohne Kauf oder Konsumation möglich sein"
    ]
  },
  {
    "id": "advice-tobi-solo-short-museum-no-guide",
    "family": "solo-short-museum-no-guide",
    "split": "TRAIN",
    "domain": "alone",
    "query": "Allein ins Museum, in meinem Tempo und ohne Führung.",
    "goal": "Selbstbestimmter Museumsbesuch ohne Führungsformat.",
    "facts": [
      {
        "key": "offer.kind",
        "value": {
          "text": "MUSEUM"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "alone"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.format",
        "value": {
          "text": "guided"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Selbstbestimmter Museumsbesuch ohne Führungsformat.",
        "purpose": "Selbstbestimmter Museumsbesuch ohne Führungsformat.",
        "quotes": [
          "Allein ins Museum, in meinem Tempo und ohne Führung."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Ist die selbstständige Besuchsform ohne Führung tatsächlich belegt?"
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Lärche",
        "category": "MUSEUM",
        "kind": "SELF_GUIDED_VISIT",
        "areaKind": "EXHIBITION",
        "spotProperties": [],
        "offerProperties": [
          [
            "participation.format",
            "selbstständig"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein Museumsbesuch im eigenen Tempo wäre die passende Richtung. Die Suche bestätigt hier noch keinen konkreten Besuch ohne Führung.",
      "question": null,
      "caveat": "Das gewünschte selbstständige Teilnahmeformat bleibt in der kanonischen Suche unbestätigt."
    },
    "wrong": {
      "text": "Die geführte Gruppe ist zwingend besser, damit du nichts verpasst.",
      "why": "Informationsvollständigkeit rechtfertigt keine Umkehr des ausdrücklich gewählten Besuchsformats."
    },
    "why": "Informationsvollständigkeit rechtfertigt keine Umkehr des ausdrücklich gewählten Besuchsformats.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "alone"
    ]
  },
  {
    "id": "advice-tobi-delegate-two-open",
    "family": "delegate-two-open",
    "split": "TRAIN",
    "domain": "delegation",
    "query": "Für uns zwei in Basel, ich mag heute nichts planen. Such du etwas aus.",
    "goal": "Planung übernehmen ohne Paarstatus, Erwachsenenalter oder Erschöpfung zu erfinden.",
    "facts": [
      {
        "key": "people.count",
        "value": {
          "amount": 2,
          "operator": "EQ",
          "unit": "PEOPLE"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "gVisit"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "location.destination",
        "value": {
          "text": "Basel"
        },
        "modality": "REQUIRED",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "Planung delegieren"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "time.date",
        "value": {
          "date": "2026-11-12",
          "operator": "EQ",
          "timezone": "Europe/Zurich"
        },
        "modality": "REQUIRED",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Planung übernehmen ohne Paarstatus, Erwachsenenalter oder Erschöpfung zu erfinden.",
        "purpose": "Planung übernehmen ohne Paarstatus, Erwachsenenalter oder Erschöpfung zu erfinden.",
        "quotes": [
          "Für uns zwei in Basel, ich mag heute nichts planen. Such du etwas aus."
        ],
        "preferences": [],
        "evidenceQuestions": [],
        "activityIdea": {
          "key": "experience.activity",
          "value": "Minigolf"
        }
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Lärche",
        "category": "SPORT",
        "kind": "MINI_GOLF",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "offer.capacity",
            2
          ],
          [
            "participation.age_suitability",
            "Alle Altersgruppen"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Mein Vorschlag wäre eine Runde Minigolf: ein klarer kleiner Plan, den ihr nicht selbst organisieren müsst. Der Lernort belegt das Minigolfangebot und die nötige Kapazität für eure Zweiergruppe.",
      "question": null,
      "caveat": "Das ist eine mögliche Gestaltung, keine behauptete Vorliebe oder freie Buchung."
    },
    "wrong": {
      "text": "Weil ihr ein erschöpftes erwachsenes Paar seid, buche ich ein romantisches Dinner.",
      "why": "Weder Paarstatus noch Erwachsenenalter, körperliche Erschöpfung oder Romantik sind genannt."
    },
    "why": "Weder Paarstatus noch Erwachsenenalter, körperliche Erschöpfung oder Romantik sind genannt.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "delegation"
    ]
  },
  {
    "id": "advice-tobi-spontaneous-no-free-table-claim",
    "family": "spontaneous-no-free-table-claim",
    "split": "TRAIN",
    "domain": "delegation",
    "query": "Spontan noch etwas essen, reservieren möchte ich nicht müssen.",
    "goal": "Essen ohne Pflichtreservation, kein Versprechen eines freien Tisches.",
    "facts": [
      {
        "key": "food.meal",
        "value": {
          "text": "meal"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "participation.booking",
        "value": {
          "text": "spontaneous"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Essen ohne Pflichtreservation, kein Versprechen eines freien Tisches.",
        "purpose": "Essen ohne Pflichtreservation, kein Versprechen eines freien Tisches.",
        "quotes": [
          "Spontan noch etwas essen, reservieren möchte ich nicht müssen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Fichte",
        "category": "RESTAURANT",
        "kind": "DINNER",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "participation.booking",
            "Nicht erforderlich"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Der Lernort bietet Essen ohne Pflichtreservation. Das ist eine passende spontane Richtung; ob gerade ein Tisch frei ist, wurde nicht geprüft.",
      "question": null,
      "caveat": "Ein freier Tisch ist nicht bestätigt."
    },
    "wrong": {
      "text": "Keine Reservierung nötig heisst, dass sicher ein Tisch frei ist.",
      "why": "Buchungsmodus und aktuelle Verfügbarkeit sind unterschiedliche Informationen."
    },
    "why": "Buchungsmodus und aktuelle Verfügbarkeit sind unterschiedliche Informationen.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "delegation"
    ]
  },
  {
    "id": "advice-tobi-delegate-stop-anytime",
    "family": "family-short-exit",
    "split": "TEST",
    "domain": "delegation",
    "query": "Entscheide du etwas für den Feierabend. Wenn es uns nicht packt, wollen wir einfach wieder gehen können.",
    "goal": "Vorschlag mit einfacher Beendigung statt festem Programm.",
    "facts": [
      {
        "key": "experience.purpose",
        "value": {
          "text": "Feierabendauswahl delegieren"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Vorschlag mit einfacher Beendigung statt festem Programm.",
        "purpose": "Vorschlag mit einfacher Beendigung statt festem Programm.",
        "quotes": [
          "Entscheide du etwas für den Feierabend. Wenn es uns nicht packt, wollen wir einfach wieder gehen können."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Nutzungsbedingungen und mögliche feste Teilnahmebindung fehlen."
        ],
        "activityIdea": {
          "key": "experience.activity",
          "value": "walk"
        }
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Kiefer",
        "category": "OUTDOOR_NATURE",
        "kind": "WALK",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Ein kurzer Spaziergang wäre eine vorläufige Idee mit leichtem Einstieg. Nutzungsbedingungen und mögliche feste Teilnahmebindung fehlen.",
      "question": null,
      "caveat": "Nutzungsbedingungen und mögliche feste Teilnahmebindung fehlen."
    },
    "wrong": {
      "text": "Ich empfehle eine Veranstaltung mit verpflichtender Teilnahme bis zum Ende.",
      "why": "Delegation hebt den ausdrücklich gewünschten einfachen Ausstieg nicht auf."
    },
    "why": "Delegation hebt den ausdrücklich gewünschten einfachen Ausstieg nicht auf.",
    "expectedIssue": "LIBRARIAN_CAPABILITY",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "delegation",
      "synthetic-compositional-not-field-validation"
    ],
    "extensions": [
      "Die Teilnahme muss jederzeit ohne feste Programmbindung beendet werden können"
    ]
  },
  {
    "id": "advice-tobi-delegate-transit-tea",
    "family": "delegate-transit-tea",
    "split": "TEST",
    "domain": "delegation",
    "query": "Am SBB auf jemanden warten und einen Tee trinken. Such du einen Ort, ich will nicht weit weg.",
    "goal": "Warten mit Tee nahe dem genannten Bahnhof; keine willkürliche Distanzzahl.",
    "facts": [
      {
        "key": "food.drink",
        "value": {
          "text": "Tee"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "location.area",
        "value": {
          "text": "nahe Basel SBB"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "warten und Ortsauswahl delegieren"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Warten mit Tee nahe dem genannten Bahnhof; keine willkürliche Distanzzahl.",
        "purpose": "Warten mit Tee nahe dem genannten Bahnhof; keine willkürliche Distanzzahl.",
        "quotes": [
          "Am SBB auf jemanden warten und einen Tee trinken. Such du einen Ort, ich will nicht weit weg."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Nähe zum Bahnhof ist nicht bestätigt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Weide",
        "category": "RESTAURANT",
        "kind": "DRINKS",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.drink",
            "Tee"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Eine Teepause nahe Basel SBB wäre die Richtung. Nähe zum Bahnhof ist nicht bestätigt.",
      "question": null,
      "caveat": "Nähe zum Bahnhof ist nicht bestätigt."
    },
    "wrong": {
      "text": "Irgendein Teeangebot in Basel liegt automatisch direkt beim SBB.",
      "why": "Eine Stadtzuordnung beweist keine Bahnhofsnähe."
    },
    "why": "Eine Stadtzuordnung beweist keine Bahnhofsnähe.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "delegation",
      "synthetic-compositional-not-field-validation"
    ]
  },
  {
    "id": "advice-tobi-delegate-unknown-friend-taste",
    "family": "delegate-unknown-friend-taste",
    "split": "TRAIN",
    "domain": "delegation",
    "query": "Such für meinen Freund etwas zum Abschalten. Seine Hobbys kenne ich nicht gut.",
    "goal": "Eine entlastende Idee anbieten ohne unbekannte Hobbys vorauszusetzen.",
    "facts": [
      {
        "key": "people.relationship",
        "value": {
          "text": "Freund"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "Abschalten und Auswahl delegieren"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.character",
        "value": {
          "text": "zum Abschalten"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Eine entlastende Idee anbieten ohne unbekannte Hobbys vorauszusetzen.",
        "purpose": "Eine entlastende Idee anbieten ohne unbekannte Hobbys vorauszusetzen.",
        "quotes": [
          "Such für meinen Freund etwas zum Abschalten. Seine Hobbys kenne ich nicht gut."
        ],
        "preferences": [
          {
            "key": "atmosphere.character",
            "value": "relaxed"
          }
        ],
        "evidenceQuestions": [],
        "activityIdea": {
          "key": "food.drink",
          "value": "drinks"
        }
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Esche",
        "category": "RESTAURANT",
        "kind": "DRINKS",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.drink",
            "drinks"
          ]
        ],
        "areaProperties": [
          [
            "atmosphere.character",
            "entspannt"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "SUGGEST",
      "venueKey": "venue-a",
      "text": "Eine Getränkepause in entspannter Atmosphäre wäre meine vorläufige Idee zum Abschalten. Der Lernort belegt Getränke und diese Atmosphäre; ein bestätigtes Hobby deines Freundes ist das nicht.",
      "question": null,
      "caveat": "Ob ihm diese Idee persönlich gefällt, ist offen."
    },
    "wrong": {
      "text": "Welche seiner Hobbys liebt er am meisten? Ohne Antwort geht nichts.",
      "why": "Explizit unbekanntes Wissen sollte nicht als zwingende Rückfrage erneut verlangt werden."
    },
    "why": "Explizit unbekanntes Wissen sollte nicht als zwingende Rückfrage erneut verlangt werden.",
    "expectedIssue": "NONE",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "delegation"
    ],
    "uncertainties": [
      {
        "description": "Hobbys und konkrete Vorlieben des Freundes sind nicht bekannt.",
        "relatedIds": []
      }
    ]
  },
  {
    "id": "advice-tobi-ask-one-choice-question",
    "family": "ask-one-choice-question",
    "split": "TRAIN",
    "domain": "delegation",
    "query": "Ich komme auf keine Idee. Stell mir eine Frage, ob eher rausgehen oder etwas drinnen machen.",
    "goal": "Die ausdrücklich gewünschte einzelne Richtungsfrage stellen.",
    "facts": [
      {
        "key": "experience.purpose",
        "value": {
          "text": "Richtung durch eine Rückfrage klären"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Die ausdrücklich gewünschte einzelne Richtungsfrage stellen.",
        "purpose": "Die ausdrücklich gewünschte einzelne Richtungsfrage stellen.",
        "quotes": [
          "Ich komme auf keine Idee. Stell mir eine Frage, ob eher rausgehen oder etwas drinnen machen."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Esche",
        "category": "OUTDOOR_NATURE",
        "kind": "WALK",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "CLARIFY",
      "venueKey": null,
      "text": "Wir können mit genau dieser einen Entscheidung anfangen.",
      "question": "Möchtest du eher rausgehen oder heute etwas drinnen machen?",
      "caveat": null
    },
    "wrong": {
      "text": "Ich lege mich ohne Rückfrage auf eine Ausstellung fest.",
      "why": "Bewusst erbetene Entscheidungshilfe ist keine Delegation einer stillen Auswahl."
    },
    "why": "Bewusst erbetene Entscheidungshilfe ist keine Delegation einer stillen Auswahl.",
    "expectedIssue": "NEEDS_CLARIFICATION",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "delegation"
    ],
    "missing": [
      {
        "dimension": "EXPERIENCE_DIRECTION",
        "whyItMatters": "Die Person bittet um genau diese Richtungsentscheidung."
      }
    ],
    "question": {
      "dimension": "EXPERIENCE_DIRECTION",
      "question": "Möchtest du eher rausgehen oder heute etwas drinnen machen?",
      "options": [
        "Rausgehen",
        "Drinnen etwas machen"
      ]
    }
  },
  {
    "id": "advice-tobi-favourite-pizza-not-venue",
    "family": "favourite-pizza-not-venue",
    "split": "TRAIN",
    "domain": "familiar",
    "query": "Heute einfach wieder meine Lieblingspizza. Neues brauche ich nicht.",
    "goal": "Vertrautes Gericht ohne erfundenen Lieblingsort.",
    "facts": [
      {
        "key": "food.dish",
        "value": {
          "text": "Pizza"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "vertraute Lieblingspizza wieder essen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "time.date",
        "value": {
          "date": "2026-11-12",
          "operator": "EQ",
          "timezone": "Europe/Zurich"
        },
        "modality": "REQUIRED",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Vertrautes Gericht ohne erfundenen Lieblingsort.",
        "purpose": "Vertrautes Gericht ohne erfundenen Lieblingsort.",
        "quotes": [
          "Heute einfach wieder meine Lieblingspizza. Neues brauche ich nicht."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Persönlicher Gerichtsbezug fehlt."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Ahorn",
        "category": "RESTAURANT",
        "kind": "DINNER",
        "areaKind": "INDOOR",
        "spotProperties": [],
        "offerProperties": [
          [
            "food.dish",
            "Pizza"
          ]
        ],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "CLARIFY",
      "venueKey": null,
      "text": "Ich suche nach deiner vertrauten Lieblingspizza; dafür brauche ich noch den konkreten Bezug.",
      "question": "Welche Pizza meinst du mit deiner Lieblingspizza – eine bestimmte Sorte oder die Pizza eines bestimmten Ortes?",
      "caveat": "Ob ein Angebot deiner persönlichen Lieblingspizza entspricht, ist noch nicht bestätigt."
    },
    "wrong": {
      "text": "Dein Stammrestaurant ist bestimmt dieser Lernort, du warst dort schon oft.",
      "why": "Ein Lieblingsgericht beweist weder eine konkrete Adresse noch Besuchshistorie."
    },
    "why": "Ein Lieblingsgericht beweist weder eine konkrete Adresse noch Besuchshistorie.",
    "expectedIssue": "NEEDS_CLARIFICATION",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "familiar"
    ],
    "extensions": [
      "Die Pizza soll der persönlich vertrauten Lieblingspizza entsprechen"
    ],
    "uncertainties": [
      {
        "description": "Welche Pizza die persönliche Lieblingspizza ist, wurde nicht angegeben.",
        "relatedIds": []
      }
    ],
    "missing": [
      {
        "dimension": "OTHER",
        "whyItMatters": "Der persönliche Bezug zur Lieblingspizza ist noch nicht bekannt."
      }
    ],
    "question": {
      "dimension": "OTHER",
      "question": "Welche Pizza meinst du mit deiner Lieblingspizza – eine bestimmte Sorte oder die Pizza eines bestimmten Ortes?",
      "options": [
        "Eine bestimmte Sorte",
        "Die Pizza eines bestimmten Ortes"
      ]
    },
    "planQuestion": "Welche Pizza meinst du mit deiner Lieblingspizza – eine bestimmte Sorte oder die Pizza eines bestimmten Ortes?"
  },
  {
    "id": "advice-tobi-familiar-minigolf-memory",
    "family": "familiar-minigolf-memory",
    "split": "TRAIN",
    "domain": "familiar",
    "query": "Noch mal dorthin, wo wir letztes Mal Minigolf gespielt haben. Das war schön.",
    "goal": "Bekannten positiven Besuch aufgreifen, Adresse nicht erraten.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "Minigolf"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "schönen früheren Minigolfbesuch wiederholen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Bekannten positiven Besuch aufgreifen, Adresse nicht erraten.",
        "purpose": "Bekannten positiven Besuch aufgreifen, Adresse nicht erraten.",
        "quotes": [
          "Noch mal dorthin, wo wir letztes Mal Minigolf gespielt haben. Das war schön."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Eiche",
        "category": "SPORT",
        "kind": "MINI_GOLF",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "CLARIFY",
      "venueKey": null,
      "text": "Den schönen Minigolfbesuch zu wiederholen ist eine gute Richtung. Welcher Ort das war, ist hier nicht bekannt.",
      "question": "Wie hiess der Ort, an dem ihr letztes Mal Minigolf gespielt habt?",
      "caveat": null
    },
    "wrong": {
      "text": "Ich erinnere mich, das war der Lernort; dort seid ihr letztes Mal gewesen.",
      "why": "Eine positive Erinnerung im Nutzertext bestätigt keine konkrete Adresse im System."
    },
    "why": "Eine positive Erinnerung im Nutzertext bestätigt keine konkrete Adresse im System.",
    "expectedIssue": "NEEDS_CLARIFICATION",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "familiar"
    ],
    "extensions": [
      "Erneuter Besuch am Ort des letzten gemeinsamen Minigolfspiels"
    ],
    "uncertainties": [
      {
        "description": "Der Ort des letzten Minigolfbesuchs ist nicht angegeben.",
        "relatedIds": []
      }
    ],
    "missing": [
      {
        "dimension": "OTHER",
        "whyItMatters": "Eine positive Erinnerung im Nutzertext bestätigt keine konkrete Adresse im System."
      }
    ],
    "question": {
      "dimension": "OTHER",
      "question": "Wie hiess der Ort, an dem ihr letztes Mal Minigolf gespielt habt?",
      "options": [
        "Ort nennen",
        "Auch für ähnliche Orte offen"
      ]
    }
  },
  {
    "id": "advice-tobi-familiar-cafe-other-activity",
    "family": "familiar-cafe-other-activity",
    "split": "TRAIN",
    "domain": "familiar",
    "query": "Unser Stammcafé wäre schön, aber diesmal möchte ich dort ein Buch lesen statt Kaffee trinken.",
    "goal": "Vertrauten Caféwunsch mit anderer Tätigkeit erhalten.",
    "facts": [
      {
        "key": "offer.kind",
        "value": {
          "text": "CAFE"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "ein Buch lesen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "food.drink",
        "value": {
          "text": "coffee"
        },
        "modality": "EXCLUDED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Vertrauten Caféwunsch mit anderer Tätigkeit erhalten.",
        "purpose": "Vertrauten Caféwunsch mit anderer Tätigkeit erhalten.",
        "quotes": [
          "Unser Stammcafé wäre schön, aber diesmal möchte ich dort ein Buch lesen statt Kaffee trinken."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Stammortbezug und Bedingungen der gewünschten Nutzung sind offen."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Eibe",
        "category": "RESTAURANT",
        "kind": "CAFE",
        "areaKind": "CAFE",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "PARTIAL",
      "venueKey": null,
      "text": "Lesen im vertrauten Café wäre eine passende Idee. Stammortbezug und Bedingungen der gewünschten Nutzung sind offen.",
      "question": null,
      "caveat": "Stammortbezug und Bedingungen der gewünschten Nutzung sind offen."
    },
    "wrong": {
      "text": "Ein Café muss Kaffee verkaufen, deshalb darfst du dort nicht lesen.",
      "why": "Das Angebot anderer Konsumoptionen ist nicht dasselbe wie eine Pflicht zum eigenen Kaffeekonsum."
    },
    "why": "Das Angebot anderer Konsumoptionen ist nicht dasselbe wie eine Pflicht zum eigenen Kaffeekonsum.",
    "expectedIssue": "SPOT_DATA",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "familiar"
    ],
    "extensions": [
      {
        "description": "Bevorzugt das persönliche Stammcafé",
        "modality": "PREFERRED"
      }
    ],
    "uncertainties": [
      {
        "description": "Das persönliche Stammcafé ist nicht angegeben.",
        "relatedIds": []
      }
    ]
  },
  {
    "id": "advice-tobi-familiar-family-zoo-return",
    "family": "familiar-family-zoo-return",
    "split": "TRAIN",
    "domain": "familiar",
    "query": "Die Kinder wollen wieder in denselben Tierpark wie letztes Jahr. Uns geht es ums Wiedererkennen.",
    "goal": "Wiedererkennen als Familienziel statt automatischem Neuheitsbonus.",
    "facts": [
      {
        "key": "experience.activity",
        "value": {
          "text": "animals"
        },
        "modality": "REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "Kinder"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "people.relationship",
        "value": {
          "text": "adult_accompanied"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "INFERRED"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "gemeinsames Wiedererkennen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Wiedererkennen als Familienziel statt automatischem Neuheitsbonus.",
        "purpose": "Wiedererkennen als Familienziel statt automatischem Neuheitsbonus.",
        "quotes": [
          "Die Kinder wollen wieder in denselben Tierpark wie letztes Jahr. Uns geht es ums Wiedererkennen."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Identität des früheren Orts, Kinderalter und heutige Nutzbarkeit sind offen."
        ]
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Birke",
        "category": "ZOO",
        "kind": "ANIMAL_OBSERVATION",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "CLARIFY",
      "venueKey": null,
      "text": "Fürs Wiedererkennen suche ich gezielt nach demselben Tierpark.",
      "question": "Welcher Tierpark war das letztes Jahr?",
      "caveat": "Die Identität des bisherigen Orts und seine heutige Nutzbarkeit sind noch nicht bestätigt."
    },
    "wrong": {
      "text": "Ein völlig neuer Tierpark ist automatisch besser, weil Entdeckung immer Vorrang hat.",
      "why": "Der ausdrücklich priorisierte vertraute Moment darf nicht durch Neuheitsoptimierung ersetzt werden."
    },
    "why": "Der ausdrücklich priorisierte vertraute Moment darf nicht durch Neuheitsoptimierung ersetzt werden.",
    "expectedIssue": "NEEDS_CLARIFICATION",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "familiar"
    ],
    "extensions": [
      "Besuch desselben Tierparks wie im Vorjahr"
    ],
    "uncertainties": [
      {
        "description": "Der Tierpark des Vorjahres ist nicht identifiziert.",
        "relatedIds": []
      }
    ],
    "missing": [
      {
        "dimension": "OTHER",
        "whyItMatters": "Für den erneuten Besuch desselben Tierparks fehlt dessen Identität."
      }
    ],
    "question": {
      "dimension": "OTHER",
      "question": "Welcher Tierpark war das letztes Jahr?",
      "options": [
        "Name des Tierparks nennen",
        "Den Tierpark anhand eines Merkmals beschreiben"
      ]
    },
    "planQuestion": "Welcher Tierpark war das letztes Jahr?"
  },
  {
    "id": "advice-tobi-familiar-feeling-new-address",
    "family": "familiar-feeling-new-address",
    "split": "TRAIN",
    "domain": "familiar",
    "query": "Ein anderer Ort als mein übliches Café, aber dieses gemütliche Gefühl möchte ich wieder haben.",
    "goal": "Anderen Ort als das übliche Café mit vertraut gemütlichem Gefühl finden; Café nur als eigene Suchidee.",
    "facts": [
      {
        "key": "atmosphere.character",
        "value": {
          "text": "cozy"
        },
        "modality": "PREFERRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Ein anderer gemütlicher Ort",
        "purpose": "Anderen Ort als das übliche Café mit vertraut gemütlichem Gefühl finden; Café nur als eigene Suchidee.",
        "quotes": [
          "Ein anderer Ort als mein übliches Café, aber dieses gemütliche Gefühl möchte ich wieder haben."
        ],
        "preferences": [],
        "evidenceQuestions": [
          "Abgrenzung zum üblichen Café ist noch nicht möglich."
        ],
        "activityIdea": {
          "key": "offer.kind",
          "value": "CAFE"
        }
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Eiche",
        "category": "RESTAURANT",
        "kind": "CAFE",
        "areaKind": "CAFE",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [
          [
            "atmosphere.character",
            "gemütlich"
          ]
        ],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "CLARIFY",
      "venueKey": null,
      "text": "Ein anderer gemütlicher Ort ist die Suchrichtung; dafür muss ich dein übliches Café abgrenzen können.",
      "question": "Welches übliche Café soll ich bei der Suche ausschliessen?",
      "caveat": "Die Abgrenzung zum persönlich üblichen Café ist noch nicht bestätigt."
    },
    "wrong": {
      "text": "Für ein vertrautes Gefühl musst du zwingend wieder ins gleiche Café.",
      "why": "Vertrautheit der Atmosphäre und Identität des Orts sind verschiedene Wünsche."
    },
    "why": "Vertrautheit der Atmosphäre und Identität des Orts sind verschiedene Wünsche.",
    "expectedIssue": "NEEDS_CLARIFICATION",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "familiar"
    ],
    "extensions": [
      "Ein anderer Ort als das persönliche übliche Café"
    ],
    "uncertainties": [
      {
        "description": "Das übliche Café ist nicht genannt.",
        "relatedIds": []
      }
    ],
    "missing": [
      {
        "dimension": "OTHER",
        "whyItMatters": "Ohne den bisherigen Ort kann ich nicht prüfen, ob ein Vorschlag wirklich ein anderer Ort ist."
      }
    ],
    "question": {
      "dimension": "OTHER",
      "question": "Welches übliche Café soll ich bei der Suche ausschliessen?",
      "options": [
        "Name des Cafés nennen",
        "Das Café anhand seiner Lage beschreiben"
      ]
    },
    "planQuestion": "Welches übliche Café soll ich bei der Suche ausschliessen?"
  },
  {
    "id": "advice-tobi-familiar-shared-story-question",
    "family": "familiar-shared-story-question",
    "split": "VALIDATION",
    "domain": "familiar",
    "query": "Mit meinem Bruder etwas machen, das an unsere Kindheit erinnert. Es muss nichts Besonderes kosten.",
    "goal": "Persönlichen Bezug konkretisieren statt irgendeine Ortsgeschichte aufzusetzen.",
    "facts": [
      {
        "key": "people.relationship",
        "value": {
          "text": "Bruder"
        },
        "modality": "CONTEXT",
        "subjectIds": [
          "p1"
        ],
        "basis": "EXPLICIT"
      },
      {
        "key": "experience.purpose",
        "value": {
          "text": "gemeinsame Kindheitserinnerung aufgreifen"
        },
        "modality": "CONTEXT",
        "subjectIds": [],
        "basis": "EXPLICIT"
      },
      {
        "key": "budget.qualitative",
        "value": {
          "text": "teuer"
        },
        "modality": "NOT_REQUIRED",
        "subjectIds": [
          "a1"
        ],
        "basis": "EXPLICIT"
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "label": "Persönlichen Bezug konkretisieren statt irgendeine Ortsgeschichte aufzusetzen.",
        "purpose": "Persönlichen Bezug konkretisieren statt irgendeine Ortsgeschichte aufzusetzen.",
        "quotes": [
          "Mit meinem Bruder etwas machen, das an unsere Kindheit erinnert. Es muss nichts Besonderes kosten."
        ],
        "preferences": [],
        "evidenceQuestions": []
      }
    ],
    "venues": [
      {
        "key": "venue-a",
        "name": "Lernort Esche",
        "category": "SPORT",
        "kind": "MINI_GOLF",
        "areaKind": "OUTDOOR",
        "spotProperties": [],
        "offerProperties": [],
        "areaProperties": [],
        "note": "SYNTHETIC: Angebot und genannte Eigenschaften sind Autorenbelege. Nicht genannte Eigenschaften und persönliche Besuchshistorie bleiben unbestätigt."
      }
    ],
    "response": {
      "mode": "CLARIFY",
      "venueKey": null,
      "text": "Eine gemeinsame Kindheitserinnerung könnte die Auswahl wirklich tragen. Mir fehlt noch, welche Tätigkeit oder welcher Ort euch beide damit verbindet.",
      "question": "Gibt es eine Tätigkeit oder einen Ort aus eurer Kindheit, an den ihr beide gern zurückdenkt?",
      "caveat": null
    },
    "wrong": {
      "text": "Dieser Ort ist alt, deshalb hat er automatisch eine persönliche Bedeutung für euch.",
      "why": "Historisches Alter des Orts beweist keine Verbindung zur gemeinsamen Biografie."
    },
    "why": "Historisches Alter des Orts beweist keine Verbindung zur gemeinsamen Biografie.",
    "expectedIssue": "NEEDS_CLARIFICATION",
    "tags": [
      "SYNTHETIC",
      "fictional-reviewer",
      "tobi",
      "familiar",
      "synthetic-compositional-not-field-validation"
    ],
    "missing": [
      {
        "dimension": "OTHER",
        "whyItMatters": "Historisches Alter des Orts beweist keine Verbindung zur gemeinsamen Biografie."
      }
    ],
    "question": {
      "dimension": "OTHER",
      "question": "Gibt es eine Tätigkeit oder einen Ort aus eurer Kindheit, an den ihr beide gern zurückdenkt?",
      "options": [
        "Eine gemeinsame Tätigkeit",
        "Ein bestimmter Ort",
        "Noch kein konkreter Bezug"
      ]
    }
  }
];
